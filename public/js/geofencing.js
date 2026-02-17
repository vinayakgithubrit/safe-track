// ========== GEOFENCING / SAFE ZONES ==========
(function() {
    let zoneCircles = [];
    let previousZoneIds = [];
    let initialized = false;
    let panelInitialized = false;

    function getTrackerContext() {
        if (typeof window.getTrackerContext === 'function') {
            return window.getTrackerContext();
        }
        return null;
    }

    function getSafeZones() {
        if (Array.isArray(window.safeZones) && window.safeZones.length) {
            return window.safeZones;
        }
        return [];
    }

    function isZoneActive(zone) {
        if (!zone.activeHours) return true;
        const currentHour = new Date().getHours();
        const { start, end } = zone.activeHours;
        if (start > end) return currentHour >= start || currentHour < end;
        return currentHour >= start && currentHour < end;
    }

    function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const p1 = (lat1 * Math.PI) / 180;
        const p2 = (lat2 * Math.PI) / 180;
        const dp = ((lat2 - lat1) * Math.PI) / 180;
        const dl = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function getCurrentZones(location) {
        const zones = [];
        getSafeZones().forEach((zone) => {
            if (!zone.enabled) return;
            if (!isZoneActive(zone)) return;
            const distance = calculateDistanceMeters(
                location.lat,
                location.lng,
                zone.latitude,
                zone.longitude
            );
            if (distance <= zone.radius) {
                zones.push(zone);
            }
        });
        return zones;
    }

    function sendZoneEvent(eventType, zone) {
        const ctx = getTrackerContext();
        if (!ctx || !ctx.socket || !ctx.socket.connected) return;
        ctx.socket.emit('zone-event', {
            eventType,
            zoneId: zone.id,
            zoneName: zone.name,
            username: ctx.username || 'Guest',
            timestamp: new Date().toISOString()
        });
    }

    function notify(type, zone) {
        if (typeof window.showNotification !== 'function') return;
        if (type === 'entry') {
            window.showNotification(`Entered safe zone: ${zone.name}`, 'success');
        } else {
            window.showNotification(`Left safe zone: ${zone.name}`, 'error');
        }
    }

    function monitorZones(location) {
        const nowZones = getCurrentZones(location);
        const nowIds = nowZones.map((z) => z.id);

        const entered = nowZones.filter((z) => !previousZoneIds.includes(z.id));
        const exited = getSafeZones().filter(
            (z) => previousZoneIds.includes(z.id) && !nowIds.includes(z.id)
        );

        entered.forEach((zone) => {
            notify('entry', zone);
            sendZoneEvent('entry', zone);
        });

        exited.forEach((zone) => {
            notify('exit', zone);
            sendZoneEvent('exit', zone);
        });

        previousZoneIds = nowIds;
    }

    function drawZones(map) {
        zoneCircles.forEach((circle) => map.removeLayer(circle));
        zoneCircles = [];

        getSafeZones().forEach((zone) => {
            if (!zone.enabled) return;
            const circle = L.circle([zone.latitude, zone.longitude], {
                radius: zone.radius,
                color: zone.color || '#667eea',
                fillColor: zone.color || '#667eea',
                fillOpacity: 0.12,
                weight: 2
            }).addTo(map);

            circle.bindPopup(
                `<strong>${zone.name}</strong><br>Radius: ${zone.radius}m`
            );
            zoneCircles.push(circle);
        });
    }

    function formatActiveHours(hours) {
        if (!hours) return '24/7';
        const to12 = (h) => {
            if (h === 0) return '12 AM';
            if (h === 12) return '12 PM';
            if (h < 12) return `${h} AM`;
            return `${h - 12} PM`;
        };
        return `${to12(hours.start)} - ${to12(hours.end)}`;
    }

    function updateZonePanelList() {
        const list = document.getElementById('zone-list');
        if (!list) return;
        list.innerHTML = getSafeZones().map((zone) => `
            <div class="zone-item" style="border-left: 4px solid ${zone.color || '#667eea'};">
                <div class="zone-item-top">
                    <div>
                        <div class="zone-item-name">${zone.name}</div>
                        <div class="zone-item-meta">${zone.radius}m • ${formatActiveHours(zone.activeHours)}</div>
                    </div>
                    <label class="zone-switch">
                        <input type="checkbox" data-zone-id="${zone.id}" ${zone.enabled ? 'checked' : ''}>
                        <span>On</span>
                    </label>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('input[type="checkbox"][data-zone-id]').forEach((checkbox) => {
            checkbox.addEventListener('change', (e) => {
                const zoneId = e.target.getAttribute('data-zone-id');
                const zone = getSafeZones().find((z) => z.id === zoneId);
                if (!zone) return;
                zone.enabled = e.target.checked;
                const ctx = getTrackerContext();
                if (ctx && ctx.map) drawZones(ctx.map);
                if (typeof window.showNotification === 'function') {
                    window.showNotification(
                        `${zone.name} ${zone.enabled ? 'enabled' : 'disabled'}`,
                        zone.enabled ? 'success' : 'info'
                    );
                }
            });
        });
    }

    function createSafeZonePanel() {
        if (panelInitialized || document.getElementById('zone-management')) return;

        const panel = document.createElement('div');
        panel.id = 'zone-management';
        panel.className = 'zone-management-panel';
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="zone-panel-header">
                <h3>🛡️ Safe Zones</h3>
                <button type="button" id="zone-panel-close">×</button>
            </div>
            <div id="zone-list" class="zone-list"></div>
        `;
        document.body.appendChild(panel);

        const closeBtn = document.getElementById('zone-panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
            });
        }

        updateZonePanelList();
        panelInitialized = true;
    }

    function toggleSafeZonePanel() {
        createSafeZonePanel();
        const panel = document.getElementById('zone-management');
        if (!panel) return;
        updateZonePanelList();
        panel.style.display = (panel.style.display === 'none' || panel.style.display === '')
            ? 'block'
            : 'none';
    }

    function initializeSafeZones() {
        const ctx = getTrackerContext();
        if (!ctx || !ctx.map || !window.L) {
            setTimeout(initializeSafeZones, 500);
            return;
        }

        if (!getSafeZones().length) {
            console.warn('No safe zones configured');
            return;
        }

        drawZones(ctx.map);
        initialized = true;
        console.log(`Safe zones initialized: ${getSafeZones().length}`);

        if (ctx.myLocation) {
            monitorZones(ctx.myLocation);
        }
    }

    const previousLocationHook = window.onTrackerLocationUpdate;
    window.onTrackerLocationUpdate = function(location) {
        if (typeof previousLocationHook === 'function') {
            previousLocationHook(location);
        }
        if (!initialized || !location) return;
        monitorZones(location);
    };

    window.initializeSafeZones = initializeSafeZones;
    window.toggleSafeZonePanel = toggleSafeZonePanel;
    window.addEventListener('load', function() {
        createSafeZonePanel();
        setTimeout(initializeSafeZones, 1200);
    });
})();
