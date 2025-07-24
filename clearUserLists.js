const mongoose = require('mongoose');
const db = require('./db');
const User = require('./models/users');

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => {
  console.log('Connected to MongoDB');
  clearLists();
});

async function clearLists() {
  try {
    const result = await User.updateMany({}, {
      $set: {
        venuesList: [],
        teamsList: [],
        gameEntries: []
      }
    });
    console.log(`Updated ${result.modifiedCount || 0} users`);
  } catch (err) {
    console.error('Failed to clear user lists:', err);
  } finally {
    mongoose.disconnect();
  }
}
