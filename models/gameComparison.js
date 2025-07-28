const mongoose = require('mongoose');

const gameComparisonSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gameA: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
  gameB: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' }, // null if unanswered
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameComparison', gameComparisonSchema);