document.addEventListener('DOMContentLoaded', function() {
    const landingPage = document.getElementById('landing-page');
    const loginModal = document.getElementById('login-modal');
    const mainApp = document.getElementById('main-app');
    const getStartedBtn = document.getElementById('get-started-btn');
    const startTrackingBtn = document.getElementById('start-tracking-btn');
    const continueBtn = document.getElementById('continue-btn');
    const skipBtn = document.getElementById('skip-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const usernameInput = document.getElementById('username-input');
    const userIdInput = document.getElementById('user-id');
    const usernameDisplay = document.getElementById('username-display');
    const chatInput = document.getElementById('chat-input-float');
    const chatMessages = document.getElementById('chat-messages-float');
    let appInitialized = false;
    let sosTimer = null;
    let walkModeActive = false;

    // Tracking analysis variables
    let trackingStartTime = null;
    let totalDistance = 0;
    let lastLocation = null;
    let lastUpdateTime = null;
    let maxSpeed = 0;
    let speedHistory = [];
    let activeTimeInterval = null;

    if (landingPage) {
        landingPage.style.display = 'flex';
        landingPage.classList.remove('hidden', 'modal-open');
    }
    if (loginModal) {
        loginModal.style.display = 'none';
        loginModal.classList.remove('active');
    }
    if (mainApp) {
        mainApp.style.display = 'none';
        mainApp.classList.remove('active');
    }

    function startMainApp() {
        if (!appInitialized) {
            if (typeof window.initializeSocketListeners === 'function') {
                window.initializeSocketListeners();
            }
            if (typeof window.initializeMap === 'function') {
                window.initializeMap();
            }
            appInitialized = true;
        } else if (typeof window.initializeSocketListeners === 'function') {
            window.initializeSocketListeners();
        }
    }

    function showLogin() {
        if (landingPage) {
            landingPage.classList.add('modal-open');
        }
        if (loginModal) {
            loginModal.style.display = 'flex';
            loginModal.classList.add('active');
        }
        if (usernameInput) usernameInput.focus();
    }

    function handleLogin() {
        const enteredName = usernameInput ? usernameInput.value.trim() : '';
        const username = enteredName || `Guest${Math.floor(Math.random() * 10000)}`;
        const userId = userIdInput ? userIdInput.value.trim() : '';

        window.username = username;
        window.currentUser = { username, _id: userId || null };

        if (loginModal) {
            loginModal.classList.remove('active');
            loginModal.style.display = 'none';
        }
        if (landingPage) {
            landingPage.classList.remove('modal-open');
            landingPage.classList.add('hidden');
            setTimeout(function() {
                landingPage.style.display = 'none';
            }, 600);
        }
        if (mainApp) {
            mainApp.style.display = 'block';
            mainApp.classList.add('active');
        }
        if (usernameDisplay) usernameDisplay.textContent = `👤 ${username}`;

        startMainApp();
    }

    function handleSkip() {
        if (usernameInput) usernameInput.value = '';
        handleLogin();
    }

    function handleLogout() {
        window.username = null;
        window.currentUser = null;

        if (activeTimeInterval) {
            clearInterval(activeTimeInterval);
            activeTimeInterval = null;
        }
        trackingStartTime = null;
        totalDistance = 0;
        lastLocation = null;
        lastUpdateTime = null;
        maxSpeed = 0;
        speedHistory = [];

        if (window.socket) {
            try {
                window.socket.disconnect();
            } catch (e) {
                console.error('Socket disconnect failed:', e);
            }
            window.socket = null;
        }

        if (mainApp) {
            mainApp.classList.remove('active');
            mainApp.style.display = 'none';
        }
        if (loginModal) {
            loginModal.classList.remove('active');
            loginModal.style.display = 'none';
        }
        if (landingPage) {
            landingPage.classList.remove('hidden', 'modal-open');
            landingPage.style.display = 'flex';
        }
    }

    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showLogin();
        });
    }

    if (startTrackingBtn) {
        startTrackingBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showLogin();
        });
    }

    if (continueBtn) {
        continueBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleLogin();
        });
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleSkip();
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleLogout();
        });
    }

    if (loginModal) {
        loginModal.addEventListener('click', function(e) {
            if (e.target === loginModal) {
                loginModal.classList.remove('active');
                loginModal.style.display = 'none';
                if (landingPage) landingPage.classList.remove('modal-open');
            }
        });
    }

    if (usernameInput) {
        usernameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }

    // Update tracking analysis
    function renderActiveTime(now) {
        const activeTimeElement = document.getElementById('active-time');
        if (!activeTimeElement || !trackingStartTime) return;

        const activeTimeMs = now - trackingStartTime;
        const hours = Math.floor(activeTimeMs / 3600000);
        const minutes = Math.floor((activeTimeMs % 3600000) / 60000);
        const seconds = Math.floor((activeTimeMs % 60000) / 1000);
        activeTimeElement.textContent =
            String(hours).padStart(2, '0') + ':' +
            String(minutes).padStart(2, '0') + ':' +
            String(seconds).padStart(2, '0');
    }

    function ensureActiveTimeTicker() {
        if (activeTimeInterval || !trackingStartTime) return;
        activeTimeInterval = setInterval(() => {
            renderActiveTime(Date.now());
        }, 1000);
    }

    function updateTrackingAnalysis(newLocation, metrics = {}) {
        if (!newLocation || typeof newLocation.lat !== 'number' || typeof newLocation.lng !== 'number') {
            return;
        }

        const now = Number.isFinite(metrics.timestamp) ? metrics.timestamp : Date.now();
        
        // Initialize tracking if first time
        if (!trackingStartTime) {
            trackingStartTime = now;
            lastLocation = newLocation;
            lastUpdateTime = now;
            ensureActiveTimeTicker();
            renderActiveTime(now);
        }

        // Calculate distance from last location
        let distanceKm = 0;
        if (lastLocation) {
            if (Number.isFinite(metrics.distance)) {
                distanceKm = Math.max(0, Number(metrics.distance)); // already km from script.js
            } else if (typeof window.calculateDistance === 'function') {
                distanceKm = window.calculateDistance(
                    lastLocation.lat,
                    lastLocation.lng,
                    newLocation.lat,
                    newLocation.lng
                );
            }
            totalDistance += distanceKm;
        }

        // Calculate time difference and speed
        let timeDiff = (now - lastUpdateTime) / 1000; // seconds
        let currentSpeed = 0;
        
        if (timeDiff > 0 && lastLocation) {
            if (Number.isFinite(metrics.speed)) {
                currentSpeed = Math.max(0, Number(metrics.speed));
            } else {
                currentSpeed = (distanceKm / timeDiff) * 3600; // km/h
            }
            speedHistory.push(currentSpeed);
            
            // Keep only last 10 speed readings for average
            if (speedHistory.length > 10) {
                speedHistory = speedHistory.slice(-10);
            }
            
            // Update max speed
            maxSpeed = Math.max(maxSpeed, currentSpeed);
        }

        // Update display elements
        const distanceElement = document.getElementById('distance-traveled');
        const activeTimeElement = document.getElementById('active-time');
        const currentSpeedElement = document.getElementById('current-speed');
        const averageSpeedElement = document.getElementById('average-speed');
        const maxSpeedElement = document.getElementById('max-speed');

        if (distanceElement) {
            distanceElement.textContent = totalDistance.toFixed(2) + ' km';
        }
        
        if (activeTimeElement) renderActiveTime(now);
        
        if (currentSpeedElement) {
            currentSpeedElement.textContent = currentSpeed.toFixed(1) + ' km/h';
        }
        
        if (averageSpeedElement && speedHistory.length > 0) {
            const avgSpeed = speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length;
            averageSpeedElement.textContent = avgSpeed.toFixed(1) + ' km/h';
        }
        
        if (maxSpeedElement) {
            maxSpeedElement.textContent = maxSpeed.toFixed(1) + ' km/h';
        }

        // Update tracking variables
        lastLocation = newLocation;
        lastUpdateTime = now;
        ensureActiveTimeTicker();
    }

    // Update tracking analysis when location changes
    if (typeof window.updateTrackingAnalysis === 'function') {
        window.updateTrackingAnalysis = updateTrackingAnalysis;
    }

    // Global functions
    window.showLogin = showLogin;
    window.handleLogin = handleLogin;
    window.handleSkip = handleSkip;
    window.handleLogout = handleLogout;
    window.updateTrackingAnalysis = updateTrackingAnalysis;
});
