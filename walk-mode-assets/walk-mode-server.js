// ================================================================
// WALK-ME-HOME FEATURE - SERVER SIDE CODE (app.js)
// Copy this entire file or integrate into your existing app.js
// ================================================================

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// ========== MONGODB MODELS ==========

// User Model
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: String,
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isOnline: { type: Boolean, default: false },
    lastLocation: {
        latitude: Number,
        longitude: Number,
        timestamp: Date
    }
});

const User = mongoose.model('User', UserSchema);

// WalkSession Model
const WalkSessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    trustedFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    destination: { type: String, required: true },
    startLocation: {
        latitude: Number,
        longitude: Number
    },
    currentLocation: {
        latitude: Number,
        longitude: Number
    },
    path: [{
        latitude: Number,
        longitude: Number,
        timestamp: { type: Date, default: Date.now }
    }],
    status: {
        type: String,
        enum: ['active', 'completed', 'emergency', 'cancelled'],
        default: 'active'
    },
    startTime: { type: Date, default: Date.now },
    endTime: Date,
    emergencyAlerts: [{
        type: { type: String, enum: ['manual', 'inactivity', 'disconnect'] },
        triggeredAt: { type: Date, default: Date.now },
        location: {
            latitude: Number,
            longitude: Number
        }
    }]
});

const WalkSession = mongoose.model('WalkSession', WalkSessionSchema);

// ========== GLOBAL STATE ==========

const users = new Map(); // socketId -> user object
const userSockets = new Map(); // userId -> socketId

// ========== SOCKET.IO CONNECTION ==========

