const mongoose = require('mongoose');

const pastGameSchema = new mongoose.Schema({
  // Preserve original `Id` but introduce `gameId` as the canonical key so
  // current and past games can be referenced uniformly.
  gameId: { type: Number, required: true, unique: true },
  Id: { type: Number, required: true, unique: true },
  Season: { type: Number, required: true },
  Week: { type: Number, required: true },
  SeasonType: { type: String, required: true },
  StartDate: { type: Date, required: true },
  NeutralSite: Boolean,
  ConferenceGame: Boolean,
  Attendance: Number,
  VenueId: Number,
  Venue: String,
  HomeId: Number,
  HomeTeam: String,
  HomeClassification: String,
  HomeConference: String,
  homeConferenceId: Number,
  HomePoints: Number,
  AwayId: Number,
  AwayTeam: String,
  AwayClassification: String,
  AwayConference: String,
  awayConferenceId: Number,
  AwayPoints: Number,
  awayLeagueId: Number,
  homeLeagueId: Number,
  ratings: {
    type: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rating: Number
      }
    ],
    default: []
  },
  comments: {
    type: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        comment: String
      }
    ],
    default: []
  }
});

module.exports = mongoose.model('PastGame', pastGameSchema);
