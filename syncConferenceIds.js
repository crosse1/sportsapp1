const mongoose = require('mongoose');
const db = require('./db');
const PastGame = require('./models/PastGame');
const Conference = require('./models/Conference');

// Log connection events

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

async function getNextConfId() {
  const maxConf = await Conference.findOne({}).sort('-confId');
  return maxConf ? maxConf.confId + 1 : 1;
}

async function ensureConference(name) {
  if (!name || !name.trim()) return null;
  const confName = name.trim();
  let conf = await Conference.findOne({ confName });
  if (!conf) {
    const newId = await getNextConfId();
    conf = new Conference({ confName, confId: newId });
    await conf.save();
    console.log(`Inserted conference '${confName}' with id ${newId}`);
  }
  return conf.confId;
}

async function syncConferenceIds() {
  try {
    const games = await PastGame.find({});
    let updatedGames = 0;

    for (const game of games) {
      let updated = false;

      if (!game.homeConferenceId && game.HomeConference) {
        const id = await ensureConference(game.HomeConference);
        if (id) {
          game.homeConferenceId = id;
          updated = true;
          console.log(`Updated game ${game.Id || game._id} homeConferenceId -> ${id}`);
        }
      }

      if (!game.awayConferenceId && game.AwayConference) {
        const id = await ensureConference(game.AwayConference);
        if (id) {
          game.awayConferenceId = id;
          updated = true;
          console.log(`Updated game ${game.Id || game._id} awayConferenceId -> ${id}`);
        }
      }

      if (updated) {
        await game.save();
        updatedGames += 1;
      }
    }

    console.log(`Finished syncing. Updated ${updatedGames} games.`);
  } catch (err) {
    console.error('Failed to sync conference IDs:', err);
  } finally {
    mongoose.disconnect();
  }
}

syncConferenceIds();
