const mongoose = require('mongoose');
const fs = require('fs');
const db = require('./db'); // uses your existing connection logic

const GameSchema = new mongoose.Schema({
  homeConference: String,
  awayConference: String,
  homeTeam: mongoose.Schema.Types.ObjectId,
  awayTeam: mongoose.Schema.Types.ObjectId,
}, { collection: 'games', versionKey: false });

const ConferenceSchema = new mongoose.Schema({
  confId: Number,
  confName: String
}, { collection: 'conferences', versionKey: false });

const Game = mongoose.model('Game', GameSchema);
const Conference = mongoose.model('Conference', ConferenceSchema);

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', async () => {
  console.log('Connected to MongoDB');

  try {
    const conferences = await Conference.find({}, { confName: 1 }).lean();
    const validConfNames = new Set(conferences.map(c => c.confName));

    const games = await Game.find({}, {
      homeConference: 1,
      awayConference: 1,
      awayTeam: 1,
      homeTeam: 1
    }).lean();

    const conferenceTeams = {};

    games.forEach(game => {
      const { homeConference, awayConference, homeTeam, awayTeam } = game;

      if (homeConference && validConfNames.has(homeConference)) {
        if (!conferenceTeams[homeConference]) conferenceTeams[homeConference] = new Set();
        if (homeTeam != null) conferenceTeams[homeConference].add(homeTeam.toString());
      } else if (homeConference) {
        console.warn(`Unknown homeConference name: ${homeConference}`);
      }

      if (awayConference && validConfNames.has(awayConference)) {
        if (!conferenceTeams[awayConference]) conferenceTeams[awayConference] = new Set();
        if (awayTeam != null) conferenceTeams[awayConference].add(awayTeam.toString());
      } else if (awayConference) {
        console.warn(`Unknown awayConference name: ${awayConference}`);
      }
    });

    const output = {};
    for (const [confName, teamSet] of Object.entries(conferenceTeams)) {
      output[confName] = Array.from(teamSet);
    }

    fs.writeFileSync('conferenceTeamMap.json', JSON.stringify(output, null, 2));
    console.log('✅ Conference team map saved to conferenceTeamMap.json');
  } catch (err) {
    console.error('❌ Error generating conference team map:', err);
  } finally {
    mongoose.disconnect();
  }
});
