const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const db = require('./db');
const PastGame = require('./models/PastGame');

// Log connection events

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

function parseBoolean(val) {
  if (val === undefined || val === null) return undefined;
  const str = String(val).trim().toUpperCase();
  if (str === 'TRUE') return true;
  if (str === 'FALSE') return false;
  return undefined;
}

function parseNumber(val) {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
}

function importPastGames(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', async () => {
        let added = 0;
        let skipped = 0;
        try {
          for (const row of rows) {
            const id = parseNumber(row.Id);
            if (!id) continue;
            const exists = await PastGame.exists({ Id: id });
            if (exists) {
              skipped++;
              continue;
            }
            const game = new PastGame({
              Id: id,
              Season: parseNumber(row.Season),
              Week: parseNumber(row.Week),
              SeasonType: row.SeasonType,
              StartDate: row.StartDate ? new Date(row.StartDate) : undefined,
              NeutralSite: parseBoolean(row.NeutralSite),
              ConferenceGame: parseBoolean(row.ConferenceGame),
              Attendance: parseNumber(row.Attendance),
              VenueId: parseNumber(row.VenueId),
              Venue: row.Venue,
              HomeId: parseNumber(row.HomeId),
              HomeTeam: row.HomeTeam,
              HomeClassification: row.HomeClassification,
              HomeConference: row.HomeConference,
              homeConferenceId: parseNumber(row.homeConferenceId),
              HomePoints: parseNumber(row.HomePoints),
              AwayId: parseNumber(row.AwayId),
              AwayTeam: row.AwayTeam,
              AwayClassification: row.AwayClassification,
              AwayConference: row.AwayConference,
              awayConferenceId: parseNumber(row.awayConferenceId),
              AwayPoints: parseNumber(row.AwayPoints),
              awayLeagueId: parseNumber(row.awayLeagueId),
              homeLeagueId: parseNumber(row.homeLeagueId)
            });
            await game.save();
            added++;
          }
          console.log(`Added ${added} records, skipped ${skipped} duplicates`);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

const file = process.argv[2] || 'public/files/2021.csv';

importPastGames(file)
  .then(() => console.log('Past games import completed'))
  .catch(err => {
    console.error('Failed to import past games:', err);
  })
  .finally(() => {
    mongoose.disconnect();
  });
