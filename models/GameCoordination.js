const mongoose = require('mongoose');

const invitedUserSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    response: { type: String, enum: ['yes', 'no', 'maybe', null], default: null }
}, { _id: false });

const gameCoordinationSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    invitedUsers: { type: [invitedUserSchema], default: [] }
}, { timestamps: true });

gameCoordinationSchema.index({ ownerId: 1, gameId: 1 }, { unique: true });

gameCoordinationSchema.methods.findInviteForUser = function(userId){
    if(!userId) return null;
    const idStr = String(userId);
    return this.invitedUsers.find(invite => String(invite.userId) === idStr) || null;
};

module.exports = mongoose.model('GameCoordination', gameCoordinationSchema);
