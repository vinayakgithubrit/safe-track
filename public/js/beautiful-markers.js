// ========== BEAUTIFUL GOOGLE MAPS-STYLE MARKERS ==========

// ========== CSS ANIMATIONS (Add to your styles.css or <style> tag) ==========
const markerStyles = `
<style>
/* Remove default Leaflet divIcon white square */
.leaflet-div-icon.custom-marker,
.leaflet-marker-icon.custom-marker,
.custom-marker {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    overflow: visible !important;
}

/* Keep animated markers smooth while map pans/zooms */
.leaflet-marker-icon.custom-marker {
    transform-origin: center center;
    will-change: transform;
}

/* ========== PULSING DOT MARKER (Google Maps "You Are Here") ========== */
.pulse-marker {
    position: relative;
    width: 24px;
    height: 24px;
}

.pulse-marker-inner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 16px;
    height: 16px;
    background: #4285F4;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 2;
}

.pulse-marker-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
    background: rgba(66, 133, 244, 0.3);
    border-radius: 50%;
    animation: pulse 2s ease-out infinite;
}

@keyframes pulse {
    0% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
    }
    100% {
        transform: translate(-50%, -50%) scale(3);
        opacity: 0;
    }
}

/* ========== 3D PIN MARKER (Classic Google Maps Pin) ========== */
.pin-marker {
    position: relative;
    width: 40px;
    height: 52px;
}

.pin-marker-body {
    position: absolute;
    width: 40px;
    height: 40px;
    background: #EA4335;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.pin-marker-dot {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 12px;
    height: 12px;
    background: white;
    border-radius: 50%;
}

.pin-marker-shadow {
    position: absolute;
    top: 45px;
    left: 50%;
    transform: translateX(-50%);
    width: 30px;
    height: 8px;
    background: radial-gradient(ellipse, rgba(0, 0, 0, 0.3) 0%, transparent 70%);
}

/* ========== USER PHOTO MARKER (With Photo) ========== */
.photo-marker {
    position: relative;
    width: 50px;
    height: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.photo-marker-image {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    object-fit: cover;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 18px;
}

.photo-marker-arrow {
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 12px solid white;
    margin-top: -1px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

/* ========== WALKING PERSON MARKER (Walk Mode) ========== */
.walking-marker {
    position: relative;
    width: 50px;
    height: 50px;
    animation: bounce 1s ease-in-out infinite;
}

.walking-marker-circle {
    width: 50px;
    height: 50px;
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
    border: 3px solid white;
}

.walking-marker-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 50px;
    height: 50px;
    border: 2px solid #28a745;
    border-radius: 50%;
    animation: ripple 1.5s ease-out infinite;
}

@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
}

@keyframes ripple {
    0% {
        transform: scale(1);
        opacity: 1;
    }
    100% {
        transform: scale(1.8);
        opacity: 0;
    }
}

/* ========== SOS EMERGENCY MARKER ========== */
.sos-marker {
    position: relative;
    width: 60px;
    height: 60px;
}

.sos-marker-pulse {
    position: absolute;
    top: 0;
    left: 0;
    width: 60px;
    height: 60px;
    background: radial-gradient(circle, rgba(220, 53, 69, 0.4) 0%, transparent 70%);
    border-radius: 50%;
    animation: sosPulse 1s ease-out infinite;
}

.sos-marker-inner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 50px;
    height: 50px;
    background: #dc3545;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: white;
    border: 4px solid white;
    box-shadow: 0 4px 16px rgba(220, 53, 69, 0.6);
    animation: sosFlash 0.5s ease-in-out infinite;
}

@keyframes sosPulse {
    0% {
        transform: scale(1);
        opacity: 1;
    }
    100% {
        transform: scale(2.5);
        opacity: 0;
    }
}

@keyframes sosFlash {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

/* ========== CLUSTER MARKER (Multiple Users) ========== */
.cluster-marker {
    width: 50px;
    height: 50px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 18px;
    border: 3px solid white;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    cursor: pointer;
    transition: all 0.3s;
}

.cluster-marker:hover {
    transform: scale(1.2);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}
</style>
`;

// Add styles to document
document.head.insertAdjacentHTML('beforeend', markerStyles);

// ========== MARKER CREATION FUNCTIONS ==========

