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
let walkModeStartTime = null;
let walkModeFriends = [];
let walkModeDestination = '';
let currentlyTrackingWalkerId = null;
let walkModeMarkers = {};
let walkModePaths = {};
let walkModePathLines = {};
let walkerDisplayNames = {};

function notifyTrackerLocationChange(location) {
    if (typeof window.onTrackerLocationUpdate === 'function') {
        try {
            window.onTrackerLocationUpdate(location);
        } catch (error) {
            console.error('Location callback failed:', error);
        }
    }
}

function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('GEOLOCATION_NOT_SUPPORTED'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    speed: position.coords.speed || 0,
                    timestamp: Date.now()
                });
            },
            (error) => reject(error),
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    });
}

function blinkScreenRed() {
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(220, 53, 69, 0.45);
        z-index: 12000;
        pointer-events: none;
        animation: sosFlash 0.25s ease-in-out 4 alternate;
    `;
    document.body.appendChild(flash);
    setTimeout(() => {
        if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 1200);
}

function playSOSSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 880;
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (error) {
        console.warn('SOS audio unavailable:', error);
    }
}

function ensureCurrentUserInList() {
    if (!window.username) return;
    const usersListElement = document.getElementById('users-list');
    const userCountElement = document.getElementById('user-count');
    if (!usersListElement) return;
    const existingByName = Array.from(usersListElement.querySelectorAll('.user-name'))
        .some((el) => (el.textContent || '').includes(window.username));
    if (usersListElement.querySelector('[data-self="true"]') || existingByName) return;

    const selfItem = document.createElement('div');
    selfItem.className = 'user-item current-user';
    selfItem.setAttribute('data-self', 'true');
    selfItem.setAttribute('data-user-id', socket?.id || 'self');
    selfItem.innerHTML = `
        <div class="user-avatar">👤</div>
        <div class="user-info">
            <div class="user-name">${window.username} (You)</div>
            <div class="user-status">🟢 Online</div>
        </div>
    `;
    usersListElement.prepend(selfItem);

    const currentCount = Number(userCountElement.textContent || '0');
    userCountElement.textContent = String(Math.max(currentCount, 1));
}

function formatWalkDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function drawWalkPath(walkerId) {
    if (!map || !walkModePaths[walkerId] || walkModePaths[walkerId].length < 2) return;
    if (walkModePathLines[walkerId] && map.hasLayer(walkModePathLines[walkerId])) {
        map.removeLayer(walkModePathLines[walkerId]);
    }
    walkModePathLines[walkerId] = L.polyline(walkModePaths[walkerId], {
        color: '#22c55e',
        weight: 4,
        opacity: 0.85,
        dashArray: '8 8'
    }).addTo(map);
}

function addOrUpdateWalkMarker(walkerId, username, location, destination) {
    if (!map || !location) return;
    const lat = location.lat;
    const lng = location.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    if (!walkModeMarkers[walkerId]) {
        walkModeMarkers[walkerId] = typeof window.createWalkingMarker === 'function'
            ? window.createWalkingMarker(lat, lng, username)
            : L.marker([lat, lng]);
        walkModeMarkers[walkerId].addTo(map);
    } else {
        walkModeMarkers[walkerId].setLatLng([lat, lng]);
    }

    walkModeMarkers[walkerId].bindPopup(`🚶‍♀️ ${username}<br>${destination || 'Walking'}`);

    if (!walkModePaths[walkerId]) walkModePaths[walkerId] = [];
    walkModePaths[walkerId].push([lat, lng]);
    if (walkModePaths[walkerId].length > 40) walkModePaths[walkerId].shift();
    drawWalkPath(walkerId);
}

function focusOnWalker(walkerId) {
    if (!map || !walkModeMarkers[walkerId]) return;
    currentlyTrackingWalkerId = walkerId;
    const ll = walkModeMarkers[walkerId].getLatLng();
    map.invalidateSize();
    map.setView(ll, 18, { animate: true, duration: 1.2 });
    walkModeMarkers[walkerId].openPopup();
    const banner = document.getElementById('walk-watching-banner');
    const label = document.getElementById('walk-watching-label');
    if (banner && label) {
        label.textContent = `👁️ Watching: ${walkerDisplayNames[walkerId] || 'Friend'} - live path`;
        banner.style.display = 'flex';
    }
}

function createWalkToast(walkerId, walkerName, destination) {
    const toast = document.createElement('div');
    toast.className = 'walk-with-me-toast show';
    toast.innerHTML = `
        <div class="walk-toast-content">
            <div class="walk-toast-icon">🚶‍♀️</div>
            <div class="walk-toast-text">
                <strong>${walkerName}</strong>
                <p>Walking to ${destination || 'destination'}</p>
            </div>
            <button class="walk-toast-btn" type="button">📍 View on Map</button>
        </div>
    `;
    const btn = toast.querySelector('.walk-toast-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            toast.remove();
            focusOnWalker(walkerId);
        });
    }
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 12000);
}

function showWalkModal() {
    const modal = document.getElementById('walk-mode-modal');
    const list = document.getElementById('walk-friend-list');
    if (!modal || !list) return;

    const candidates = Array.from(document.querySelectorAll('#users-list .user-item'))
        .filter((el) => !el.hasAttribute('data-self'));
    list.innerHTML = '';

    if (!candidates.length) {
        list.innerHTML = '<div class="loading">No online friends right now</div>';
    }

    candidates.forEach((el) => {
        const name = (el.querySelector('.user-name')?.textContent || 'Friend').replace(' (You)', '').trim();
        const id = el.getAttribute('data-user-id') || name;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'friend-item';
        item.dataset.friendId = id;
        item.dataset.friendUsername = name;
        item.textContent = name;
        item.addEventListener('click', () => item.classList.toggle('selected'));
        list.appendChild(item);
    });

    modal.style.display = 'flex';
}

function closeWalkModal() {
    const modal = document.getElementById('walk-mode-modal');
    if (modal) modal.style.display = 'none';
}

function startWalkMode() {
    const selected = Array.from(document.querySelectorAll('#walk-friend-list .friend-item.selected'));
    const destination = (document.getElementById('walk-destination-input')?.value || '').trim();

    if (!selected.length) {
        showNotification('Select at least 1 friend', 'error');
        return;
    }
    if (selected.length > 3) {
        showNotification('Maximum 3 friends allowed', 'error');
        return;
    }
    if (!destination) {
        showNotification('Enter destination', 'error');
        return;
    }

    walkModeFriends = selected.map((x) => x.dataset.friendId);
    walkModeDestination = destination;
    walkModeActive = true;
    walkModeStartTime = Date.now();

    closeWalkModal();
    const activeModal = document.getElementById('walk-tracking-modal');
    if (activeModal) activeModal.style.display = 'flex';
    const friendsCount = document.getElementById('walk-active-friends');
    if (friendsCount) friendsCount.textContent = String(walkModeFriends.length);
    if (walkModeInterval) clearInterval(walkModeInterval);
    walkModeInterval = setInterval(() => {
        const durationEl = document.getElementById('walk-duration');
        if (durationEl && walkModeStartTime) {
            durationEl.textContent = formatWalkDuration(Date.now() - walkModeStartTime);
        }
    }, 1000);

    if (socket) {
        socket.emit('walk-mode-start', {
            username: window.username,
            friends: walkModeFriends,
            destination,
            location: myLocation
        });
    }
    showNotification('Walk mode started', 'success');
}

function stopWalkMode(status = 'cancelled') {
    walkModeActive = false;
    if (walkModeInterval) {
        clearInterval(walkModeInterval);
        walkModeInterval = null;
    }
    const activeModal = document.getElementById('walk-tracking-modal');
    if (activeModal) activeModal.style.display = 'none';
    if (socket) socket.emit('walk-mode-complete', { status });
    showNotification(status === 'safe' ? 'Reached safely' : 'Walk mode stopped', 'info');
}

function emergencyWalkMode() {
    if (!socket || !myLocation) return;
    socket.emit('walk-mode-emergency', {
        type: 'manual',
        message: `${window.username} needs help`,
        location: myLocation
    });
    blinkScreenRed();
    playSOSSound();
}

// ========== INITIALIZATION ==========

// Initialize socket listeners
function initializeSocketListeners() {
    console.log('🔌 Initializing socket listeners...');
    
    if (!window.io) {
        console.error('❌ Socket.IO not loaded!');
        return;
    }

    if (socket && socket.connected) {
        socket.emit('get-users');
        return;
    }
    
    // Connect to socket
    socket = io();
    window.socket = socket;
    
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

    socket.on('walk-mode-added-you', (data) => {
        const walkerId = data.walkerId;
        const walkerName = data.walkerName || 'Friend';
        walkerDisplayNames[walkerId] = walkerName;
        createWalkToast(walkerId, walkerName, data.destination);
    });

    socket.on('walk-mode-location-update', (data) => {
        const walkerId = data.walkerId;
        walkerDisplayNames[walkerId] = data.username || walkerDisplayNames[walkerId] || 'Friend';
        addOrUpdateWalkMarker(walkerId, walkerDisplayNames[walkerId], data.location, data.destination);
        if (currentlyTrackingWalkerId === walkerId && walkModeMarkers[walkerId] && map) {
            map.setView(walkModeMarkers[walkerId].getLatLng(), 18, { animate: true, duration: 1 });
        }
    });

    socket.on('walk-mode-ended', (data) => {
        const walkerId = data.walkerId;
        if (walkModeMarkers[walkerId] && map && map.hasLayer(walkModeMarkers[walkerId])) {
            map.removeLayer(walkModeMarkers[walkerId]);
        }
        if (walkModePathLines[walkerId] && map && map.hasLayer(walkModePathLines[walkerId])) {
            map.removeLayer(walkModePathLines[walkerId]);
        }
        delete walkModeMarkers[walkerId];
        delete walkModePathLines[walkerId];
        delete walkModePaths[walkerId];
        if (currentlyTrackingWalkerId === walkerId) {
            currentlyTrackingWalkerId = null;
            const banner = document.getElementById('walk-watching-banner');
            if (banner) banner.style.display = 'none';
        }
        showNotification(`${data.walkerName || 'Friend'} ${data.status === 'safe' ? 'reached safely' : 'ended walk mode'}`, 'info');
    });

    socket.on('walk-mode-emergency-received', (data) => {
        blinkScreenRed();
        playSOSSound();
        showNotification(`🚨 ${data.message || `${data.walkerName} emergency`}`, 'error');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        if (window.socket === socket) {
            window.socket = null;
        }
    });
}

// Initialize map
function initializeMap() {
    console.log('🗺️ Initializing map...');
    
    if (!window.L) {
        console.error('❌ Leaflet not loaded!');
        return;
    }

    if (map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 150);
        return;
    }
    
    const initialCenter = window.campusConfig
        ? [window.campusConfig.centerLatitude, window.campusConfig.centerLongitude]
        : [23.2599, 77.4126];
    const initialZoom = window.campusConfig?.defaultZoom || 15;
    
    // Create map centered on campus config (or fallback location)
    map = L.map('map').setView(initialCenter, initialZoom);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 250);

    ensureCurrentUserInList();
    
    getCurrentLocation()
        .then((locationData) => {
            myLocation = locationData;

            console.log('📍 My location:', myLocation);

            // Center map on user
            map.setView([myLocation.lat, myLocation.lng], 16);

            // Add user marker
            addUserMarker(window.username, myLocation, true, 'self');

            // Send location to server
            if (socket) {
                socket.emit('location-update', {
                    username: window.username,
                    location: myLocation
                });
            }

            notifyTrackerLocationChange(myLocation);

            // Update tracking analysis
            if (typeof window.updateTrackingAnalysis === 'function') {
                window.updateTrackingAnalysis(myLocation);
            }

            // Start location tracking
            startLocationTracking();
        })
        .catch((error) => {
            console.error('❌ Location error:', error);
            if (!window.isSecureContext && window.location.hostname !== 'localhost') {
                showNotification('Location blocked on HTTP. Use HTTPS or localhost.', 'error');
                return;
            }
            showNotification('Unable to get your location', 'error');
        });
}

// Start tracking user location
function startLocationTracking() {
    if (!navigator.geolocation) return;

    // Track previous location for distance calculation
    let previousLocation = myLocation ? { ...myLocation } : null;
    let lastUpdateTime = myLocation && myLocation.timestamp ? myLocation.timestamp : Date.now();

    setInterval(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const currentTime = Date.now();
                const newLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    speed: position.coords.speed || 0, // m/s from GPS
                    timestamp: currentTime
                };

                // Calculate distance if we have previous location
                let distance = 0;
                let calculatedSpeed = 0;

                if (previousLocation && lastUpdateTime) {
                    // Calculate distance using Haversine formula
                    distance = calculateDistance(
                        previousLocation.lat,
                        previousLocation.lng,
                        newLocation.lat,
                        newLocation.lng
                    );

                    // Calculate time elapsed in hours
                    const timeElapsedHours = (currentTime - lastUpdateTime) / (1000 * 60 * 60);

                    // Calculate speed (km/h) from distance/time
                    if (timeElapsedHours > 0 && distance > 0) {
                        calculatedSpeed = distance / timeElapsedHours;
                    }

                    // Use GPS speed if available, otherwise use calculated speed
                    if (newLocation.speed > 0) {
                        calculatedSpeed = newLocation.speed * 3.6; // m/s -> km/h
                    }

                    console.log('📊 Tracking data:', {
                        distance: `${distance.toFixed(3)} km`,
                        speed: `${calculatedSpeed.toFixed(2)} km/h`,
                        timeElapsed: `${(timeElapsedHours * 60).toFixed(2)} min`
                    });
                }

                // Only update if location changed significantly (approx >= 1m)
                if (
                    !myLocation ||
                    Math.abs(myLocation.lat - newLocation.lat) > 0.00001 ||
                    Math.abs(myLocation.lng - newLocation.lng) > 0.00001
                ) {
                    // Store previous location before updating
                    previousLocation = myLocation ? { ...myLocation } : null;
                    lastUpdateTime = myLocation && myLocation.timestamp ? myLocation.timestamp : currentTime;

                    // Update current location
                    myLocation = newLocation;

                    // Update marker
                    if (markers.self) {
                        markers.self.setLatLng([myLocation.lat, myLocation.lng]);
                    }

                    // Send to server with speed and distance
                    if (socket) {
                        socket.emit('location-update', {
                            username: window.username,
                            location: myLocation,
                            speed: calculatedSpeed,
                            distance: distance
                        });

                        if (walkModeActive) {
                            socket.emit('walk-mode-location', {
                                location: myLocation,
                                destination: walkModeDestination,
                                speed: calculatedSpeed
                            });
                        }
                    }

                    // Notify tracker with enhanced data
                    notifyTrackerLocationChange({
                        ...myLocation,
                        speed: calculatedSpeed,
                        distance: distance
                    });

                    // Update tracking analysis with speed and distance
                    if (typeof window.updateTrackingAnalysis === 'function') {
                        window.updateTrackingAnalysis(myLocation, {
                            speed: calculatedSpeed,
                            distance: distance,
                            timestamp: currentTime
                        });
                    }
                }
            },
            (error) => {
                console.error('❌ Tracking error:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }, 5000); // Update every 5 seconds
}

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// ========== UI FUNCTIONS ==========

// Update users list
function updateUserList(usersList) {
    const usersListElement = document.getElementById('users-list');
    const userCountElement = document.getElementById('user-count');
    
    if (!usersListElement) return;
    
    usersListElement.innerHTML = '';
    const seenNames = new Set();
    
    usersList.forEach(user => {
        if (!user || !user.username) return;
        const normalizedName = String(user.username).trim().toLowerCase();
        if (seenNames.has(normalizedName)) return;
        seenNames.add(normalizedName);

        // Do not render self from server list; fallback self entry handles it.
        if (window.username && normalizedName === String(window.username).trim().toLowerCase()) {
            return;
        }

        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.setAttribute('data-user-id', user.id || user.userId || user.username);
        userItem.innerHTML = `
            <div class="user-avatar">👤</div>
            <div class="user-info">
                <div class="user-name">${user.username}</div>
                <div class="user-status">🟢 Online</div>
            </div>
        `;
        
        const markerKey = user.id || user.userId || user.username;
        userItem.onclick = () => focusOnUser(user.username, markerKey);
        usersListElement.appendChild(userItem);

        // Render latest known location immediately for newly-joined clients.
        if (user.location && typeof user.location.lat === 'number' && typeof user.location.lng === 'number') {
            addUserMarker(user.username, user.location, false, markerKey);
        }
    });

    ensureCurrentUserInList();
    if (userCountElement) {
        userCountElement.textContent = String(usersListElement.querySelectorAll('.user-item').length);
    }
}

// Add user marker to map
function addUserMarker(username, location, isMe = false, markerKey = null) {
    if (!map) return;
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return;
    const key = markerKey || username;

    if (markers[key]) {
        markers[key].setLatLng([location.lat, location.lng]);
        if (markers[key].getPopup()) {
            markers[key].setPopupContent(username);
        } else {
            markers[key].bindPopup(username);
        }
        return;
    }

    let marker = null;

    if (isMe && typeof window.createPulsingMarker === 'function') {
        marker = window.createPulsingMarker(location.lat, location.lng, '#4285F4');
    } else if (!isMe && typeof window.createPhotoMarker === 'function') {
        marker = window.createPhotoMarker(location.lat, location.lng, username);
    } else {
        marker = L.marker([location.lat, location.lng]);
    }

    marker.addTo(map).bindPopup(username);
    markers[key] = marker;
}

// Update user location
function updateUserLocation(data) {
    if (!data || !data.location) return;
    if (data.id && socket && data.id === socket.id) return;
    if (!data.id && data.username === window.username) return; // Skip self fallback
    
    addUserMarker(data.username, data.location, false, data.id || data.username);
}

// Focus on specific user
function focusOnUser(username, markerKey = null) {
    const key = markerKey || username;
    if (markers[key]) {
        map.setView(markers[key].getLatLng(), 18);
        markers[key].openPopup();
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

    const sender = String(message?.username || 'User');
    const currentUser = String(window.username || '');
    const isOwn = sender.trim().toLowerCase() === currentUser.trim().toLowerCase();
    const timestamp = message?.timestamp ? new Date(message.timestamp) : new Date();

    const messageElement = document.createElement('div');
    messageElement.className = `chat-message-float ${isOwn ? 'own-message-float' : 'other-message-float'}`;
    messageElement.innerHTML = `
        <div class="message-header-float">
            <span class="message-username-float">${sender}</span>
            <span class="message-time-float">${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="message-content-float">${message?.message || ''}</div>
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

    blinkScreenRed();
    playSOSSound();
    
    socket.emit('sos-alert', {
        username: window.username,
        location: myLocation,
        timestamp: Date.now()
    });
    
    showNotification('🚨 SOS Alert Sent!', 'error');
}

// Handle incoming SOS alert
function handleSOSAlert(data) {
    blinkScreenRed();
    playSOSSound();
    showNotification(`🚨 ${data.username} needs help!`, 'error');
    
    // Add SOS marker
    if (map) {
        const lat = data?.location?.lat;
        const lng = data?.location?.lng;
        if (typeof lat === 'number' && typeof lng === 'number') {
            let sosMarker = null;
            if (typeof window.createSOSMarker === 'function') {
                sosMarker = window.createSOSMarker(lat, lng);
            } else {
                sosMarker = L.marker([lat, lng]);
            }
            sosMarker
                .addTo(map)
                .bindPopup(`🚨 ${data.username} - SOS Alert!`)
                .openPopup();
        }
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
    const chatForm = document.getElementById('chat-form-float');
    const walkModeBtn = document.getElementById('walk-mode-btn');
    const safeZoneBtn = document.getElementById('safe-zone-btn');
    const walkModalClose = document.getElementById('walk-modal-close');
    const walkCancelBtn = document.getElementById('walk-cancel-btn');
    const walkStartBtn = document.getElementById('walk-start-btn');
    const walkSafeBtn = document.getElementById('walk-safe-btn');
    const walkEmergencyBtn = document.getElementById('walk-emergency-btn');
    const walkStopBtn = document.getElementById('walk-stop-btn');
    
    if (chatBtn && chatPanel) {
        chatBtn.onclick = () => {
            chatPanel.style.display = (chatPanel.style.display === 'none' || chatPanel.style.display === '')
                ? 'flex'
                : 'none';
        };
    }
    
    if (chatCloseBtn) {
        chatCloseBtn.onclick = () => {
            chatPanel.style.display = 'none';
        };
    }

    if (chatForm) {
        chatForm.addEventListener('submit', sendMessageFloat);
    }

    if (walkModeBtn) {
        walkModeBtn.addEventListener('click', () => {
            showWalkModal();
        });
    }

    if (walkModalClose) walkModalClose.addEventListener('click', closeWalkModal);
    if (walkCancelBtn) walkCancelBtn.addEventListener('click', closeWalkModal);
    if (walkStartBtn) walkStartBtn.addEventListener('click', startWalkMode);
    if (walkSafeBtn) walkSafeBtn.addEventListener('click', () => stopWalkMode('safe'));
    if (walkEmergencyBtn) walkEmergencyBtn.addEventListener('click', emergencyWalkMode);
    if (walkStopBtn) walkStopBtn.addEventListener('click', () => stopWalkMode('cancelled'));

    if (safeZoneBtn) {
        safeZoneBtn.addEventListener('click', () => {
            if (typeof window.toggleSafeZonePanel === 'function') {
                window.toggleSafeZonePanel();
                if (typeof window.initializeSafeZones === 'function') {
                    window.initializeSafeZones();
                }
                return;
            }
            showNotification('Safe zone panel unavailable', 'error');
        });
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
        locationBtn.onclick = async () => {
            if (myLocation) {
                map.setView([myLocation.lat, myLocation.lng], 18);
                showNotification('Location centered on map', 'success');
            } else {
                try {
                    myLocation = await getCurrentLocation();
                    if (map) {
                        map.setView([myLocation.lat, myLocation.lng], 18);
                    }
                    if (socket) {
                        socket.emit('location-update', {
                            username: window.username,
                            location: myLocation
                        });
                    }
                    notifyTrackerLocationChange(myLocation);
                    showNotification('Location centered on map', 'success');
                } catch (error) {
                    console.error('❌ Location request failed:', error);
                    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
                        showNotification('Location blocked on HTTP. Use HTTPS or localhost.', 'error');
                    } else if (error && error.code === 1) {
                        showNotification('Location permission denied', 'error');
                    } else {
                        showNotification('No location available', 'error');
                    }
                }
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
window.showNotification = showNotification;
window.calculateDistance = calculateDistance;
window.toRadians = toRadians;
window.getTrackerContext = function() {
    return {
        map,
        socket,
        myLocation,
        username: window.username || null
    };
};

const sosStyle = document.createElement('style');
sosStyle.textContent = `
@keyframes sosFlash {
    from { opacity: 0; }
    to { opacity: 1; }
}`;
document.head.appendChild(sosStyle);
