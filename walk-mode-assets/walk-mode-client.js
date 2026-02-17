// ================================================================
// WALK-ME-HOME FEATURE - CLIENT SIDE CODE (script.js)
// Copy this entire file or integrate into your existing script.js
// ================================================================

// ========== GLOBAL VARIABLES ==========

// Walk Mode (Walker - person walking)
let walkModeActive = false;
let walkModeFriends = [];
let walkModeStartTime = null;
let walkModeInterval = null;
let walkModeDestination = '';

// Walk Tracking (Watcher - person watching friend)
const WALK_TRACK_ZOOM = 18; // Street-level zoom like Swiggy/Zomato
let currentlyTrackingWalkerId = null;
let walkerDisplayNames = {}; // walkerId -> walkerName
let walkModeMarkers = {}; // walkerId -> marker object
let walkModePaths = {}; // walkerId -> array of [lat, lng] points
let walkModePathLines = {}; // walkerId -> Leaflet polyline object
let pendingFocusWalkerId = null;

// ========== SOCKET EVENT HANDLERS ==========

// 1. Receive notification that friend started walking
socket.on('walk-mode-added-you', (data) => {
    console.log('');
    console.log('🔔 WALK MODE NOTIFICATION RECEIVED');
    console.log('   Walker Name:', data.walkerName);
    console.log('   Walker ID:', data.walkerId);
    console.log('   Destination:', data.destination);
    console.log('='.repeat(60));
    
    const walkerId = data.walkerId;
    const walkerName = data.walkerName || 'Friend';
    
    // Store walker info
    walkerDisplayNames[walkerId] = walkerName;
    
    // Show notification
    showNotification(`🚶‍♀️ ${walkerName} is walking to ${data.destination}`, 'success');
    playNotificationSound();
    
    // Create "View Map" toast notification
    createViewMapToast(walkerId, walkerName, data.destination);
});

// 2. Receive location update from walking friend
socket.on('walk-mode-location-update', function(data) {
    console.log('');
    console.log('📍 WALK MODE LOCATION UPDATE');
    console.log('   Walker ID:', data.walkerId);
    console.log('   Username:', data.username);
    console.log('   Location:', data.location);
    console.log('   Destination:', data.destination);
    
    const wid = data.walkerId;
    
    if (!wid) {
        console.error('❌ No walkerId in location update!');
        return;
    }
    
    // Store walker name
    walkerDisplayNames[wid] = data.username;
    
    // Create or update marker
    addOrUpdateWalkModeMarker(wid, data.username, data.location, data.destination);
    
    console.log('✅ Marker updated');
    console.log('   Available markers:', Object.keys(walkModeMarkers));
    
    // AUTO-ZOOM if this is the person we're currently tracking
    if (currentlyTrackingWalkerId === wid) {
        console.log('🎯 THIS IS WHO WE ARE TRACKING - AUTO-ZOOMING!');
        
        if (map && walkModeMarkers[wid]) {
            const latLng = walkModeMarkers[wid].getLatLng();
            
            console.log('   Zooming to:', latLng);
            
            // Refresh map and zoom
            map.invalidateSize();
            map.setView(latLng, WALK_TRACK_ZOOM, {
                animate: true,
                duration: 1.5,
                easeLinearity: 0.5
            });
            
            console.log('✅ Auto-zoom complete!');
        }
    }
    
    // Check if we were waiting to zoom (clicked button before location arrived)
    if (pendingFocusWalkerId === wid) {
        console.log('✅ PENDING FOCUS - Zooming now!');
        
        setTimeout(() => {
            if (map && walkModeMarkers[wid]) {
                const latLng = walkModeMarkers[wid].getLatLng();
                map.invalidateSize();
                map.setView(latLng, WALK_TRACK_ZOOM, {
                    animate: true,
                    duration: 1.5
                });
                
                // Open popup
                setTimeout(() => {
                    if (walkModeMarkers[wid]) {
                        walkModeMarkers[wid].openPopup();
                    }
                }, 1600);
                
                pendingFocusWalkerId = null;
                showNotification(`✅ Now tracking ${data.username}!`, 'success');
            }
        }, 500);
    }
    
    // Update path
    if (!walkModePaths[wid]) {
        walkModePaths[wid] = [];
    }
    
    walkModePaths[wid].push([data.location.lat, data.location.lng]);
    
    // Keep only last 20 points
    if (walkModePaths[wid].length > 20) {
        walkModePaths[wid].shift();
    }
    
    // Draw path on map
    drawWalkModePath(wid);
});

