// ========== MAIN APPLICATION SCRIPT ==========
// This script handles map, geofencing, and all features
// No authentication dependencies - works standalone!

// ========== GLOBAL VARIABLES ==========
let map = null;
let socket = null;
let myLocation = null;
let markers = {};
let users = {};
let chatMessages = [];
let notificationsEnabled = true;
let sosCountdown = null;
let walkModeActive = false;
let walkModeInterval = null;

// ========== INITIALIZATION ==========

// Initialize socket listeners
function initializeSocketListeners() {
    console.log('🔌 Initializing socket listeners...');
    
    if (!window.io) {
        console.error('❌ Socket.IO not loaded!');
        return;
    }
    
    // Connect to socket
    socket = io();
    
    socket.on('connect', () => {
        console.log('✅ Connected to server!');
        
        // Send location data
        if (window.username) {
            socket.emit('user-joined', {
                username: window.username,
                userId: window.currentUser?._id || null
            });
        }
        
        // Request current users
        socket.emit('get-users');
    });
    
    socket.on('users-list', (usersList) => {
        console.log('👥 Users received:', usersList);
        updateUserList(usersList);
    });
    
    socket.on('location-update', (data) => {
        console.log('📍 Location update:', data);
        updateUserLocation(data);
    });
    
    socket.on('chat-message', (message) => {
        console.log('💬 Chat message:', message);
        addChatMessage(message);
        
        if (notificationsEnabled) {
            showNotification(`${message.username}: ${message.message}`, 'info');
        }
    });
    
    socket.on('sos-alert', (data) => {
        console.log('🚨 SOS Alert:', data);
        handleSOSAlert(data);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
    });
}

// Initialize map
function initializeMap() {
    console.log('🗺️ Initializing map...');
    
    if (!window.L) {
        console.error('❌ Leaflet not loaded!');
        return;
    }
    
    // Create map centered on IET DAVV (approximate location)
    map = L.map('map').setView([23.2599, 77.4126], 15);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                myLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                console.log('📍 My location:', myLocation);
                
                // Center map on user
                map.setView([myLocation.lat, myLocation.lng], 16);
                
                // Add user marker
                addUserMarker(window.username, myLocation, true);
                
                // Send location to server
                if (socket) {
                    socket.emit('location-update', {
                        username: window.username,
                        location: myLocation
                    });
                }
                
                // Start location tracking
                startLocationTracking();
            },
            (error) => {
                console.error('❌ Location error:', error);
                showNotification('Unable to get your location', 'error');
            }
        );
    } else {
        console.error('❌ Geolocation not supported');
        showNotification('Geolocation not supported by your browser', 'error');
    }
}

// Start tracking user location
function startLocationTracking() {
    if (!navigator.geolocation) return;
    
    setInterval(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const newLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Only update if location changed significantly
                if (!myLocation || 
                    Math.abs(myLocation.lat - newLocation.lat) > 0.0001 ||
                    Math.abs(myLocation.lng - newLocation.lng) > 0.0001) {
                    
                    myLocation = newLocation;
                    
                    // Update marker
                    if (markers[window.username]) {
                        markers[window.username].setLatLng([myLocation.lat, myLocation.lng]);
                    }
                    
                    // Send to server
                    if (socket) {
                        socket.emit('location-update', {
                            username: window.username,
                            location: myLocation
                        });
                    }
                }
            },
            (error) => {
                console.error('❌ Tracking error:', error);
            }
        );
    }, 5000); // Update every 5 seconds
}

// ========== UI FUNCTIONS ==========

// Update users list
function updateUserList(usersList) {
    const usersListElement = document.getElementById('users-list');
    const userCountElement = document.getElementById('user-count');
    
    if (!usersListElement) return;
    
    usersListElement.innerHTML = '';
    userCountElement.textContent = usersList.length;
    
    usersList.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.innerHTML = `
            <div class="user-avatar">👤</div>
            <div class="user-info">
                <div class="user-name">${user.username}</div>
                <div class="user-status">🟢 Online</div>
            </div>
        `;
        
        userItem.onclick = () => focusOnUser(user.username);
        usersListElement.appendChild(userItem);
    });
}

// Add user marker to map
function addUserMarker(username, location, isMe = false) {
    if (!map) return;
    
    // Remove existing marker
    if (markers[username]) {
        map.removeLayer(markers[username]);
    }
    
    // Create marker
    const marker = L.marker([location.lat, location.lng])
        .addTo(map)
        .bindPopup(username);
    
    if (isMe) {
        marker.setIcon(L.icon({
            iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iOCIgZmlsbD0iIzQyODVGNCIvPgo8Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSIzIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4=',
            iconSize: [24, 24]
        }));
    }
    
    markers[username] = marker;
}

// Update user location
function updateUserLocation(data) {
    if (data.username === window.username) return; // Skip self
    
    addUserMarker(data.username, data.location);
}

