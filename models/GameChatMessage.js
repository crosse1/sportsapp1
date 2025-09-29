const mongoose = require('mongoose');

const gameChatMessageSchema = new mongoose.Schema({
    coordinationId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameCoordination', required: true },
    gameId: { type: String, required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, maxlength: 1000 },
    timestamp: { type: Date, default: Date.now }
});

gameChatMessageSchema.index({ coordinationId: 1, timestamp: 1 });

gameChatMessageSchema.pre('save', function(next){
    this.timestamp = this.timestamp || new Date();
    next();
});

module.exports = mongoose.model('GameChatMessage', gameChatMessageSchema);
