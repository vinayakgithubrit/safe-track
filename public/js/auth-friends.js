// ========== AUTHENTICATION & FRIEND SYSTEM ==========

// Global auth state
let currentUser = null;
let authToken = null;
let friends = [];
let friendRequests = { sent: [], received: [] };

// API Base URL
const API_BASE = '/api';

// ========== PAGE INITIALIZATION ==========

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 SafeTrack initializing...');
    
    // Check for existing auth (for simplified version, just show landing page)
    console.log('👋 Showing landing page...');
    document.getElementById('landing-page').style.display = 'flex';
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('main-app').style.display = 'none';
});

// ========== UI FUNCTIONS ==========

// Show login modal
function showLogin() {
    console.log('🔐 Showing login modal...');
    console.log('🔍 showLogin function called!');
    
    // Debug: Check if elements exist
    const landingPage = document.getElementById('landing-page');
    const loginModal = document.getElementById('login-modal');
    
    console.log('🔍 Landing page element:', landingPage);
    console.log('🔍 Login modal element:', loginModal);
    
    if (landingPage) {
        landingPage.style.display = 'none';
        console.log('✅ Landing page hidden');
    } else {
        console.error('❌ Landing page element not found!');
    }
    
    if (loginModal) {
        loginModal.style.display = 'flex';
        console.log('✅ Login modal shown');
    } else {
        console.error('❌ Login modal element not found!');
    }
}

// Make function globally accessible
window.showLogin = showLogin;

// Show main app
function showMainApp() {
    console.log('🚀 Showing main app...');
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    // Update user display
    if (currentUser) {
        document.getElementById('username-display').textContent = `👤 ${currentUser.username}`;
    }
    
    // Initialize map and socket if not already done
    if (typeof initializeSocketListeners === 'function') {
        initializeSocketListeners();
    }
}

// Handle login form submission (simplified)
function handleLogin(event) {
    event.preventDefault();
    console.log('⚡ Login submitted...');
    
    const username = document.getElementById('username-input').value;
    const userId = document.getElementById('user-id').value;
    
    // Create user object for guest mode
    currentUser = { 
        username: username, 
        _id: userId || `guest_${Date.now()}`,
        isGuest: true 
    };
    
    console.log('👤 User logged in:', currentUser);
    showMainApp();
    
    // Connect socket as guest
    connectSocketAsGuest();
}

// Handle skip for now
function handleSkip() {
    // Use guest mode with temporary username
    const guestUsername = `Guest${Math.floor(Math.random() * 10000)}`;
    currentUser = { username: guestUsername, _id: null, isGuest: true };
    showMainApp();
    
    // Connect socket without token for guest mode
    connectSocketAsGuest();
}

// Connect socket as guest (for quick login)
function connectSocketAsGuest() {
    console.log('🔌 Connecting socket as guest...');
    
    // Set global username for script.js compatibility
    window.username = currentUser.username;
    window.currentUser = currentUser;
    
    // Initialize socket connection
    if (typeof io !== 'undefined') {
        window.socket = io();
        
        // Initialize socket listeners from script.js
        if (typeof initializeSocketListeners === 'function') {
            initializeSocketListeners();
        }
        
        showNotification('Connected as guest', 'success');
    } else {
        console.error('Socket.IO not loaded');
        showNotification('Connection error', 'error');
    }
}

// Handle logout
function handleLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    currentUser = null;
    authToken = null;
    
    if (socket) {
        socket.disconnect();
    }
    
    // Show landing page
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('landing-page').style.display = 'flex';
    
    showNotification('Logged out successfully', 'success');
}

// ========== AUTHENTICATION FUNCTIONS ==========

// Register new user
async function register(userData) {
    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            authToken = data.token;
            currentUser = data.user;
            
            showNotification('Registration successful!', 'success');
            connectSocketWithToken();
            showMainApp();
            return { success: true, data };
        } else {
            showNotification(data.error || 'Registration failed', 'error');
            return { success: false, error: data };
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('Network error during registration', 'error');
        return { success: false, error };
    }
}

// Login user
async function login(credentials) {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(credentials)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            authToken = data.token;
            currentUser = data.user;
            
            showNotification('Login successful!', 'success');
            connectSocketWithToken();
            showMainApp();
            return { success: true, data };
        } else {
            showNotification(data.error || 'Login failed', 'error');
            return { success: false, error: data };
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Network error during login', 'error');
        return { success: false, error };
    }
}

