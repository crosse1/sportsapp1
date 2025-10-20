const mongoose = require('mongoose');
const db = require('./db');
const User = require('./models/users');

// Log connection status

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

async function fixUserEloValues() {
  let totalUpdatedEntries = 0;

  try {
    const users = await User.find({});

    for (const user of users) {
      let userUpdates = 0;

      if (Array.isArray(user.gameEntries)) {
        for (const entry of user.gameEntries) {
          if (entry && entry.elo === 1500) {
            entry.elo = null;
            userUpdates += 1;
          }
        }
      }

      if (userUpdates > 0) {
        await user.save();
        totalUpdatedEntries += userUpdates;
        console.log(`Updated ${userUpdates} game entries for user ${user._id}`);
      } else {
        console.log(`User ${user._id}: no entries updated`);
      }
    }

    console.log(`Finished updating users. Total entries updated: ${totalUpdatedEntries}.`);
  } catch (err) {
    console.error('Error updating user elo values:', err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

fixUserEloValues()
  .then(() => {
    console.log('Elo correction script completed successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Elo correction script failed.', err);
    process.exit(1);
  });
