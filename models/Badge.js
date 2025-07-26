const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  badgeID: { type: Number, unique: true },
  badgeName: String,
  leagueConstraints: { type: [String], default: [] },
  teamConstraints: { type: [String], default: [] },
  conferenceConstraints: { type: [String], default: [] },
  iconUrl: {
    data: Buffer,
    contentType: {
      type: String,
      enum: ['image/jpeg', 'image/png']
    }
  },
  reqGames: Number,
  homeTeamOnly: { type: Boolean, default: false },
  timeConstraints: { type: Number, min: 1 },
  description: String,
  pointValue: Number
});

module.exports = mongoose.model('Badge', badgeSchema);
