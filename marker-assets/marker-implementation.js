// ========== HOW TO USE BEAUTIFUL MARKERS IN YOUR PROJECT ==========

// ========== STEP 1: REPLACE YOUR CURRENT MARKERS ==========

// ❌ OLD WAY (Default Leaflet Markers)
const myIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/marker-icon-2x-red.png',
    iconSize: [25, 41]
});

// ✅ NEW WAY (Beautiful Custom Markers)
// Just use the helper functions!

// ========== STEP 2: UPDATE YOUR MARKER CREATION CODE ==========

// FOR YOUR OWN LOCATION (Replace in startLocationWatching)
function startLocationWatching() {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            
            const updateMarker = () => {
                if (!map) {
                    setTimeout(updateMarker, 500);
                    return;
                }
                
                // ✅ NEW: Use pulsing marker for "You"
                if (!markers['me']) {
                    markers['me'] = createPulsingMarker(latitude, longitude, '#4285F4');
                    markers['me'].addTo(map);
                    markers['me'].bindPopup(`
                        <div style="text-align: center; padding: 5px;">
                            <div style="font-weight: bold; color: #4285F4;">📍 You</div>
                            <div style="font-size: 12px; color: #666; margin-top: 3px;">
                                ${username}
                            </div>
                        </div>
                    `).openPopup();
                    map.setView([latitude, longitude], 15);
                } else {
                    // Update position
                    markers['me'].setLatLng([latitude, longitude]);
                }
                
                myLocation = { lat: latitude, lng: longitude };
            };
            updateMarker();
        },
        (error) => console.error('Watch error:', error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
}

// FOR OTHER USERS (Replace in addOrUpdateMarker)
function addOrUpdateMarker(data) {
    const { id, username, latitude, longitude, speed } = data;
    
    const updateMarker = () => {
        if (!map) {
            setTimeout(updateMarker, 500);
            return;
        }
        
        if (markers[id]) {
            markers[id].setLatLng([latitude, longitude]);
        } else {
            // ✅ NEW: Use photo marker for other users
            markers[id] = createPhotoMarker(
                latitude, 
                longitude, 
                username,
                currentUserData?.profilePicture // If you have profile pics
            );
            markers[id].addTo(map);
            markers[id].bindPopup(`
                <div style="text-align: center; padding: 8px; min-width: 150px;">
                    <div style="font-weight: bold; font-size: 15px; margin-bottom: 5px;">
                        ${username}
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        ⚡ ${speed.toFixed(1)} km/h
                    </div>
                    <div style="font-size: 11px; color: #999; margin-top: 3px;">
                        📍 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}
                    </div>
                </div>
            `);
        }
    };
    updateMarker();
}

// FOR WALK MODE (Replace in addOrUpdateWalkModeMarker)
function addOrUpdateWalkModeMarker(walkerId, displayName, location) {
    if (!map || !walkerId) return;
    
    const name = displayName || walkerDisplayNames[walkerId] || 'Friend';
    
    if (walkModeMarkers[walkerId]) {
        // Update existing marker
        walkModeMarkers[walkerId].setLatLng([location.lat, location.lng]);
    } else {
        // ✅ NEW: Use walking marker
        walkModeMarkers[walkerId] = createWalkingMarker(
            location.lat, 
            location.lng, 
            name
        );
        walkModeMarkers[walkerId].addTo(map);
        
        walkModeMarkers[walkerId].bindPopup(`
            <div style="text-align: center; padding: 10px; min-width: 200px;">
                <div style="font-size: 24px; margin-bottom: 5px;">🚶‍♀️</div>
                <div style="font-weight: bold; font-size: 16px; color: #28a745;">
                    ${name}
                </div>
                <div style="font-size: 13px; color: #666; margin: 5px 0;">
                    Walking Home Mode
                </div>
                <div style="font-size: 11px; color: #999;">
                    Last update: ${new Date().toLocaleTimeString()}
                </div>
            </div>
        `).openPopup();
        
        showNotification(`🚶‍♀️ ${name} is now in Walk-Me-Home mode!`, 'info');
    }
}

// FOR SOS ALERTS (Replace in sos-received handler)
socket.on('sos-received', (data) => {
    flashScreen('red');
    playAlertSound();
    
    const addSOSMarker = () => {
        if (!map) {
            setTimeout(addSOSMarker, 500);
            return;
        }
        
        map.setView([data.latitude, data.longitude], 16);
        
        // ✅ NEW: Use SOS marker
        const sosMarker = createSOSMarker(data.latitude, data.longitude);
        sosMarker.addTo(map);
        
        sosMarker.bindPopup(`
            <div style="text-align: center; padding: 15px; min-width: 250px;">
                <div style="font-size: 40px; margin-bottom: 10px;">🚨</div>
                <div style="font-weight: bold; font-size: 18px; color: #dc3545; margin-bottom: 5px;">
                    EMERGENCY ALERT
                </div>
                <div style="font-size: 15px; font-weight: 600; margin-bottom: 10px;">
                    ${data.username}
                </div>
                <div style="font-size: 12px; color: #666; margin-bottom: 10px;">
                    ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}
                </div>
                <button onclick="openInGoogleMaps(${data.latitude}, ${data.longitude})" 
                        style="width: 100%; padding: 10px; background: #dc3545; color: white; 
                               border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
                    🗺️ Open in Google Maps
                </button>
            </div>
        `).openPopup();
        
        sosMarkers.push(sosMarker);
        
        // Remove after 10 minutes
        setTimeout(() => {
            if (map.hasLayer(sosMarker)) {
                map.removeLayer(sosMarker);
            }
        }, 600000);
    };
    addSOSMarker();
});

