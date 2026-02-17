const mongoose = require('mongoose');

const locationHistorySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    location: {
        latitude: {
            type: Number,
            required: true
        },
        longitude: {
            type: Number,
            required: true
        },
        accuracy: Number,
        altitude: Number,
        altitudeAccuracy: Number,
        heading: Number,
        speed: Number
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    source: {
        type: String,
        enum: ['gps', 'network', 'manual'],
        default: 'gps'
    },
    deviceInfo: {
        userAgent: String,
        platform: String,
        batteryLevel: Number,
        isCharging: Boolean
    },
    sessionData: {
        socketId: String,
        isActive: Boolean,
        lastHeartbeat: Date
    }
}, {
    timestamps: true
});

// Compound indexes for efficient queries
locationHistorySchema.index({ user: 1, timestamp: -1 });
locationHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // Auto-delete after 30 days

// Static method to get user's recent locations
locationHistorySchema.statics.getRecentLocations = function(userId, limit = 100) {
    return this.find({ user: userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .exec();
};

// Static method to get user's location history for date range
locationHistorySchema.statics.getLocationHistory = function(userId, startDate, endDate) {
    return this.find({
        user: userId,
        timestamp: {
            $gte: startDate,
            $lte: endDate
        }
    }).sort({ timestamp: 1 }).exec();
};

// Static method to clean up old locations (older than 30 days)
locationHistorySchema.statics.cleanupOldLocations = function() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.deleteMany({ timestamp: { $lt: thirtyDaysAgo } });
};

// Instance method to get next location in sequence
locationHistorySchema.methods.getNextLocation = function() {
    return this.constructor.findOne({
        user: this.user,
        timestamp: { $gt: this.timestamp }
    }).sort({ timestamp: 1 }).exec();
};

// Instance method to get previous location in sequence
locationHistorySchema.methods.getPreviousLocation = function() {
    return this.constructor.findOne({
        user: this.user,
        timestamp: { $lt: this.timestamp }
    }).sort({ timestamp: -1 }).exec();
};

module.exports = mongoose.model('LocationHistory', locationHistorySchema);
