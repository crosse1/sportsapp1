const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  id: Number,
  name: String,
  city: String,
  state: String,
  zip: String,
  countryCode: String,
  timezone: String,
  latitude: Number,
  longitude: Number,
  elevation: Number,
  capacity: Number,
  constructionYear: Number,
  grass: Boolean,
  dome: Boolean
}, { _id: false });

const teamSchema = new mongoose.Schema({
  teamId: { type: Number, unique: true },
  school: String,
  mascot: String,
  abbreviation: String,
  alternateNames: [String],
  conference: String,
  division: String,
  conferenceId: String,
  classification: String,
  color: String,
  alternateColor: String,
  logos: [String],
  twitter: String,
  location: locationSchema
});

module.exports = mongoose.model('Team', teamSchema);