// Logout user
async function logout() {
    try {
        if (authToken) {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    authToken = null;
    currentUser = null;
    friends = [];
    friendRequests = { sent: [], received: [] };
    
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    showNotification('Logged out successfully', 'success');
    showLoginScreen();
}

// Check authentication status
function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    
    if (token && user) {
        try {
            authToken = token;
            currentUser = JSON.parse(user);
            connectSocketWithToken();
            showMainApp();
            return true;
        } catch (error) {
            console.error('Invalid stored user data:', error);
            logout();
            return false;
        }
    }
    return false;
}

// ========== FRIEND SYSTEM FUNCTIONS ==========

// Search for users
async function searchUsers(query) {
    try {
        const response = await fetch(`${API_BASE}/friends/search?query=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            return { success: true, users: data.users };
        } else {
            showNotification(data.error || 'Search failed', 'error');
            return { success: false, error: data };
        }
    } catch (error) {
        console.error('Search error:', error);
        showNotification('Network error during search', 'error');
        return { success: false, error };
    }
}

// Send friend request
async function sendFriendRequest(friendId) {
    try {
        const response = await fetch(`${API_BASE}/friends/request/send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ friendId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Friend request sent!', 'success');
            loadFriendRequests();
            return { success: true, data };
        } else {
            showNotification(data.error || 'Failed to send request', 'error');
            return { success: false, error: data };
        }
    } catch (error) {
        console.error('Send request error:', error);
        showNotification('Network error', 'error');
        return { success: false, error };
    }
}

// Accept friend request
async function acceptFriendRequest(requesterId) {
    try {
        const response = await fetch(`${API_BASE}/friends/request/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requesterId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Friend request accepted!', 'success');
            loadFriends();
            loadFriendRequests();
            return { success: true, data };
        } else {
            showNotification(data.error || 'Failed to accept request', 'error');
            return { success: false, error: data };
        }
    } catch (error) {
        console.error('Accept request error:', error);
        showNotification('Network error', 'error');
        return { success: false, error };
    }
}

// Reject friend request
async function rejectFriendRequest(requesterId) {
    try {
        const response = await fetch(`${API_BASE}/friends/request/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requesterId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Friend request rejected', 'info');
            loadFriendRequests();
            return { success: true, data };
        } else {
            showNotification(data.error || 'Failed to reject request', 'error');
            return { success: false, error: data };
        }
    } catch (error) {
        console.error('Reject request error:', error);
        showNotification('Network error', 'error');
        return { success: false, error };
    }
}

// Load friends list
async function loadFriends() {
    try {
        const response = await fetch(`${API_BASE}/friends/list`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            friends = data.friends;
            updateFriendsUI();
            return { success: true, friends: data.friends };
        } else {
            console.error('Failed to load friends:', data.error);
            return { success: false, error: data };
        }
    } catch (error) {
        console.error('Load friends error:', error);
        return { success: false, error };
    }
}

// Load friend requests
async function loadFriendRequests() {
    try {
        const response = await fetch(`${API_BASE}/friends/requests`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            friendRequests = data;
            updateFriendRequestsUI();
            return { success: true, requests: data };
        } else {
            console.error('Failed to load requests:', data.error);
            return { success: false, error: data };
        }
    } catch (error) {
        console.error('Load requests error:', error);
        return { success: false, error };
    }
}

// ========== UI FUNCTIONS ==========

// Show login/register screen
function showLoginScreen() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

// Show main application
function showMainApp() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    
    // Load user data
    loadFriends();
    loadFriendRequests();
    updateUserInfo();
}

// Update user info in UI
function updateUserInfo() {
    if (currentUser) {
        document.getElementById('user-display-name').textContent = currentUser.username;
        document.getElementById('user-email').textContent = currentUser.email;
    }
}

// Update friends UI
function updateFriendsUI() {
    const friendsList = document.getElementById('friends-list');
    if (!friendsList) return;
    
    if (friends.length === 0) {
        friendsList.innerHTML = '<p class="no-friends">No friends yet. Search and add friends!</p>';
        return;
    }
    
    friendsList.innerHTML = friends.map(friend => `
        <div class="friend-item ${friend.isOnline ? 'online' : 'offline'}" data-friend-id="${friend._id}">
            <div class="friend-avatar">${friend.username.charAt(0).toUpperCase()}</div>
            <div class="friend-info">
                <div class="friend-name">${friend.username}</div>
                <div class="friend-status">${friend.isOnline ? '🟢 Online' : '🔴 Last seen: ' + new Date(friend.lastSeen).toLocaleString()}</div>
            </div>
            <div class="friend-actions">
                <button class="btn-add-walk" onclick="selectFriendForWalk('${friend._id}', '${friend.username}')" title="Add to Walk-Me-Home">
                    🚶‍♀️
                </button>
            </div>
        </div>
    `).join('');
}

