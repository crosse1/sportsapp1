const mongoose = require('mongoose');

const leagueSchema = new mongoose.Schema({
  leagueId: { type: String, unique: true },
  leagueName: String
});

module.exports = mongoose.model('League', leagueSchema);