// ========== STEP 3: ADD MOVEMENT DIRECTION (BONUS!) ==========

// Track user's movement direction and show arrow
let lastPosition = null;

function updateUserMarkerWithDirection(latitude, longitude) {
    if (lastPosition) {
        // Calculate direction angle
        const angle = calculateBearing(
            lastPosition.lat, lastPosition.lng,
            latitude, longitude
        );
        
        // Create direction arrow
        const directionMarker = createDirectionMarker(
            latitude, 
            longitude, 
            angle, 
            '#4285F4'
        );
        
        // Remove old direction marker if exists
        if (markers['me-direction']) {
            map.removeLayer(markers['me-direction']);
        }
        
        markers['me-direction'] = directionMarker;
        markers['me-direction'].addTo(map);
    }
    
    lastPosition = { lat: latitude, lng: longitude };
}

function calculateBearing(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360
}

// ========== STEP 4: ADD SMOOTH MARKER ANIMATIONS ==========

// Animate marker movement instead of instant jump
function animateMarkerTo(marker, newLatLng, duration = 1000) {
    const startLatLng = marker.getLatLng();
    const startTime = Date.now();
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-in-out)
        const eased = progress < 0.5
            ? 2 * progress * progress
            : -1 + (4 - 2 * progress) * progress;
        
        const lat = startLatLng.lat + (newLatLng.lat - startLatLng.lat) * eased;
        const lng = startLatLng.lng + (newLatLng.lng - startLatLng.lng) * eased;
        
        marker.setLatLng([lat, lng]);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
}

// Use in location update:
function updateMarkerPosition(id, latitude, longitude) {
    if (markers[id]) {
        const newLatLng = L.latLng(latitude, longitude);
        animateMarkerTo(markers[id], newLatLng, 1000); // 1 second animation
    }
}

// ========== STEP 5: ADD MARKER CLUSTERS FOR MANY USERS ==========

// When multiple users are close together
function checkAndCreateClusters() {
    const CLUSTER_DISTANCE = 0.001; // ~100 meters
    const userPositions = new Map();
    
    // Group users by proximity
    Object.entries(markers).forEach(([id, marker]) => {
        if (id === 'me') return;
        
        const latLng = marker.getLatLng();
        let clustered = false;
        
        userPositions.forEach((users, key) => {
            const clusterLatLng = L.latLng(key.split(',').map(Number));
            if (latLng.distanceTo(clusterLatLng) < CLUSTER_DISTANCE * 111000) {
                users.push(id);
                clustered = true;
            }
        });
        
        if (!clustered) {
            userPositions.set(`${latLng.lat},${latLng.lng}`, [id]);
        }
    });
    
    // Create cluster markers
    userPositions.forEach((users, key) => {
        if (users.length > 1) {
            const [lat, lng] = key.split(',').map(Number);
            
            // Remove individual markers
            users.forEach(id => {
                if (markers[id]) {
                    map.removeLayer(markers[id]);
                }
            });
            
            // Create cluster marker
            const clusterMarker = createClusterMarker(lat, lng, users.length);
            clusterMarker.addTo(map);
            
            clusterMarker.on('click', () => {
                // Show list of users in this cluster
                const userList = users.map(id => `• ${id}`).join('<br>');
                clusterMarker.bindPopup(`
                    <div style="padding: 10px;">
                        <div style="font-weight: bold; margin-bottom: 8px;">
                            ${users.length} users here:
                        </div>
                        <div style="font-size: 13px;">
                            ${userList}
                        </div>
                    </div>
                `).openPopup();
            });
        }
    });
}

// ========== COMPLETE EXAMPLE: BEAUTIFUL WALK MODE MARKER ==========

function createBeautifulWalkModeMarker(walkerId, walkerName, location) {
    // First check if marker exists
    if (walkModeMarkers[walkerId]) {
        // Animate to new position
        animateMarkerTo(
            walkModeMarkers[walkerId], 
            L.latLng(location.lat, location.lng), 
            1000
        );
        return;
    }
    
    // Create new beautiful marker
    const marker = createWalkingMarker(location.lat, location.lng, walkerName);
    marker.addTo(map);
    
    // Add beautiful popup
    marker.bindPopup(`
        <div style="
            text-align: center; 
            padding: 15px; 
            min-width: 220px;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-radius: 12px;
        ">
            <div style="
                width: 60px; 
                height: 60px; 
                margin: 0 auto 10px; 
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 30px;
                box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
            ">
                🚶‍♀️
            </div>
            <div style="font-weight: 700; font-size: 18px; color: #2d3748; margin-bottom: 5px;">
                ${walkerName}
            </div>
            <div style="
                background: rgba(40, 167, 69, 0.1);
                padding: 8px 12px;
                border-radius: 6px;
                margin: 10px 0;
            ">
                <div style="font-size: 12px; font-weight: 600; color: #28a745;">
                    🟢 WALKING HOME MODE
                </div>
            </div>
            <div style="font-size: 11px; color: #718096;">
                Last update: ${new Date().toLocaleTimeString()}
            </div>
            <button onclick="focusOnWalker('${walkerId}')" style="
                margin-top: 12px;
                width: 100%;
                padding: 10px;
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
            ">
                📍 Center on Map
            </button>
        </div>
    `);
    
    walkModeMarkers[walkerId] = marker;
    
    // Auto-open popup with animation
    setTimeout(() => {
        marker.openPopup();
    }, 300);
    
    return marker;
}

console.log('✅ Beautiful marker implementation loaded!');
console.log('📍 Now your map looks like Google Maps!');
