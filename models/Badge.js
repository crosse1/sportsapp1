const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  badgeID: { type: Number, unique: true },
  badgeName: String,
  leagueConstraints: { type: [String], default: [] },
  teamConstraints: { type: [String], default: [] },
  conferenceConstraints: { type: [String], default: [] },
  iconFile: {
    data: Buffer,
    contentType: {
      type: String,
      enum: ['image/jpeg', 'image/png']
    }
  },

  // External URL (e.g., from CDN or imgur)
  iconUrl: {
    type: String,
    default: null
  },
  reqGames: Number,
  homeTeamOnly: { type: Boolean, default: false },
  oneTeamEach: { type: Boolean, default: false },
  timeConstraints: { type: Number, min: 1 },
  description: String,
  pointValue: Number,
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null }
});

module.exports = mongoose.model('Badge', badgeSchema);