// Update friend requests UI
function updateFriendRequestsUI() {
    const receivedList = document.getElementById('received-requests');
    const sentList = document.getElementById('sent-requests');
    
    if (receivedList) {
        if (friendRequests.received.length === 0) {
            receivedList.innerHTML = '<p class="no-requests">No pending requests</p>';
        } else {
            receivedList.innerHTML = friendRequests.received.map(request => `
                <div class="request-item">
                    <div class="request-info">
                        <strong>${request.from.username}</strong>
                        <span class="request-email">${request.from.email}</span>
                    </div>
                    <div class="request-actions">
                        <button class="btn-accept" onclick="acceptFriendRequest('${request.from._id}')">Accept</button>
                        <button class="btn-reject" onclick="rejectFriendRequest('${request.from._id}')">Reject</button>
                    </div>
                </div>
            `).join('');
        }
    }
    
    if (sentList) {
        if (friendRequests.sent.length === 0) {
            sentList.innerHTML = '<p class="no-requests">No sent requests</p>';
        } else {
            sentList.innerHTML = friendRequests.sent.map(request => `
                <div class="request-item">
                    <div class="request-info">
                        <strong>${request.to.username}</strong>
                        <span class="request-email">${request.to.email}</span>
                    </div>
                    <div class="request-status">Pending</div>
                </div>
            `).join('');
        }
    }
}

// ========== SOCKET.IO WITH AUTHENTICATION ==========

let socket = null;

function connectSocketWithToken() {
    if (!authToken) {
        console.error('No auth token available for socket connection');
        return;
    }
    
    socket = io({
        auth: {
            token: authToken
        }
    });
    
    socket.on('connect', () => {
        console.log('✅ Connected with authentication');
    });
    
    socket.on('user-connected', (data) => {
        console.log('User data received:', data);
    });
    
    socket.on('online-friends', (onlineFriends) => {
        console.log('Online friends:', onlineFriends);
        // Update online status in friends list
        onlineFriends.forEach(onlineFriend => {
            const friendElement = document.querySelector(`[data-friend-id="${onlineFriend.userId}"]`);
            if (friendElement) {
                friendElement.classList.add('online');
                friendElement.classList.remove('offline');
                const statusElement = friendElement.querySelector('.friend-status');
                if (statusElement) {
                    statusElement.textContent = '🟢 Online';
                }
            }
        });
    });
    
    socket.on('friend-request-received', (data) => {
        showNotification(`👋 ${data.from.username} sent you a friend request!`, 'info');
        loadFriendRequests();
    });
    
    socket.on('friend-request-accepted', (data) => {
        showNotification(`🎉 ${data.from.username} accepted your friend request!`, 'success');
        loadFriends();
        loadFriendRequests();
    });
    
    socket.on('location-update', (data) => {
        // Handle location updates from friends
        console.log('Location update from friend:', data);
    });
    
    socket.on('walk-mode-added-you', (data) => {
        showNotification(`🚶‍♀️ ${data.walkerName} added you to Walk-Me-Home mode!`, 'success');
        // Handle walk mode notification (existing code)
        if (typeof handleWalkModeNotification === 'function') {
            handleWalkModeNotification(data);
        }
    });
    
    socket.on('walk-mode-location-update', (data) => {
        // Handle walk mode location updates (existing code)
        if (typeof handleWalkModeLocationUpdate === 'function') {
            handleWalkModeLocationUpdate(data);
        }
    });
    
    socket.on('walk-mode-ended', (data) => {
        showNotification(`🏁 ${data.walkerName} ended walk mode (${data.status})`, 'info');
        // Handle walk mode end (existing code)
        if (typeof handleWalkModeEnded === 'function') {
            handleWalkModeEnded(data);
        }
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        showNotification(error.message || 'Connection error', 'error');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected');
        showNotification('Connection lost', 'warning');
    });
}

// ========== WALK MODE FRIEND SELECTOR ==========

let selectedWalkFriends = [];

