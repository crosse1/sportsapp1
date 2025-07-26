const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  badgeID: { type: Number, unique: true },
  badgeName: String,
  leagueConstraints: { type: [String], default: [] },
  teamConstraints: { type: [String], default: [] },
  iconUrl: {
    data: Buffer,
    contentType: {
      type: String,
      enum: ['image/jpeg', 'image/png']
    }
  },
  reqGames: Number,
  description: String,
  pointValue: Number
});

module.exports = mongoose.model('Badge', badgeSchema);
