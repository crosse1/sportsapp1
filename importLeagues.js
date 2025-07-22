const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const db = require('./db');
const League = require('./models/League');

// Log connection events

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

function importLeagues(filePath) {
  return new Promise((resolve, reject) => {
    const leagues = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => {
        if (row.leagueId && row.leagueName) {
          leagues.push({
            leagueId: String(row.leagueId),
            leagueName: row.leagueName
          });
        }
      })
      .on('end', async () => {
        try {
          for (const league of leagues) {
            await League.findOneAndUpdate(
              { leagueId: league.leagueId },
              league,
              { upsert: true, new: true }
            );
          }
          console.log(`Imported ${leagues.length} leagues`);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

const file = process.argv[2] || 'public/files/Leagues.csv';

importLeagues(file)
  .then(() => console.log('League import completed'))
  .catch(err => {
    console.error('Failed to import leagues:', err);
  })
  .finally(() => {
    mongoose.disconnect();
  });
