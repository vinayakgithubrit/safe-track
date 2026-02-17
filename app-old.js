const express = require('express');
const app = express();
const http = require('http');
const socketio = require('socket.io');
const server = http.createServer(app);
const path = require('path');
const fs = require('fs');
const io = socketio(server);

app.set("view engine","ejs");
app.use(express.static('public'));

const users = new Map();

// Helper: get socket objects for users whose username matches any of the given names (e.g. trusted friends)
function getSocketsByUsernames(usernames) {
    if (!usernames || usernames.length === 0) return [];
    const normalized = usernames.map(u => (u || '').trim().toLowerCase()).filter(Boolean);
    const result = [];
    for (const [sid, user] of users.entries()) {
        const un = (user.username || '').trim().toLowerCase();
        if (normalized.some(n => un === n || un.includes(n) || n.includes(un))) {
            const s = io.sockets.sockets.get(sid);
            if (s) result.push(s);
        }
    }
    return result;
}

io.on("connection", function(socket){
    console.log("✅ User connected:", socket.id);
    
    socket.on("join", function(userData) {
        const username = typeof userData === 'string' ? userData : (userData && userData.username);
        const userId = userData && userData.userId ? userData.userId : null;
        const clientId = userData && userData.clientId ? userData.clientId : ('conn-' + socket.id);
        
        users.set(socket.id, {
            id: socket.id,
            username: username || `User-${socket.id.substring(0, 4)}`,
            userId: userId,
            clientId: clientId,
            latitude: null,
            longitude: null,
            speed: 0,
            lastUpdate: new Date()
        });
        
        console.log(`👤 ${username} joined (clientId: ${clientId})`);
        socket.emit('all-users', Array.from(users.values()));
        socket.broadcast.emit('user-joined', users.get(socket.id));
    });
    
    socket.on("send-location", function(data){
        const user = users.get(socket.id);
        
        if (user) {
            if (user.latitude && user.longitude) {
                const distance = calculateDistance(
                    user.latitude, 
                    user.longitude, 
                    data.latitude, 
                    data.longitude
                );
                const timeDiff = (new Date() - user.lastUpdate) / 1000;
                user.speed = timeDiff > 0 ? (distance / timeDiff) * 3600 : 0;
            }
            
            user.latitude = data.latitude;
            user.longitude = data.longitude;
            user.lastUpdate = new Date();
            
            io.emit("receive-location", {
                id: socket.id,
                username: user.username,
                latitude: data.latitude,
                longitude: data.longitude,
                speed: user.speed.toFixed(2)
            });
        } else {
            io.emit("receive-location", {id: socket.id, ...data});
        }
    });

    socket.on("chat-message", function(data) {
        const user = users.get(socket.id);
        if (user) {
            const messageData = {
                id: socket.id,
                username: user.username,
                message: data.message,
                timestamp: new Date().toISOString()
            };
            io.emit("chat-message", messageData);
            console.log(`💬 ${user.username}: ${data.message}`);
        }
    });

    socket.on("sos-alert", function(data) {
        const user = users.get(socket.id);
        
        if (user) {
            console.log(`🚨🚨🚨 SOS ALERT from ${data.username}! 🚨🚨🚨`);
            console.log(`Location: ${data.latitude}, ${data.longitude}`);
            
            const logEntry = `[${data.timestamp}] 🚨 SOS from ${data.username} (${socket.id}) at ${data.latitude}, ${data.longitude}\n`;
            
            if (!fs.existsSync('logs')) {
                fs.mkdirSync('logs');
            }
            
            fs.appendFileSync('logs/sos-alerts.txt', logEntry, (err) => {
                if (err) console.error('Failed to write SOS log:', err);
            });
            
            io.emit('sos-received', {
                id: socket.id,
                username: data.username,
                latitude: data.latitude,
                longitude: data.longitude,
                timestamp: data.timestamp
            });
            
            socket.emit('sos-confirmed', {
                message: 'SOS alert sent to all users successfully!',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // 🛡️ ZONE EVENT HANDLER
    socket.on("zone-event", function(data) {
        const user = users.get(socket.id);
        
        if (user) {
            console.log(`🛡️ Zone Event: ${data.username} ${data.eventType.toUpperCase()} "${data.zoneName}"`);
            
            const logEntry = `[${data.timestamp}] ${data.username} (${data.userId || socket.id}) ${data.eventType.toUpperCase()} ${data.zoneName}\n`;
            
            if (!fs.existsSync('logs')) {
                fs.mkdirSync('logs');
            }
            
            fs.appendFileSync('logs/zone-events.txt', logEntry, (err) => {
                if (err) console.error('Failed to write zone log:', err);
            });
        }
    });

    socket.on("heartbeat", function(data) {
        const user = users.get(socket.id);
        if (user) {
            user.lastHeartbeat = Date.now();
            users.set(socket.id, user);
            socket.emit('heartbeat-response', { 
                timestamp: Date.now(),
                serverTime: new Date().toISOString()
            });
        }
    });

    // 🚶‍♀️ WALK-ME-HOME MODE HANDLERS
    socket.on("walk-mode-start", function(data) {
        console.log(`🚶‍♀️ ${data.username} started walk mode with ${data.friends.length} friends`);
        
        // Log walk mode start
        let logEntry = `[${data.timestamp}] 🚶‍♀️ ${data.username} started walk mode\n`;
        logEntry += `   Friends: ${data.friends.join(', ')}\n`;
        logEntry += `   Destination: ${data.destination || 'Not specified'}\n`;
        logEntry += `   Location: ${data.location ? `${data.location.lat}, ${data.location.lng}` : 'Unknown'}\n`;
        
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs');
        }
        
        fs.appendFileSync('logs/walk-mode.txt', logEntry, (err) => {
            if (err) console.error('Failed to write walk mode log:', err);
        });
        
        const user = users.get(socket.id);
        const walkerId = (user && user.clientId) ? user.clientId : socket.id;
        
        // Store walk mode data (walkerId is stable so "View map" always finds the right walker)
        socket.walkMode = {
            active: true,
            walkerId: walkerId,
            friends: data.friends,
            destination: data.destination,
            startTime: data.startTime,
            lastLocation: data.location
        };
        
        // Notify only trusted friends by ID: "You are added to trusted friends by Ava"
        const friendSockets = getSocketsByUsernames(data.friends);
        friendSockets.forEach(function(friendSocket) {
            friendSocket.emit('walk-mode-added-you', {
                walkerId: walkerId,
                walkerName: data.username,
                message: 'You are added to trusted friends. Tap View map to see their live location.',
                destination: data.destination,
                timestamp: data.timestamp
            });
            friendSocket.emit('walk-mode-notification', {
                walkerId: walkerId,
                message: `${data.username} started walking home – track their live path on the map`
            });
        });
    });
    
    socket.on("walk-mode-location", function(data) {
        const user = users.get(socket.id);
        if (user && socket.walkMode && socket.walkMode.active) {
            socket.walkMode.lastLocation = data.location;
            socket.walkMode.lastUpdate = data.timestamp;
            let destinationReached = false;
            // Check if user reached destination (within 50 meters)
            if (socket.walkMode.destination) {
                destinationReached = checkDestinationProximity(
                    data.location,
                    socket.walkMode.destination
                );
                
                if (destinationReached) {
                    // User reached destination! Notify only friends
                    const destFriendSockets = getSocketsByUsernames(socket.walkMode.friends);
                    destFriendSockets.forEach(function(fs) {
                        fs.emit('walk-mode-notification', {
                            message: `🎯 ${data.username} reached their destination: ${socket.walkMode.destination}!`
                        });
                    });
                    
                    // Log destination arrival
                    const logEntry = `[${data.timestamp}] 🎯 ${data.username} reached destination: ${socket.walkMode.destination}\n`;
                    logEntry += `   Location: ${data.location.lat}, ${data.location.lng}\n`;
                    
                    fs.appendFileSync('logs/walk-mode.txt', logEntry, (err) => {
                        if (err) console.error('Failed to write destination log:', err);
                    });
                }
            }
            
            // Send location only to trusted friends (walkerId = stable id for map key)
            const friendSockets = getSocketsByUsernames(socket.walkMode.friends);
            const payload = {
                walkerId: socket.walkMode.walkerId,
                username: data.username,
                location: data.location,
                timestamp: data.timestamp,
                destination: socket.walkMode.destination,
                destinationReached: destinationReached
            };
            friendSockets.forEach(function(friendSocket) {
                friendSocket.emit('walk-mode-location-update', payload);
            });
        }
    });
    
    socket.on("walk-mode-emergency", function(data) {
        console.log(`🚨 WALK MODE EMERGENCY: ${data.message}`);
        
        // Log emergency
        let logEntry = `[${data.timestamp}] 🚨 WALK MODE EMERGENCY: ${data.message}\n`;
        logEntry += `   Type: ${data.type}\n`;
        logEntry += `   Location: ${data.location ? `${data.location.lat}, ${data.location.lng}` : 'Unknown'}\n`;
        
        fs.appendFileSync('logs/walk-mode.txt', logEntry, (err) => {
            if (err) console.error('Failed to write walk mode emergency log:', err);
        });
        
        // Send emergency to trusted friends only
        const emergencyFriends = socket.walkMode && socket.walkMode.friends
            ? getSocketsByUsernames(socket.walkMode.friends)
            : [];
        emergencyFriends.forEach(function(fs) {
            fs.emit('walk-mode-emergency-received', {
                message: data.message,
                location: data.location,
                timestamp: data.timestamp
            });
        });
    });
    
    socket.on("walk-mode-extend", function(data) {
        console.log(`⏰ ${data.username} extended walk mode time`);
        
        const extendFriends = socket.walkMode && socket.walkMode.friends
            ? getSocketsByUsernames(socket.walkMode.friends)
            : [];
        extendFriends.forEach(function(fs) {
            fs.emit('walk-mode-notification', {
                message: `${data.username} extended their walk mode time`
            });
        });
    });
    
    socket.on("walk-mode-screen-state", function(data) {
        console.log(`📱 ${data.username} screen state: ${data.screenState}`);
        
        // Log screen state change
        const logEntry = `[${data.timestamp}] 📱 ${data.username} screen ${data.screenState}\n`;
        
        fs.appendFileSync('logs/walk-mode.txt', logEntry, (err) => {
            if (err) console.error('Failed to write screen state log:', err);
        });
        
        // Notify only friends
        const screenFriends = socket.walkMode && socket.walkMode.friends
            ? getSocketsByUsernames(socket.walkMode.friends)
            : [];
        if (data.screenState === 'off') {
            screenFriends.forEach(function(fs) {
                fs.emit('walk-mode-notification', {
                    message: `${data.username}'s screen turned off during walk mode`
                });
            });
        } else if (data.screenState === 'on') {
            screenFriends.forEach(function(fs) {
                fs.emit('walk-mode-notification', {
                    message: `${data.username}'s screen turned back on`
                });
            });
        }
    });

    socket.on("walk-mode-complete", function(data) {
        console.log(`✅ ${data.username} completed walk mode safely (${data.duration}s)`);
        
        // Log completion
        let logEntry = `[${data.timestamp}] ✅ ${data.username} completed walk mode\n`;
        logEntry += `   Status: ${data.status}\n`;
        logEntry += `   Duration: ${data.duration} seconds\n`;
        
        fs.appendFileSync('logs/walk-mode.txt', logEntry, (err) => {
            if (err) console.error('Failed to write walk mode completion log:', err);
        });
        
        const completedFriends = socket.walkMode && socket.walkMode.friends
            ? getSocketsByUsernames(socket.walkMode.friends)
            : [];
        const endedWalkerId = socket.walkMode && socket.walkMode.walkerId ? socket.walkMode.walkerId : null;
        
        // Clear walk mode data
        socket.walkMode = null;
        
        // Notify friends and tell them to stop showing this walk on the map (by walkerId)
        completedFriends.forEach(function(fs) {
            fs.emit('walk-mode-notification', {
                message: `${data.username} reached their destination safely!`
            });
            fs.emit('walk-mode-ended', {
                walkerId: endedWalkerId,
                username: data.username,
                duration: data.duration,
                status: data.status
            });
        });
    });

    socket.on("disconnect", function(){
        const user = users.get(socket.id);
        if (user) {
            // Check if user was in walk mode
            if (socket.walkMode && socket.walkMode.active) {
                console.log(`⚠️ ${user.username} disconnected during walk mode!`);
                
                let logEntry = `[${new Date().toISOString()} ⚠️ ${user.username} disconnected during walk mode\n`;
                logEntry += `   Friends: ${socket.walkMode.friends.join(', ')}\n`;
                logEntry += `   Destination: ${socket.walkMode.destination || 'Not specified'}\n`;
                
                fs.appendFileSync('logs/walk-mode.txt', logEntry, (err) => {
                    if (err) console.error('Failed to write walk mode disconnect log:', err);
                });
                
                // Notify only trusted friends about disconnection during walk mode
                const disconnectFriends = getSocketsByUsernames(socket.walkMode.friends);
                const payload = {
                    message: `${user.username} disconnected during walk mode! Please check on them.`,
                    location: socket.walkMode.lastLocation,
                    timestamp: new Date().toISOString()
                };
                disconnectFriends.forEach(function(fs) {
                    fs.emit('walk-mode-emergency-received', payload);
                });
                // Also tell friends to stop showing this walk on the map (by walkerId)
                const discWalkerId = socket.walkMode.walkerId || null;
                disconnectFriends.forEach(function(fs) {
                    fs.emit('walk-mode-ended', {
                        walkerId: discWalkerId,
                        username: user.username,
                        status: 'disconnected'
                    });
                });
            }
            
            console.log(`👋 ${user.username} disconnected`);
            users.delete(socket.id);
        }
        io.emit("user-disconnected", socket.id);
    });
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(degrees) {
    return degrees * Math.PI / 180;
}

// Check if user is within proximity of destination (simplified check)
function checkDestinationProximity(location, destination) {
    // For demo purposes, we'll use a simple proximity check
    // In real implementation, you'd use geocoding to convert destination name to coordinates
    // For now, we'll simulate destination arrival after some time/distance
    
    // This is a placeholder - in real app, you'd:
    // 1. Geocode the destination string to get coordinates
    // 2. Calculate distance between user location and destination
    // 3. Return true if within 50 meters
    
    // For demo: simulate arrival after user has been walking for 2+ minutes
    if (socket.walkMode.startTime) {
        const walkingTime = (Date.now() - new Date(socket.walkMode.startTime).getTime()) / 1000;
        return walkingTime > 120; // Arrival after 2 minutes (for demo)
    }
    
    return false;
}

app.get("/", function(req, res){
    res.render("index");
});

server.listen(3000, function(){
    console.log("🚀 Server running on http://localhost:3000");
    console.log("🎓 IET-DAVV SafeTrack System");
    console.log("🚨 SOS Emergency feature enabled");
    console.log("🛡️ Geofencing zones enabled");
    console.log("�‍♀️ Walk-Me-Home mode enabled");
    console.log("�📝 Logs: logs/sos-alerts.txt, logs/zone-events.txt & logs/walk-mode.txt");
});