// 3. Walk mode ended (friend reached safely)
socket.on('walk-mode-ended', function(data) {
    console.log('🏁 WALK MODE ENDED');
    console.log('   Walker:', data.username);
    console.log('   Status:', data.status);
    
    const wid = data.walkerId;
    
    // Remove marker
    if (walkModeMarkers[wid]) {
        if (map && map.hasLayer(walkModeMarkers[wid])) {
            map.removeLayer(walkModeMarkers[wid]);
        }
        delete walkModeMarkers[wid];
    }
    
    // Remove path
    if (walkModePathLines[wid]) {
        if (map && map.hasLayer(walkModePathLines[wid])) {
            map.removeLayer(walkModePathLines[wid]);
        }
        delete walkModePathLines[wid];
    }
    
    delete walkModePaths[wid];
    delete walkerDisplayNames[wid];
    
    // Remove watching banner if tracking this person
    if (currentlyTrackingWalkerId === wid) {
        const banner = document.querySelector('.watching-banner');
        if (banner) banner.remove();
        currentlyTrackingWalkerId = null;
    }
    
    showNotification(`✅ ${data.username} reached destination safely!`, 'success');
});

// 4. Emergency alert
socket.on('walk-mode-emergency-received', (data) => {
    console.log('🚨 WALK MODE EMERGENCY RECEIVED');
    console.log('   Walker:', data.username);
    console.log('   Type:', data.type);
    console.log('   Message:', data.message);
    
    // Show alert
    showNotification(`🚨 ${data.message}`, 'error');
    flashScreen('red');
    playAlertSound();
    
    // Show emergency modal
    showEmergencyModal(data);
});

// ========== WALKER FUNCTIONS (Person Walking) ==========

function showWalkModal() {
    // Check if logged in (if using auth)
    if (typeof authToken !== 'undefined' && !authToken) {
        alert('Please login to use Walk-Me-Home mode');
        return;
    }
    
    const modal = document.getElementById('walk-mode-modal');
    if (modal) {
        modal.style.display = 'flex';
        
        // Load friends list if function exists
        if (typeof loadUserFriends === 'function') {
            loadUserFriends().then(() => {
                renderFriendList();
            });
        } else {
            // Simple friend list for testing without auth
            renderSimpleFriendList();
        }
    }
}

