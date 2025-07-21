const Venue = require('../models/Venue');

exports.listVenues = async (req, res, next) => {
  try {
    const venues = await Venue.find().populate('team');
    res.json(venues);
  } catch (err) {
    next(err);
  }
};