// Focus on specific user
function focusOnUser(username) {
    if (markers[username]) {
        map.setView(markers[username].getLatLng(), 18);
        markers[username].openPopup();
    }
}

// ========== CHAT FUNCTIONS ==========

// Send chat message
function sendMessageFloat(event) {
    event.preventDefault();
    
    const input = document.getElementById('chat-input-float');
    const message = input.value.trim();
    
    if (!message || !socket) return;
    
    socket.emit('chat-message', {
        username: window.username,
        message: message,
        timestamp: Date.now()
    });
    
    input.value = '';
}

// Add chat message to UI
function addChatMessage(message) {
    const chatContainer = document.getElementById('chat-messages-float');
    if (!chatContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `
        <div class="chat-username">${message.username}</div>
        <div class="chat-text">${message.message}</div>
        <div class="chat-time">${new Date(message.timestamp).toLocaleTimeString()}</div>
    `;
    
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ========== SOS FUNCTIONS ==========

// Handle SOS button click
function handleSOS() {
    if (!socket || !myLocation) {
        showNotification('Cannot send SOS - no connection or location', 'error');
        return;
    }
    
    // Start countdown
    let countdown = 5;
    const timerElement = document.getElementById('countdown');
    const sosTimerElement = document.getElementById('sos-timer');
    
    sosTimerElement.style.display = 'block';
    timerElement.textContent = countdown;
    
    sosCountdown = setInterval(() => {
        countdown--;
        timerElement.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(sosCountdown);
            sendSOSAlert();
            sosTimerElement.style.display = 'none';
        }
    }, 1000);
    
    // Cancel on button click again
    document.getElementById('sos-button').onclick = cancelSOS;
}

// Cancel SOS
function cancelSOS() {
    if (sosCountdown) {
        clearInterval(sosCountdown);
        sosCountdown = null;
    }
    
    document.getElementById('sos-timer').style.display = 'none';
    document.getElementById('sos-button').onclick = handleSOS;
    
    showNotification('SOS cancelled', 'info');
}

// Send SOS alert
function sendSOSAlert() {
    if (!socket || !myLocation) return;
    
    socket.emit('sos-alert', {
        username: window.username,
        location: myLocation,
        timestamp: Date.now()
    });
    
    showNotification('🚨 SOS Alert Sent!', 'error');
}

// Handle incoming SOS alert
function handleSOSAlert(data) {
    showNotification(`🚨 ${data.username} needs help!`, 'error');
    
    // Add SOS marker
    if (map) {
        const sosIcon = L.icon({
            iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTUiIGN5PSIxNSIgcj0iMTAiIGZpbGw9IiNEQzM1NDUiLz4KPHRleHQgeD0iMTUiIHk9IjIwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSIgZm9udC1zaXplPSIxMiI+U09TPC90ZXh0Pgo8L3N2Zz4=',
            iconSize: [30, 30]
        });
        
        L.marker([data.location.lat, data.location.lng], { icon: sosIcon })
            .addTo(map)
            .bindPopup(`🚨 ${data.username} - SOS Alert!`)
            .openPopup();
    }
}

// ========== UTILITY FUNCTIONS ==========

// Show notification
function showNotification(message, type = 'info') {
    console.log(`🔔 [${type.toUpperCase()}] ${message}`);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#17a2b8'};
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// ========== EVENT LISTENERS ==========

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 SafeTrack initializing...');
    
    // Wait for user to login before initializing map
    if (window.username) {
        setTimeout(() => {
            initializeMap();
        }, 1000);
    }
});

// Setup chat panel toggle
document.addEventListener('DOMContentLoaded', function() {
    const chatBtn = document.getElementById('chat-float-btn');
    const chatPanel = document.getElementById('chat-panel');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    
    if (chatBtn && chatPanel) {
        chatBtn.onclick = () => {
            chatPanel.style.display = chatPanel.style.display === 'none' ? 'block' : 'none';
        };
    }
    
    if (chatCloseBtn) {
        chatCloseBtn.onclick = () => {
            chatPanel.style.display = 'none';
        };
    }
});

// Setup SOS button
document.addEventListener('DOMContentLoaded', function() {
    const sosBtn = document.getElementById('sos-button');
    if (sosBtn) {
        sosBtn.onclick = handleSOS;
    }
});

// Setup location request button
document.addEventListener('DOMContentLoaded', function() {
    const locationBtn = document.getElementById('request-location');
    if (locationBtn) {
        locationBtn.onclick = () => {
            if (myLocation) {
                map.setView([myLocation.lat, myLocation.lng], 18);
                showNotification('Location centered on map', 'success');
            } else {
                showNotification('No location available', 'error');
            }
        };
    }
});

// Make functions global
window.initializeSocketListeners = initializeSocketListeners;
window.initializeMap = initializeMap;
window.sendMessageFloat = sendMessageFloat;
window.handleSOS = handleSOS;
window.cancelSOS = cancelSOS;
