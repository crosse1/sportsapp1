const mongoose = require('mongoose');
const db = require('./db');
const Team = require('./models/Team');
const League = require('./models/League');

// Log connection events
db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

async function addLeagueIds() {
  try {
    const teams = await Team.find({});

    for (const team of teams) {
      const classification = team.classification;
      if (!classification) {
        console.log(`Team ${team.teamId || team._id} has no classification`);
        continue;
      }

      const league = await League.findOne({ leagueName: classification });
      if (league) {
        team.leagueId = league.leagueId;
        await team.save();
        console.log(`Updated team ${team.teamId || team._id} with leagueId ${league.leagueId}`);
      } else {
        console.log(`No league match for team ${team.teamId || team._id}`);
      }
    }
  } catch (err) {
    console.error('Failed to update teams with leagueId:', err);
  } finally {
    mongoose.disconnect();
  }
}

addLeagueIds();
