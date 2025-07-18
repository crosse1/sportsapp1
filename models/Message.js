const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    messages: [{
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    unreadBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
