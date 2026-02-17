require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const socketio = require('socket.io');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

// Import routes and models
const { router: authRouter, authenticateToken } = require('./routes/auth');
const friendsRouter = require('./routes/friends');
const User = require('./models/User');
const WalkSession = require('./models/WalkSession');
const LocationHistory = require('./models/LocationHistory');
const SOSAlert = require('./models/SOSAlert');

const app = express();
const sslKeyPath = process.env.SSL_KEY_PATH;
const sslCertPath = process.env.SSL_CERT_PATH;

let server;
let serverProtocol = 'http';
if (sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    const sslOptions = {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath)
    };
    server = https.createServer(sslOptions, app);
    serverProtocol = 'https';
} else {
    server = http.createServer(app);
}

const allowedOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsConfig = allowedOrigins.length > 0
    ? { origin: allowedOrigins, credentials: true }
    : { origin: '*', credentials: false };

const io = socketio(server, {
    cors: {
        origin: corsConfig.origin,
        credentials: corsConfig.credentials,
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(helmet({
    hsts: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "http:", "https:", "data:", "blob:"],
            "style-src": ["'self'", "'unsafe-inline'", "http:", "https:"],
            "img-src": [
                "'self'",
                "data:",
                "blob:",
                "http:",
                "https:",
                "https://*.tile.openstreetmap.org",
                "https://raw.githubusercontent.com"
            ],
            "connect-src": ["'self'", "ws:", "wss:", "http:", "https:"]
        }
    }
}));
app.use(cors(corsConfig));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set("view engine", "ejs");
app.set('views', path.join(__dirname, 'views'));

// Store connected users and their socket mappings
const connectedUsers = new Map(); // userId -> socketId
const socketUsers = new Map(); // socketId -> userId
const userSockets = new Map(); // userId -> [socketIds]
const guestUsers = new Map(); // socketId -> { username, location }
const guestWalkSessions = new Map(); // socketId -> { friends, destination }

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/safetrack')
.then(() => {
    console.log('✅ MongoDB Connected');
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/friends', friendsRouter);

// Serve main page
app.get('/', (req, res) => {
    res.render('index');
});

// Protected routes (require authentication)
app.get('/dashboard', authenticateToken, (req, res) => {
    res.render('dashboard');
});

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            socket.isGuest = true;
            socket.userId = `guest:${socket.id}`;
            socket.username = 'Guest';
            socket.email = null;
            return next();
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        
        // Get user from database
        const user = await User.findById(decoded.userId);
        if (!user) {
            return next(new Error('User not found'));
        }

        socket.userId = user._id.toString();
        socket.username = user.username;
        socket.email = user.email;
        socket.isGuest = false;
        
        next();
    } catch (err) {
        next(new Error('Authentication failed'));
    }
});

