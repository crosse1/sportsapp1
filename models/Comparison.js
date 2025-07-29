const mongoose = require('mongoose');

const comparisonSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  newGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'PastGame', required: true },
  existingGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'PastGame', required: true },
  indexLeft: Number,
  indexRight: Number,
  indexMid: Number,
  resolved: { type: Boolean, default: false },
  winner: { type: String, enum: ['new','existing'], default: undefined }
});

module.exports = mongoose.model('Comparison', comparisonSchema);
