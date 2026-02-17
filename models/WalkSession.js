const mongoose = require('mongoose');

const walkSessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    trustedFriends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    destination: {
        type: String,
        required: true
    },
    path: [{
        latitude: {
            type: Number,
            required: true
        },
        longitude: {
            type: Number,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        accuracy: Number,
        speed: Number
    }],
    status: {
        type: String,
        enum: ['active', 'completed', 'emergency', 'cancelled'],
        default: 'active'
    },
    startTime: {
        type: Date,
        default: Date.now,
        required: true
    },
    endTime: Date,
    completionStatus: {
        type: String,
        enum: ['safe', 'emergency', 'timeout', 'manual'],
        default: null
    },
    emergencyAlerts: [{
        type: {
            type: String,
            enum: ['inactivity', 'manual', 'sos'],
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        location: {
            latitude: Number,
            longitude: Number
        },
        message: String,
        notifiedFriends: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]
    }],
    inactivityAlerts: [{
        timestamp: Date,
        duration: Number // in minutes
    }],
    metadata: {
        deviceInfo: String,
        batteryLevel: Number,
        networkType: String
    }
}, {
    timestamps: true
});

// Index for efficient queries
walkSessionSchema.index({ user: 1, status: 1 });
walkSessionSchema.index({ startTime: -1 });
walkSessionSchema.index({ 'trustedFriends': 1 });

// Method to add location to path
walkSessionSchema.methods.addLocation = function(latitude, longitude, additionalData = {}) {
    this.path.push({
        latitude,
        longitude,
        timestamp: new Date(),
        ...additionalData
    });
    
    // Keep only last 100 points to prevent bloat
    if (this.path.length > 100) {
        this.path = this.path.slice(-100);
    }
    
    return this.save();
};

// Method to check if user is inactive
walkSessionSchema.methods.checkInactivity = function(maxInactiveMinutes = 5) {
    if (this.path.length === 0) return true;
    
    const lastLocation = this.path[this.path.length - 1];
    const now = new Date();
    const inactiveTime = (now - lastLocation.timestamp) / (1000 * 60); // minutes
    
    return inactiveTime >= maxInactiveMinutes;
};

// Method to get total distance
walkSessionSchema.methods.getTotalDistance = function() {
    if (this.path.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 1; i < this.path.length; i++) {
        const prev = this.path[i - 1];
        const curr = this.path[i];
        
        // Simple distance calculation (can be improved with Haversine)
        const distance = Math.sqrt(
            Math.pow(curr.latitude - prev.latitude, 2) + 
            Math.pow(curr.longitude - prev.longitude, 2)
        ) * 111; // Rough conversion to km
        
        totalDistance += distance;
    }
    
    return totalDistance;
};

module.exports = mongoose.model('WalkSession', walkSessionSchema);