// Socket.IO Connection
io.on("connection", function(socket) {
    console.log(`✅ User connected: ${socket.username} (${socket.userId}) - Socket: ${socket.id}`);

    if (socket.isGuest) {
        guestUsers.set(socket.id, {
            username: socket.username,
            location: null
        });
    }
    
    // Store user connections
    if (!socket.isGuest) {
        connectedUsers.set(socket.userId, socket.id);
        socketUsers.set(socket.id, socket.userId);
    }
    
    // Update user online status
    if (!socket.isGuest) {
        User.findByIdAndUpdate(socket.userId, { 
            isOnline: true, 
            lastSeen: new Date(),
            socketId: socket.id 
        }).catch(err => console.error('Error updating user status:', err));
    }
    
    // Add to user sockets array (for multiple devices)
    if (!socket.isGuest) {
        if (!userSockets.has(socket.userId)) {
            userSockets.set(socket.userId, []);
        }
        userSockets.get(socket.userId).push(socket.id);
    }
    
    // Send current user data
    socket.emit('user-connected', {
        userId: socket.userId,
        username: socket.username,
        email: socket.email
    });
    
    // Send online friends list
    if (!socket.isGuest) {
        sendOnlineFriends(socket);
    }

    // Simple guest-mode events
    socket.on('user-joined', (data) => {
        const username = (data?.username || socket.username || 'Guest').toString().trim();
        socket.username = username || 'Guest';
        guestUsers.set(socket.id, {
            username: socket.username,
            location: guestUsers.get(socket.id)?.location || null
        });
        io.emit('users-list', Array.from(guestUsers.entries()).map(([id, user]) => ({
            id,
            username: user.username,
            location: user.location
        })));
    });

    socket.on('get-users', () => {
        socket.emit('users-list', Array.from(guestUsers.entries()).map(([id, user]) => ({
            id,
            username: user.username,
            location: user.location
        })));
    });

    socket.on('location-update', (payload) => {
        const username = payload?.username || socket.username || 'Guest';
        const location = payload?.location || null;
        guestUsers.set(socket.id, { username, location });
        io.emit('location-update', { id: socket.id, username, location });

        // Broadcast walk mode location to selected friends for guest mode
        const guestWalk = guestWalkSessions.get(socket.id);
        if (guestWalk && location) {
            guestWalk.friends.forEach((friendSocketId) => {
                io.to(friendSocketId).emit('walk-mode-location-update', {
                    walkerId: socket.id,
                    username,
                    destination: guestWalk.destination,
                    location
                });
            });
        }
    });

    socket.on('chat-message', (message) => {
        io.emit('chat-message', {
            username: message?.username || socket.username || 'Guest',
            message: message?.message || '',
            timestamp: message?.timestamp || Date.now()
        });
    });

    socket.on('sos-alert', (data) => {
        io.emit('sos-alert', {
            username: data?.username || socket.username || 'Guest',
            location: data?.location || null,
            timestamp: data?.timestamp || Date.now()
        });
    });

    socket.on('walk-mode-start', async (data) => {
        // Guest walk-mode flow
        if (socket.isGuest) {
            const friends = Array.isArray(data?.friends) ? data.friends : [];
            const destination = data?.destination || 'Destination';
            guestWalkSessions.set(socket.id, { friends, destination });
            friends.forEach((friendSocketId) => {
                io.to(friendSocketId).emit('walk-mode-added-you', {
                    walkerId: socket.id,
                    walkerName: data?.username || socket.username || 'Guest',
                    destination
                });
                if (data?.location) {
                    io.to(friendSocketId).emit('walk-mode-location-update', {
                        walkerId: socket.id,
                        username: data?.username || socket.username || 'Guest',
                        destination,
                        location: data.location
                    });
                }
            });
            return;
        }
    });

    socket.on('walk-mode-location', (data) => {
        if (!socket.isGuest) return;
        const guestWalk = guestWalkSessions.get(socket.id);
        if (!guestWalk) return;
        const location = data?.location || null;
        if (!location) return;
        guestWalk.friends.forEach((friendSocketId) => {
            io.to(friendSocketId).emit('walk-mode-location-update', {
                walkerId: socket.id,
                username: socket.username || 'Guest',
                destination: guestWalk.destination,
                location
            });
        });
    });

    socket.on('walk-mode-complete', (data) => {
        if (!socket.isGuest) return;
        const guestWalk = guestWalkSessions.get(socket.id);
        if (!guestWalk) return;
        guestWalk.friends.forEach((friendSocketId) => {
            io.to(friendSocketId).emit('walk-mode-ended', {
                walkerId: socket.id,
                walkerName: socket.username || 'Guest',
                status: data?.status || 'safe'
            });
        });
        guestWalkSessions.delete(socket.id);
    });

    socket.on('walk-mode-emergency', (data) => {
        if (!socket.isGuest) return;
        const guestWalk = guestWalkSessions.get(socket.id);
        if (!guestWalk) return;
        guestWalk.friends.forEach((friendSocketId) => {
            io.to(friendSocketId).emit('walk-mode-emergency-received', {
                walkerId: socket.id,
                walkerName: socket.username || 'Guest',
                message: data?.message || `${socket.username} needs help`,
                type: data?.type || 'manual',
                location: data?.location || null
            });
        });
    });
    
    // Handle location updates
    socket.on('send-location', async (data) => {
        if (socket.isGuest) return;
        try {
            const { latitude, longitude, accuracy, speed, heading } = data;
            
            // Update user's last location
            await User.findByIdAndUpdate(socket.userId, {
                lastLocation: {
                    latitude,
                    longitude,
                    timestamp: new Date(),
                    accuracy,
                    speed
                }
            });
            
            // Save to location history
            const locationEntry = new LocationHistory({
                user: socket.userId,
                location: {
                    latitude,
                    longitude,
                    accuracy,
                    speed,
                    heading
                },
                source: 'gps',
                sessionData: {
                    socketId: socket.id,
                    isActive: true,
                    lastHeartbeat: new Date()
                }
            });
            await locationEntry.save();
            
            // Broadcast to friends
            const user = await User.findById(socket.userId).populate('friends');
            const friends = user.friends || [];
            
            for (const friend of friends) {
                const friendSocketIds = userSockets.get(friend._id.toString());
                if (friendSocketIds) {
                    for (const friendSocketId of friendSocketIds) {
                        io.to(friendSocketId).emit('location-update', {
                            userId: socket.userId,
                            username: socket.username,
                            location: { latitude, longitude, accuracy, speed }
                        });
                    }
                }
            }
            
        } catch (error) {
            console.error('Location update error:', error);
            socket.emit('error', { message: 'Failed to update location' });
        }
    });
    
    // Walk-Me-Home Events
    socket.on('walk-mode-start', async (data) => {
        if (socket.isGuest) return;
        try {
            const { friends, destination } = data;
            
            // Validate that these are actually the user's friends
            const user = await User.findById(socket.userId).populate('friends');
            const userFriendIds = user.friends.map(f => f._id.toString());
            
            // Check if all provided friend IDs are actually friends
            const invalidFriends = friends.filter(friendId => !userFriendIds.includes(friendId));
            if (invalidFriends.length > 0) {
                return socket.emit('error', { message: 'Invalid friends selected' });
            }
            
            // Create walk session
            const walkSession = new WalkSession({
                user: socket.userId,
                trustedFriends: friends,
                destination: destination,
                status: 'active'
            });
            await walkSession.save();
            
            // Store session ID in socket
            socket.walkSessionId = walkSession._id.toString();
            
            // Notify selected friends
            for (const friendId of friends) {
                const friendSocketIds = userSockets.get(friendId);
                if (friendSocketIds) {
                    for (const friendSocketId of friendSocketIds) {
                        io.to(friendSocketId).emit('walk-mode-added-you', {
                            walkerId: socket.userId, // Stable MongoDB _id
                            walkerName: socket.username,
                            destination: destination,
                            sessionId: walkSession._id
                        });
                    }
                }
            }
            
            socket.emit('walk-mode-started', {
                sessionId: walkSession._id,
                message: 'Walk mode started successfully'
            });
            
            console.log(`🚶‍♀️ ${socket.username} started walk mode with ${friends.length} friends`);
            
        } catch (error) {
            console.error('Walk mode start error:', error);
            socket.emit('error', { message: 'Failed to start walk mode' });
        }
    });
    
    socket.on('walk-mode-location', async (data) => {
        if (socket.isGuest) return;
        try {
            if (!socket.walkSessionId) return;
            
            const walkSession = await WalkSession.findById(socket.walkSessionId);
            if (!walkSession || walkSession.status !== 'active') return;
            
            // Add location to path
            await walkSession.addLocation(data.location.lat, data.location.lng, {
                accuracy: data.location.accuracy,
                speed: data.location.speed
            });
            
            // Send to trusted friends
            for (const friendId of walkSession.trustedFriends) {
                const friendSocketIds = userSockets.get(friendId.toString());
                if (friendSocketIds) {
                    for (const friendSocketId of friendSocketIds) {
                        io.to(friendSocketId).emit('walk-mode-location-update', {
                            walkerId: socket.userId, // Same MongoDB _id
                            username: socket.username,
                            location: data.location,
                            sessionId: walkSession._id
                        });
                    }
                }
            }
            
        } catch (error) {
            console.error('Walk location update error:', error);
        }
    });
    
    socket.on('walk-mode-complete', async (data) => {
        if (socket.isGuest) return;
        try {
            if (!socket.walkSessionId) return;
            
            const walkSession = await WalkSession.findById(socket.walkSessionId);
            if (!walkSession) return;
            
            walkSession.status = 'completed';
            walkSession.endTime = new Date();
            walkSession.completionStatus = 'safe';
            await walkSession.save();
            
            // Notify friends
            for (const friendId of walkSession.trustedFriends) {
                const friendSocketIds = userSockets.get(friendId.toString());
                if (friendSocketIds) {
                    for (const friendSocketId of friendSocketIds) {
                        io.to(friendSocketId).emit('walk-mode-ended', {
                            walkerId: socket.userId,
                            walkerName: socket.username,
                            status: 'safe'
                        });
                    }
                }
            }
            
            delete socket.walkSessionId;
            
            console.log(`✅ ${socket.username} completed walk mode safely`);
            
        } catch (error) {
            console.error('Walk mode complete error:', error);
        }
    });
    
    socket.on('walk-mode-emergency', async (data) => {
        if (socket.isGuest) return;
        try {
            if (!socket.walkSessionId) return;
            
            const walkSession = await WalkSession.findById(socket.walkSessionId);
            if (!walkSession) return;
            
            // Create SOS alert
            const sosAlert = new SOSAlert({
                user: socket.userId,
                location: data.location,
                type: data.type || 'manual',
                message: data.message,
                status: 'active'
            });
            await sosAlert.save();
            
            // Add emergency to walk session
            walkSession.emergencyAlerts.push({
                type: data.type || 'manual',
                timestamp: new Date(),
                location: data.location,
                message: data.message
            });
            await walkSession.save();
            
            // Notify friends
            for (const friendId of walkSession.trustedFriends) {
                const friendSocketIds = userSockets.get(friendId.toString());
                if (friendSocketIds) {
                    for (const friendSocketId of friendSocketIds) {
                        io.to(friendSocketId).emit('walk-mode-emergency-received', {
                            walkerId: socket.userId,
                            walkerName: socket.username,
                            location: data.location,
                            message: data.message,
                            type: data.type
                        });
                    }
                }
            }
            
            console.log(`🚨 ${socket.username} triggered emergency during walk mode`);
            
        } catch (error) {
            console.error('Walk mode emergency error:', error);
        }
    });
    
    // Friend request notifications
    socket.on('friend-request-sent', (data) => {
        // Notify recipient if online
        const recipientSocketIds = userSockets.get(data.friendId);
        if (recipientSocketIds) {
            for (const socketId of recipientSocketIds) {
                io.to(socketId).emit('friend-request-received', {
                    from: {
                        userId: socket.userId,
                        username: socket.username
                    }
                });
            }
        }
    });
    
    socket.on('friend-request-accepted', (data) => {
        // Notify requester if online
        const requesterSocketIds = userSockets.get(data.requesterId);
        if (requesterSocketIds) {
            for (const socketId of requesterSocketIds) {
                io.to(socketId).emit('friend-request-accepted', {
                    from: {
                        userId: socket.userId,
                        username: socket.username
                    }
                });
            }
        }
    });

    // Geofencing zone activity logs
    socket.on('zone-event', (data) => {
        try {
            const logsDir = path.join(__dirname, 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            const safeEvent = (data?.eventType || 'unknown').toUpperCase();
            const safeUser = data?.username || socket.username || 'Unknown';
            const safeZone = data?.zoneName || 'Unknown Zone';
            const safeTime = data?.timestamp || new Date().toISOString();
            const logLine = `[${safeTime}] ${safeUser} ${safeEvent} ${safeZone}\n`;

            fs.appendFile(path.join(logsDir, 'zone-events.txt'), logLine, (err) => {
                if (err) {
                    console.error('Failed to write zone event log:', err);
                }
            });

            io.emit('zone-event-broadcast', {
                username: safeUser,
                eventType: data?.eventType || 'unknown',
                zoneName: safeZone,
                timestamp: safeTime
            });
        } catch (error) {
            console.error('Zone event handler error:', error);
        }
    });
    
    // Heartbeat
    socket.on('heartbeat', () => {
        socket.lastHeartbeat = Date.now();
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log(`❌ User disconnected: ${socket.username} (${socket.userId})`);

        if (socket.isGuest) {
            const guestWalk = guestWalkSessions.get(socket.id);
            if (guestWalk) {
                guestWalk.friends.forEach((friendSocketId) => {
                    io.to(friendSocketId).emit('walk-mode-ended', {
                        walkerId: socket.id,
                        walkerName: socket.username || 'Guest',
                        status: 'disconnected'
                    });
                });
                guestWalkSessions.delete(socket.id);
            }
            guestUsers.delete(socket.id);
            io.emit('users-list', Array.from(guestUsers.entries()).map(([id, user]) => ({
                id,
                username: user.username,
                location: user.location
            })));
            return;
        }
        
        // Remove from connection maps
        connectedUsers.delete(socket.userId);
        socketUsers.delete(socket.id);
        
        // Remove from user sockets array
        const userSocketIds = userSockets.get(socket.userId);
        if (userSocketIds) {
            const index = userSocketIds.indexOf(socket.id);
            if (index > -1) {
                userSocketIds.splice(index, 1);
            }
            if (userSocketIds.length === 0) {
                userSockets.delete(socket.userId);
                // User is completely offline
                await User.findByIdAndUpdate(socket.userId, {
                    isOnline: false,
                    lastSeen: new Date()
                });
            }
        }
        
        // Handle walk mode cleanup
        if (socket.walkSessionId) {
            try {
                const walkSession = await WalkSession.findById(socket.walkSessionId);
                if (walkSession && walkSession.status === 'active') {
                    walkSession.status = 'cancelled';
                    walkSession.endTime = new Date();
                    await walkSession.save();
                    
                    // Notify friends
                    for (const friendId of walkSession.trustedFriends) {
                        const friendSocketIds = userSockets.get(friendId.toString());
                        if (friendSocketIds) {
                            for (const friendSocketId of friendSocketIds) {
                                io.to(friendSocketId).emit('walk-mode-ended', {
                                    walkerId: socket.userId,
                                    walkerName: socket.username,
                                    status: 'disconnected'
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Walk session cleanup error:', error);
            }
        }
    });
});

// Helper function to send online friends
async function sendOnlineFriends(socket) {
    try {
        const user = await User.findById(socket.userId).populate('friends');
        if (!user) return;
        
        const onlineFriends = [];
        for (const friend of user.friends) {
            const friendSocketIds = userSockets.get(friend._id.toString());
            if (friendSocketIds && friendSocketIds.length > 0) {
                onlineFriends.push({
                    userId: friend._id,
                    username: friend.username,
                    isOnline: true
                });
            }
        }
        
        socket.emit('online-friends', onlineFriends);
    } catch (error) {
        console.error('Error sending online friends:', error);
    }
}

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on ${serverProtocol}://0.0.0.0:${PORT}`);
    console.log('📡 Socket.IO ready');
    console.log('🔐 Authentication enabled');
    console.log('👥 Friend system active');
    console.log('✅ MongoDB Connected');
    if (serverProtocol !== 'https') {
        console.log('⚠️ Geolocation on non-localhost clients needs HTTPS');
    }
});
