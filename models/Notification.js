const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    type: { type: String, default: 'game-invite' },
    message: { type: String, required: true },
    status: { type: String, enum: ['pending', 'read'], default: 'pending' },
    response: { type: String, enum: ['yes', 'no', 'maybe', null], default: null }
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