io.on('connection', async (socket) => {
    console.log('✅ User connected:', socket.id);
    
    // Note: In production, authenticate socket connection with JWT
    // For now, assuming socket.userId and socket.username are set
    
    // ========== USER JOIN ==========
    socket.on('join', async (data) => {
        try {
            socket.username = data.username;
            socket.userId = data.userId || socket.id; // Use MongoDB _id if available
            
            // Store user
            users.set(socket.id, {
                id: socket.id,
                userId: socket.userId,
                username: socket.username,
                connectedAt: Date.now()
            });
            
            userSockets.set(socket.userId, socket.id);
            
            console.log(`User joined: ${socket.username} (${socket.userId})`);
            
            // Notify others
            socket.broadcast.emit('user-joined', {
                id: socket.id,
                userId: socket.userId,
                username: socket.username
            });
            
            // Send existing users
            const allUsers = Array.from(users.values());
            socket.emit('all-users', allUsers);
            
        } catch (error) {
            console.error('Join error:', error);
        }
    });
    
    // ========== LOCATION UPDATE (Normal + Walk Mode) ==========
    socket.on('send-location', async (data) => {
        try {
            const user = users.get(socket.id);
            if (!user) return;
            
            // Update user location
            user.lastLocation = {
                latitude: data.latitude,
                longitude: data.longitude
            };
            user.speed = data.speed || 0;
            user.lastUpdate = Date.now();
            
            // Broadcast to all users (normal tracking)
            io.emit('receive-location', {
                id: socket.id,
                userId: socket.userId,
                username: user.username,
                latitude: data.latitude,
                longitude: data.longitude,
                speed: data.speed || 0,
                timestamp: new Date().toISOString()
            });
            
            // ✅✅✅ CRITICAL: If in walk mode, send to trusted friends ✅✅✅
            if (socket.walkSession && socket.walkSessionId) {
                console.log('🚶‍♀️ Walk mode active - broadcasting location');
                console.log('   Walker:', socket.username);
                console.log('   Location:', data.latitude, data.longitude);
                
                const walkSession = await WalkSession.findById(socket.walkSessionId)
                    .populate('trustedFriends');
                
                if (walkSession && walkSession.status === 'active') {
                    // Update session location and path
                    walkSession.currentLocation = {
                        latitude: data.latitude,
                        longitude: data.longitude
                    };
                    walkSession.path.push({
                        latitude: data.latitude,
                        longitude: data.longitude,
                        timestamp: new Date()
                    });
                    await walkSession.save();
                    
                    // Send to each trusted friend
                    let sentCount = 0;
                    walkSession.trustedFriends.forEach(friend => {
                        const friendSocketId = userSockets.get(friend._id.toString());
                        
                        if (friendSocketId) {
                            io.to(friendSocketId).emit('walk-mode-location-update', {
                                walkerId: socket.userId,
                                username: socket.username,
                                location: {
                                    lat: data.latitude,
                                    lng: data.longitude
                                },
                                destination: walkSession.destination,
                                timestamp: new Date().toISOString()
                            });
                            
                            sentCount++;
                            console.log(`   ✅ Sent to friend: ${friend.username}`);
                        }
                    });
                    
                    console.log(`   📤 Total friends notified: ${sentCount}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Location update error:', error);
        }
    });
    
    // ========== START WALK MODE ==========
    socket.on('walk-mode-start', async (data) => {
        try {
            console.log('');
            console.log('🚶‍♀️ WALK MODE START');
            console.log('   Walker:', data.username);
            console.log('   Friends:', data.friends);
            console.log('   Destination:', data.destination);
            console.log('='.repeat(60));
            
            // Validate
            if (!data.friends || data.friends.length === 0) {
                console.error('❌ No friends provided');
                return;
            }
            
            if (!data.destination) {
                console.error('❌ No destination provided');
                return;
            }
            
            // Create walk session in database
            const walkSession = new WalkSession({
                user: socket.userId,
                trustedFriends: data.friends, // Array of friend MongoDB IDs
                destination: data.destination,
                startLocation: data.location ? {
                    latitude: data.location.lat,
                    longitude: data.location.lng
                } : null,
                status: 'active'
            });
            
            await walkSession.save();
            
            // Store walk session reference on socket
            socket.walkSession = true;
            socket.walkSessionId = walkSession._id;
            
            console.log('✅ Walk session created in DB:', walkSession._id);
            
            // Notify each trusted friend
            let notifiedCount = 0;
            for (const friendId of data.friends) {
                const friendSocketId = userSockets.get(friendId);
                
                if (friendSocketId) {
                    // Send notification
                    io.to(friendSocketId).emit('walk-mode-added-you', {
                        walkerId: socket.userId, // Use stable user ID
                        walkerName: data.username,
                        destination: data.destination,
                        message: `${data.username} added you to Walk-Me-Home mode`,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`   📤 Notified friend: ${friendId}`);
                    
                    // Send initial location if available
                    if (data.location) {
                        io.to(friendSocketId).emit('walk-mode-location-update', {
                            walkerId: socket.userId,
                            username: data.username,
                            location: data.location,
                            destination: data.destination,
                            timestamp: new Date().toISOString()
                        });
                        
                        console.log(`   📍 Sent initial location to: ${friendId}`);
                    }
                    
                    notifiedCount++;
                } else {
                    console.log(`   ⚠️ Friend offline: ${friendId}`);
                }
            }
            
            console.log(`✅ Walk mode started successfully (${notifiedCount}/${data.friends.length} friends notified)`);
            
        } catch (error) {
            console.error('❌ Walk mode start error:', error);
        }
    });
    
    // ========== WALK MODE COMPLETE ==========
    socket.on('walk-mode-complete', async (data) => {
        try {
            console.log('🏁 Walk mode complete:', socket.username);
            
            if (!socket.walkSessionId) {
                console.log('   ⚠️ No active walk session');
                return;
            }
            
            const walkSession = await WalkSession.findById(socket.walkSessionId)
                .populate('trustedFriends');
            
            if (walkSession) {
                walkSession.status = 'completed';
                walkSession.endTime = new Date();
                await walkSession.save();
                
                console.log('   ✅ Walk session marked as completed');
                
                // Notify friends
                walkSession.trustedFriends.forEach(friend => {
                    const friendSocketId = userSockets.get(friend._id.toString());
                    
                    if (friendSocketId) {
                        io.to(friendSocketId).emit('walk-mode-ended', {
                            walkerId: socket.userId,
                            username: socket.username,
                            status: 'completed',
                            timestamp: new Date().toISOString()
                        });
                        
                        console.log(`   ✅ Notified friend: ${friend.username}`);
                    }
                });
            }
            
            // Clean up socket state
            socket.walkSession = false;
            socket.walkSessionId = null;
            
        } catch (error) {
            console.error('❌ Walk mode complete error:', error);
        }
    });
    
    // ========== WALK MODE EMERGENCY ==========
    socket.on('walk-mode-emergency', async (data) => {
        try {
            console.log('🚨 WALK MODE EMERGENCY');
            console.log('   Walker:', socket.username);
            console.log('   Type:', data.type);
            
            if (!socket.walkSessionId) return;
            
            const walkSession = await WalkSession.findById(socket.walkSessionId)
                .populate('trustedFriends');
            
            if (walkSession) {
                // Add emergency alert
                walkSession.emergencyAlerts.push({
                    type: data.type || 'manual',
                    triggeredAt: new Date(),
                    location: data.location
                });
                walkSession.status = 'emergency';
                await walkSession.save();
                
                console.log('   ✅ Emergency alert saved to DB');
                
                // Notify friends
                walkSession.trustedFriends.forEach(friend => {
                    const friendSocketId = userSockets.get(friend._id.toString());
                    
                    if (friendSocketId) {
                        io.to(friendSocketId).emit('walk-mode-emergency-received', {
                            walkerId: socket.userId,
                            username: socket.username,
                            type: data.type,
                            message: data.message || `${socket.username} triggered emergency!`,
                            location: data.location,
                            timestamp: new Date().toISOString()
                        });
                        
                        console.log(`   🚨 Emergency alert sent to: ${friend.username}`);
                    }
                });
            }
            
        } catch (error) {
            console.error('❌ Walk mode emergency error:', error);
        }
    });
    
    // ========== DISCONNECT ==========
    socket.on('disconnect', async () => {
        console.log('❌ User disconnected:', socket.username);
        
        try {
            // If in walk mode, trigger emergency
            if (socket.walkSession && socket.walkSessionId) {
                console.log('⚠️ User disconnected during walk mode - triggering emergency');
                
                const walkSession = await WalkSession.findById(socket.walkSessionId)
                    .populate('trustedFriends');
                
                if (walkSession && walkSession.status === 'active') {
                    walkSession.emergencyAlerts.push({
                        type: 'disconnect',
                        triggeredAt: new Date()
                    });
                    walkSession.status = 'emergency';
                    await walkSession.save();
                    
                    // Notify friends
                    walkSession.trustedFriends.forEach(friend => {
                        const friendSocketId = userSockets.get(friend._id.toString());
                        
                        if (friendSocketId) {
                            io.to(friendSocketId).emit('walk-mode-emergency-received', {
                                walkerId: socket.userId,
                                username: socket.username,
                                type: 'disconnect',
                                message: `⚠️ ${socket.username} disconnected during walk mode!`,
                                timestamp: new Date().toISOString()
                            });
                        }
                    });
                }
            }
            
            // Clean up
            users.delete(socket.id);
            userSockets.delete(socket.userId);
            
            // Notify others
            io.emit('user-disconnected', socket.id);
            
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    });
});

// ========== SERVER START ==========

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/safetrack', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✅ MongoDB connected');
    
    server.listen(PORT, () => {
        console.log('');
        console.log('🚀 SafeTrack GPS Server Started');
        console.log('   Port:', PORT);
        console.log('   MongoDB: Connected');
        console.log('   Walk-Me-Home: Ready');
        console.log('');
    });
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

module.exports = { app, server, io };