function selectFriendForWalk(friendId, friendName) {
    // Toggle selection
    const index = selectedWalkFriends.findIndex(f => f.id === friendId);
    
    if (index > -1) {
        // Remove from selection
        selectedWalkFriends.splice(index, 1);
    } else {
        // Add to selection (max 3 friends)
        if (selectedWalkFriends.length >= 3) {
            showNotification('Maximum 3 friends allowed for Walk-Me-Home', 'warning');
            return;
        }
        selectedWalkFriends.push({ id: friendId, name: friendName });
    }
    
    updateWalkFriendSelector();
}

function updateWalkFriendSelector() {
    const selector = document.getElementById('walk-friend-selector');
    if (!selector) return;
    
    // Update friend items
    document.querySelectorAll('.friend-item').forEach(item => {
        const friendId = item.getAttribute('data-friend-id');
        const isSelected = selectedWalkFriends.some(f => f.id === friendId);
        
        if (isSelected) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    // Update selected friends display
    const selectedDisplay = document.getElementById('selected-walk-friends');
    if (selectedDisplay) {
        if (selectedWalkFriends.length === 0) {
            selectedDisplay.innerHTML = '<p class="no-selected">Select friends to add to Walk-Me-Home</p>';
        } else {
            selectedDisplay.innerHTML = selectedWalkFriends.map(friend => `
                <div class="selected-friend-badge">
                    ${friend.name}
                    <button class="remove-friend" onclick="removeSelectedFriend('${friend.id}')">×</button>
                </div>
            `).join('');
        }
    }
    
    // Update start button state
    const startButton = document.getElementById('start-walk-btn');
    if (startButton) {
        startButton.disabled = selectedWalkFriends.length === 0;
    }
}

function removeSelectedFriend(friendId) {
    selectedWalkFriends = selectedWalkFriends.filter(f => f.id !== friendId);
    updateWalkFriendSelector();
}

function startWalkModeWithFriends() {
    if (selectedWalkFriends.length === 0) {
        showNotification('Please select at least one friend', 'warning');
        return;
    }
    
    const destination = document.getElementById('walk-destination').value.trim();
    if (!destination) {
        showNotification('Please enter a destination', 'warning');
        return;
    }
    
    const friendIds = selectedWalkFriends.map(f => f.id);
    
    // Emit walk mode start with real friend IDs
    socket.emit('walk-mode-start', {
        friends: friendIds,
        destination: destination
    });
    
    showNotification(`Starting Walk-Me-Home with ${selectedWalkFriends.length} friends`, 'success');
    
    // Close modal and show tracking
    closeWalkModal();
    showWalkTrackingModal(selectedWalkFriends, destination);
}

// ========== INITIALIZATION ==========

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    if (!checkAuthStatus()) {
        showLoginScreen();
    }
    
    // Setup form handlers
    setupAuthForms();
    setupFriendSearch();
});

function setupAuthForms() {
    // Registration form
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                username: document.getElementById('reg-username').value.trim(),
                email: document.getElementById('reg-email').value.trim(),
                password: document.getElementById('reg-password').value
            };
            
            await register(formData);
        });
    }
    
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const credentials = {
                email: document.getElementById('login-email').value.trim(),
                password: document.getElementById('login-password').value
            };
            
            await login(credentials);
        });
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

function setupFriendSearch() {
    const searchInput = document.getElementById('friend-search');
    const searchResults = document.getElementById('search-results');
    
    if (searchInput && searchResults) {
        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                searchResults.innerHTML = '';
                return;
            }
            
            searchTimeout = setTimeout(async () => {
                const result = await searchUsers(query);
                
                if (result.success) {
                    searchResults.innerHTML = result.users.map(user => `
                        <div class="search-result-item">
                            <div class="search-user-info">
                                <div class="search-avatar">${user.username.charAt(0).toUpperCase()}</div>
                                <div class="search-details">
                                    <div class="search-username">${user.username}</div>
                                    <div class="search-email">${user.email}</div>
                                    <div class="search-status">${user.isOnline ? '🟢 Online' : '🔴 Offline'}</div>
                                </div>
                            </div>
                            <button class="btn-add-friend" onclick="sendFriendRequest('${user._id}')">
                                Add Friend
                            </button>
                        </div>
                    `).join('');
                } else {
                    searchResults.innerHTML = '<p class="search-error">Search failed</p>';
                }
            }, 500);
        });
    }
}

console.log('🔐 Authentication & Friend System Loaded');