// 1. PULSING DOT MARKER (Your Location - Google Maps Style)
function createPulsingMarker(lat, lng, color = '#4285F4') {
    const markerHTML = `
        <div class="pulse-marker">
            <div class="pulse-marker-ring"></div>
            <div class="pulse-marker-ring" style="animation-delay: 0.5s;"></div>
            <div class="pulse-marker-inner" style="background: ${color};"></div>
        </div>
    `;
    
    const icon = L.divIcon({
        className: 'custom-marker',
        html: markerHTML,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    
    return L.marker([lat, lng], { icon: icon });
}

// 2. 3D PIN MARKER (Classic Map Pin)
function createPinMarker(lat, lng, color = '#EA4335', label = '') {
    const markerHTML = `
        <div class="pin-marker">
            <div class="pin-marker-body" style="background: ${color};">
                <div class="pin-marker-dot"></div>
            </div>
            <div class="pin-marker-shadow"></div>
        </div>
    `;
    
    const icon = L.divIcon({
        className: 'custom-marker',
        html: markerHTML,
        iconSize: [40, 52],
        iconAnchor: [20, 52],
        popupAnchor: [0, -52]
    });
    
    return L.marker([lat, lng], { icon: icon });
}

// 3. USER PHOTO MARKER (With Profile Picture)
function createPhotoMarker(lat, lng, username, photoUrl = null) {
    const initials = username.substring(0, 2).toUpperCase();
    
    const imageContent = photoUrl ? 
        `<img src="${photoUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` :
        initials;
    
    const markerHTML = `
        <div class="photo-marker">
            <div class="photo-marker-image">
                ${imageContent}
            </div>
            <div class="photo-marker-arrow"></div>
        </div>
    `;
    
    const icon = L.divIcon({
        className: 'custom-marker',
        html: markerHTML,
        iconSize: [50, 60],
        iconAnchor: [25, 60],
        popupAnchor: [0, -60]
    });
    
    return L.marker([lat, lng], { icon: icon });
}

// 4. WALKING PERSON MARKER (Walk Mode)
function createWalkingMarker(lat, lng, username) {
    const markerHTML = `
        <div class="walking-marker">
            <div class="walking-marker-ring"></div>
            <div class="walking-marker-circle">
                🚶‍♀️
            </div>
        </div>
    `;
    
    const icon = L.divIcon({
        className: 'custom-marker',
        html: markerHTML,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
        popupAnchor: [0, -25]
    });
    
    return L.marker([lat, lng], { icon: icon });
}

// 5. SOS EMERGENCY MARKER
function createSOSMarker(lat, lng) {
    const markerHTML = `
        <div class="sos-marker">
            <div class="sos-marker-pulse"></div>
            <div class="sos-marker-pulse" style="animation-delay: 0.5s;"></div>
            <div class="sos-marker-inner">
                🚨
            </div>
        </div>
    `;
    
    const icon = L.divIcon({
        className: 'custom-marker',
        html: markerHTML,
        iconSize: [60, 60],
        iconAnchor: [30, 30],
        popupAnchor: [0, -30]
    });
    
    return L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 });
}

// 6. CLUSTER MARKER (Multiple Users in Same Area)
function createClusterMarker(lat, lng, count) {
    const markerHTML = `
        <div class="cluster-marker">
            ${count}
        </div>
    `;
    
    const icon = L.divIcon({
        className: 'custom-marker',
        html: markerHTML,
        iconSize: [50, 50],
        iconAnchor: [25, 25]
    });
    
    return L.marker([lat, lng], { icon: icon });
}

// 7. DIRECTION ARROW MARKER (Showing Movement Direction)
function createDirectionMarker(lat, lng, angle, color = '#4285F4') {
    const markerHTML = `
        <div style="
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${angle}deg);
        ">
            <div style="
                width: 0;
                height: 0;
                border-left: 15px solid transparent;
                border-right: 15px solid transparent;
                border-bottom: 30px solid ${color};
                filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
            "></div>
        </div>
    `;
    
    const icon = L.divIcon({
        className: 'custom-marker',
        html: markerHTML,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
    
    return L.marker([lat, lng], { icon: icon });
}

console.log('✅ Beautiful marker styles loaded!');