function closeWalkModal() {
    const modal = document.getElementById('walk-mode-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function startWalkMode() {
    // Get selected friends
    const selectedFriends = [];
    const friendItems = document.querySelectorAll('.friend-item.selected');
    
    friendItems.forEach(item => {
        selectedFriends.push({
            id: item.dataset.friendId,
            username: item.dataset.friendUsername
        });
    });
    
    if (selectedFriends.length === 0) {
        alert('Please select at least one trusted friend');
        return;
    }
    
    if (selectedFriends.length > 3) {
        alert('Maximum 3 friends allowed');
        return;
    }
    
    // Get destination
    const destinationInput = document.getElementById('walk-destination-input');
    const destination = destinationInput ? destinationInput.value.trim() : '';
    
    if (!destination) {
        alert('Please enter a destination');
        return;
    }
    
    // Close modal
    closeWalkModal();
    
    // Set walk mode state
    walkModeActive = true;
    walkModeStartTime = Date.now();
    walkModeFriends = selectedFriends.map(f => f.id);
    walkModeDestination = destination;
    
    // Update UI
    const trackingModal = document.getElementById('walk-tracking-modal');
    if (trackingModal) {
        trackingModal.style.display = 'flex';
    }
    
    const walkBtn = document.getElementById('walk-mode-btn');
    if (walkBtn) {
        walkBtn.classList.add('active');
    }
    
    const walkStatus = document.getElementById('walk-mode-status');
    if (walkStatus) {
        walkStatus.style.display = 'block';
    }
    
    // Send to server
    socket.emit('walk-mode-start', {
        username: username,
        friends: walkModeFriends, // Array of friend IDs
        destination: destination,
        location: myLocation ? { lat: myLocation.lat, lng: myLocation.lng } : null
    });
    
    // Start monitoring
    startWalkMonitoring();
    
    showNotification(`Walk mode started! ${selectedFriends.length} friends notified`, 'success');
    
    console.log('✅ WALK MODE STARTED');
    console.log('   Friends:', walkModeFriends);
    console.log('   Destination:', destination);
}

function startWalkMonitoring() {
    // Update timer every second
    walkModeInterval = setInterval(() => {
        if (!walkModeActive) {
            clearInterval(walkModeInterval);
            return;
        }
        
        const elapsed = Math.floor((Date.now() - walkModeStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const timerEl = document.getElementById('walk-duration');
        if (timerEl) {
            timerEl.textContent = timeStr;
        }
    }, 1000);
}

function markReachedSafely() {
    if (!walkModeActive) return;
    
    // Send complete event to server
    socket.emit('walk-mode-complete', {
        username: username,
        status: 'safe',
        timestamp: new Date().toISOString()
    });
    
    // Stop walk mode
    stopWalkMode();
    
    showNotification('✅ Marked as reached safely! Friends notified.', 'success');
}

function emergencyWalkAlert() {
    if (!walkModeActive) return;
    
    if (confirm('Send emergency alert to all friends?')) {
        socket.emit('walk-mode-emergency', {
            username: username,
            type: 'manual',
            message: `${username} triggered emergency during walk mode!`,
            location: myLocation ? { lat: myLocation.lat, lng: myLocation.lng } : null,
            timestamp: new Date().toISOString()
        });
        
        flashScreen('red');
        playAlertSound();
        showNotification('🚨 Emergency alert sent to friends!', 'error');
    }
}

function stopWalkMode() {
    walkModeActive = false;
    
    if (walkModeInterval) {
        clearInterval(walkModeInterval);
        walkModeInterval = null;
    }
    
    const trackingModal = document.getElementById('walk-tracking-modal');
    if (trackingModal) {
        trackingModal.style.display = 'none';
    }
    
    const walkBtn = document.getElementById('walk-mode-btn');
    if (walkBtn) {
        walkBtn.classList.remove('active');
    }
    
    const walkStatus = document.getElementById('walk-mode-status');
    if (walkStatus) {
        walkStatus.style.display = 'none';
    }
    
    walkModeFriends = [];
    walkModeStartTime = null;
    walkModeDestination = '';
    
    console.log('🏁 Walk mode stopped');
}

// ========== WATCHER FUNCTIONS (Person Watching Friend) ==========

function createViewMapToast(walkerId, walkerName, destination) {
    // Remove old toast if exists
    const oldToast = document.getElementById(`walk-toast-${walkerId}`);
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.id = `walk-toast-${walkerId}`;
    toast.className = 'walk-notification-toast';
    toast.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        z-index: 10002;
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        color: white;
        padding: 20px;
        border-radius: 15px;
        box-shadow: 0 10px 40px rgba(40, 167, 69, 0.5);
        max-width: 350px;
        animation: slideInRight 0.3s ease-out;
    `;
    
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="font-size: 40px;">🚶‍♀️</div>
            <div style="flex: 1;">
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">
                    ${walkerName} is walking
                </div>
                <div style="font-size: 13px; opacity: 0.9;">
                    to ${destination || 'destination'}
                </div>
            </div>
        </div>
        <button onclick="viewWalkerOnMap('${walkerId}', '${walkerName}')" style="
            width: 100%;
            margin-top: 15px;
            padding: 12px;
            background: white;
            color: #28a745;
            border: none;
            border-radius: 10px;
            font-weight: bold;
            font-size: 15px;
            cursor: pointer;
            transition: all 0.2s;
        " onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
            📍 View on Map
        </button>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 20 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }
    }, 20000);
}

function viewWalkerOnMap(walkerId, walkerName) {
    console.log('');
    console.log('🔘 VIEW MAP BUTTON CLICKED');
    console.log('   Walker ID:', walkerId);
    console.log('   Walker Name:', walkerName);
    console.log('='.repeat(60));
    
    // Remove toast
    const toast = document.getElementById(`walk-toast-${walkerId}`);
    if (toast) toast.remove();
    
    // Start tracking
    startTrackingWalker(walkerId, walkerName);
}

function startTrackingWalker(walkerId, walkerName) {
    console.log('');
    console.log('🎯 START TRACKING WALKER');
    console.log('   Walker ID:', walkerId);
    console.log('   Walker Name:', walkerName);
    console.log('='.repeat(60));
    
    // Set as currently tracking
    currentlyTrackingWalkerId = walkerId;
    pendingFocusWalkerId = walkerId;
    
    // Show "Watching" banner
    showWatchingBanner(walkerName);
    
    // Scroll to map
    const mapContainer = document.querySelector('.map-container') || document.getElementById('map');
    if (mapContainer) {
        mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Refresh map after scroll
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 300);
    
    // Try to zoom to marker (with retry)
    setTimeout(() => {
        checkAndZoomToMarker(walkerId, walkerName);
    }, 500);
}

function showWatchingBanner(walkerName) {
    // Remove old banner
    const oldBanner = document.querySelector('.watching-banner');
    if (oldBanner) oldBanner.remove();
    
    const banner = document.createElement('div');
    banner.className = 'watching-banner';
    banner.style.cssText = `
        position: fixed;
        top: 90px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1001;
        background: rgba(40, 167, 69, 0.95);
        color: white;
        padding: 12px 25px;
        border-radius: 25px;
        font-size: 15px;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(10px);
    `;
    
    banner.innerHTML = `👁️ Watching: <strong>${walkerName}</strong> — live path`;
    
    document.body.appendChild(banner);
}

function checkAndZoomToMarker(walkerId, walkerName, retryCount = 0) {
    console.log(`🔍 Checking for marker (attempt ${retryCount + 1}/30)`);
    console.log('   Looking for walkerId:', walkerId);
    console.log('   Available markers:', Object.keys(walkModeMarkers));
    
    // Check if map is ready
    if (!map) {
        console.log('⚠️ Map not ready yet...');
        if (retryCount < 30) {
            setTimeout(() => checkAndZoomToMarker(walkerId, walkerName, retryCount + 1), 1000);
        }
        return;
    }
    
    // Check if marker exists
    const marker = walkModeMarkers[walkerId];
    
    if (marker) {
        console.log('✅ MARKER FOUND! ZOOMING NOW!');
        
        const latLng = marker.getLatLng();
        console.log('   Location:', latLng);
        console.log('   Zoom level:', WALK_TRACK_ZOOM);
        
        // ZOOM TO MARKER
        map.setView(latLng, WALK_TRACK_ZOOM, {
            animate: true,
            duration: 2,
            easeLinearity: 0.5
        });
        
        console.log('🔎 ZOOM COMMAND SENT!');
        
        // Open popup after zoom
        setTimeout(() => {
            if (marker) {
                marker.openPopup();
                console.log('✅ Popup opened!');
            }
        }, 2100);
        
        showNotification(`✅ Tracking ${walkerName}!`, 'success');
        pendingFocusWalkerId = null;
        
    } else {
        console.log('⚠️ Marker not found yet');
        
        // Show "waiting" notification only on first attempt
        if (retryCount === 0) {
            showNotification(`Waiting for ${walkerName}'s location...`, 'info');
        }
        
        // Retry up to 30 times (30 seconds)
        if (retryCount < 30) {
            setTimeout(() => checkAndZoomToMarker(walkerId, walkerName, retryCount + 1), 1000);
        } else {
            console.error('❌ Marker still not found after 30 seconds!');
            showNotification(`${walkerName} hasn't shared location yet`, 'warning');
            pendingFocusWalkerId = null;
        }
    }
}

function addOrUpdateWalkModeMarker(walkerId, displayName, location, destination) {
    if (!map || !walkerId) return;
    
    const name = displayName || walkerDisplayNames[walkerId] || 'Friend';
    
    // Create marker icon (green walking person)
    const walkIcon = L.divIcon({
        className: 'walk-mode-marker',
        html: `
            <div style="
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 20px;
                border: 3px solid white;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
            ">
                🚶‍♀️
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });
    
    // Update existing marker or create new one
    if (walkModeMarkers[walkerId]) {
        walkModeMarkers[walkerId].setLatLng([location.lat, location.lng]);
        console.log('   Updated existing marker');
    } else {
        walkModeMarkers[walkerId] = L.marker([location.lat, location.lng], { 
            icon: walkIcon,
            zIndexOffset: 1000
        }).addTo(map);
        
        // Add popup
        walkModeMarkers[walkerId].bindPopup(`
            <div style="text-align: center; min-width: 200px; padding: 5px;">
                <div style="font-size: 24px; margin-bottom: 8px;">🚶‍♀️</div>
                <div style="font-weight: bold; font-size: 16px; color: #28a745; margin-bottom: 5px;">
                    ${name}
                </div>
                <div style="font-size: 13px; color: #666; margin-bottom: 3px;">
                    <strong>Walking Home Mode</strong>
                </div>
                ${destination ? `
                    <div style="font-size: 12px; color: #999; margin-bottom: 8px;">
                        → ${destination}
                    </div>
                ` : ''}
                <div style="font-size: 11px; color: #999;">
                    Last update: ${new Date().toLocaleTimeString()}
                </div>
            </div>
        `);
        
        console.log('   Created new marker');
    }
}

function drawWalkModePath(walkerId) {
    if (!map || !walkModePaths[walkerId]) return;
    
    const points = walkModePaths[walkerId];
    
    if (points.length < 2) return;
    
    // Remove old path line
    if (walkModePathLines[walkerId]) {
        if (map.hasLayer(walkModePathLines[walkerId])) {
            map.removeLayer(walkModePathLines[walkerId]);
        }
    }
    
    // Draw new path line (green dashed line)
    walkModePathLines[walkerId] = L.polyline(points, {
        color: '#28a745',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 5',
        lineJoin: 'round',
        lineCap: 'round'
    }).addTo(map);
    
    console.log('   Drew path with', points.length, 'points');
}

// ========== HELPER FUNCTIONS ==========

function showEmergencyModal(data) {
    // Remove old modal if exists
    const oldModal = document.getElementById('emergency-modal');
    if (oldModal) oldModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'emergency-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10003;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 400px;
            text-align: center;
        ">
            <div style="font-size: 60px; margin-bottom: 15px;">🚨</div>
            <h2 style="color: #dc3545; margin: 0 0 15px 0;">
                Walk Mode Emergency
            </h2>
            <p style="margin: 0 0 15px 0; font-size: 16px;">
                ${data.message}
            </p>
            ${data.location ? `
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #666;">
                    📍 Location: ${data.location.lat.toFixed(6)}, ${data.location.lng.toFixed(6)}
                </p>
                <button onclick="openLocationInGoogleMaps(${data.location.lat}, ${data.location.lng})" style="
                    width: 100%;
                    padding: 12px;
                    background: #4285F4;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: bold;
                    font-size: 14px;
                    cursor: pointer;
                    margin-bottom: 10px;
                ">
                    🗺️ Open in Google Maps
                </button>
            ` : ''}
            <button onclick="this.closest('#emergency-modal').remove()" style="
                width: 100%;
                padding: 12px;
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 14px;
                cursor: pointer;
            ">
                I Understand
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function openLocationInGoogleMaps(lat, lng) {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(url, '_blank');
}

function flashScreen(color) {
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: ${color};
        opacity: 0.7;
        z-index: 99999;
        pointer-events: none;
        animation: flash-fade 0.5s ease-in-out 3;
    `;
    
    document.body.appendChild(flash);
    
    setTimeout(() => {
        if (flash.parentElement) {
            flash.remove();
        }
    }, 1500);
}

function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.value = 800;
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.log('Alert sound not supported');
    }
}

function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.value = 600;
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
    } catch (e) {
        console.log('Notification sound not supported');
    }
}

