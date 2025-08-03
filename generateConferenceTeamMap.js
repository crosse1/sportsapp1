require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

const GameSchema = new mongoose.Schema({
  homeConference: Number,
  awayConference: Number,
  HomeId: Number,
  AwayId: Number
}, { collection: 'games', versionKey: false });

const ConferenceSchema = new mongoose.Schema({
  confId: Number,
  confName: String
}, { collection: 'conferences', versionKey: false });

const Game = mongoose.model('Game', GameSchema);
const Conference = mongoose.model('Conference', ConferenceSchema);

async function generateMap() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not defined in the .env file');
    process.exit(1);
  }

  await mongoose.connect(uri);

  try {
    const conferences = await Conference.find({}, { confId: 1, confName: 1 }).lean();
    const confIdToName = {};
    conferences.forEach(({ confId, confName }) => {
      confIdToName[confId] = confName;
    });

    const games = await Game.find({}, { homeConference: 1, awayConference: 1, HomeId: 1, AwayId: 1 }).lean();
    const conferenceTeams = {};

    games.forEach(game => {
      const { homeConference, awayConference, HomeId, AwayId } = game;

      if (homeConference != null) {
        const confName = confIdToName[homeConference];
        if (confName) {
          if (!conferenceTeams[confName]) conferenceTeams[confName] = new Set();
          if (HomeId != null) conferenceTeams[confName].add(HomeId);
        } else {
          console.warn(`Unknown conference ID: ${homeConference}`);
        }
      }

      if (awayConference != null) {
        const confName = confIdToName[awayConference];
        if (confName) {
          if (!conferenceTeams[confName]) conferenceTeams[confName] = new Set();
          if (AwayId != null) conferenceTeams[confName].add(AwayId);
        } else {
          console.warn(`Unknown conference ID: ${awayConference}`);
        }
      }
    });

    const output = {};
    for (const [confName, teamSet] of Object.entries(conferenceTeams)) {
      output[confName] = Array.from(teamSet);
    }

    fs.writeFileSync('conferenceTeamMap.json', JSON.stringify(output, null, 2));
    console.log('Conference team map saved to conferenceTeamMap.json');
  } catch (err) {
    console.error('Error generating conference team map', err);
  } finally {
    await mongoose.disconnect();
  }
}

generateMap();
