const mongoose = require('mongoose');

const sosAlertSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        accuracy: Number
    },
    type: {
        type: String,
        enum: ['manual', 'walk_mode_emergency', 'inactivity', 'geofence_breach'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'resolved', 'false_alarm'],
        default: 'active'
    },
    message: String,
    notifiedUsers: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        notifiedAt: { type: Date, default: Date.now },
        method: { type: String, enum: ['socket', 'email', 'sms'] }
    }],
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolutionNotes: String
}, { timestamps: true });

module.exports = mongoose.model('SOSAlert', sosAlertSchema);