function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10001;
        animation: slideInRight 0.3s ease-out;
        max-width: 350px;
        font-size: 14px;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 300);
    }, 4000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes flash-fade {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 0.3; }
    }
`;
document.head.appendChild(style);

// Simple friend list for testing (without auth system)
function renderSimpleFriendList() {
    const friendList = document.getElementById('friend-list');
    if (!friendList) return;
    
    // Example friends for testing
    const testFriends = [
        { id: 'friend1', username: 'Vinayak', online: true },
        { id: 'friend2', username: 'Ava', online: true },
        { id: 'friend3', username: 'Mark', online: false }
    ];
    
    friendList.innerHTML = testFriends.map(friend => `
        <div class="friend-item" data-friend-id="${friend.id}" data-friend-username="${friend.username}" onclick="toggleFriendSelection(this)">
            <div style="
                width: 35px;
                height: 35px;
                background: #f0f0f0;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #999;
                font-weight: bold;
                font-size: 14px;
            ">
                ${friend.username.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 14px;">${friend.username}</div>
                <div style="font-size: 11px; color: ${friend.online ? '#28a745' : '#999'};">
                    ${friend.online ? '🟢 Online' : '⚪ Offline'}
                </div>
            </div>
        </div>
    `).join('');
}

function toggleFriendSelection(element) {
    const selected = document.querySelectorAll('.friend-item.selected');
    
    if (element.classList.contains('selected')) {
        element.classList.remove('selected');
    } else {
        if (selected.length >= 3) {
            alert('Maximum 3 friends allowed');
            return;
        }
        element.classList.add('selected');
    }
}

console.log('✅ Walk-Me-Home feature loaded (client-side)');
console.log('   WALK_TRACK_ZOOM:', WALK_TRACK_ZOOM);
console.log('   Ready to track friends!');
