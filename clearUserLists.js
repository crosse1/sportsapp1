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
        gameEntries: [],
        gameElo: []
      }
    });
    console.log(`✅ Cleared venuesList, teamsList, gameEntries, and gameElo for ${result.modifiedCount || 0} users`);
  } catch (err) {
    console.error('❌ Failed to clear user fields:', err);
  } finally {
    mongoose.disconnect();
  }
}
