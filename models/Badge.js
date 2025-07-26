const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  badgeID: { type: Number, unique: true },
  badgeName: String,
  leagueConstraints: { type: [String], default: [] },
  teamConstraints: { type: [String], default: [] },
  iconURL: String,
  reqGames: Number,
  description: String,
  pointValue: Number
});

module.exports = mongoose.model('Badge', badgeSchema);
