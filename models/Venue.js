const mongoose = require('mongoose');

const geoSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point'
  },
  coordinates: {
    type: [Number],
    index: '2dsphere'
  }
}, { _id: false });

const venueSchema = new mongoose.Schema({
  venueId: { type: Number, unique: true },
  name: String,
  imgUrl: String,
  capacity: Number,
  grass: Boolean,
  dome: Boolean,
  city: String,
  state: String,
  zip: String,
  countryCode: String,
  timezone: String,
  coordinates: geoSchema,
  elevation: Number,
  constructionYear: Number,
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' }
});

module.exports = mongoose.model('Venue', venueSchema);
