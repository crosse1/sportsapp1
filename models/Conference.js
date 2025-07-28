const mongoose = require('mongoose');

const conferenceSchema = new mongoose.Schema({
  confName: { type: String, required: true, unique: true },
  confId: { type: Number, required: true, unique: true }
});

module.exports = mongoose.model('Conference', conferenceSchema);
