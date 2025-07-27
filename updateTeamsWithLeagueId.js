const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
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
      // Skip if leagueId already exists
      if (team.leagueId) {
        console.log(`Skipping team ${team.teamId || team._id} — already has leagueId`);
        continue;
      }

      const classification = team.classification;
      if (!classification) {
        console.log(`Team ${team.teamId || team._id} has no classification`);
        continue;
      }

      let league = await League.findOne({ leagueName: classification });

      // Create league if it doesn't exist
      if (!league) {
        const newLeagueId = uuidv4();
        league = new League({
          leagueId: newLeagueId,
          leagueName: classification
        });

        await league.save();
        console.log(`Created new league '${classification}' with ID ${newLeagueId}`);
      }

      // Update team with leagueId
      team.leagueId = league.leagueId;
      await team.save();
      console.log(`Updated team ${team.teamId || team._id} with leagueId ${league.leagueId}`);
    }
  } catch (err) {
    console.error('Failed to update teams with leagueId:', err);
  } finally {
    mongoose.disconnect();
  }
}

addLeagueIds();
