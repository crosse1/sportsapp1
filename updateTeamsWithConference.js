const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const db = require('./db');
const Team = require('./models/Team');

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

function updateTeams(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => {
        const teamId = row.Id ? Number(row.Id) : undefined;
        const conferenceId = row.ConferenceId;
        if (teamId && conferenceId) {
          records.push({ teamId, conferenceId: String(conferenceId) });
        }
      })
      .on('end', async () => {
        try {
          for (const rec of records) {
            const result = await Team.updateOne({ teamId: rec.teamId }, { conferenceId: rec.conferenceId });
            if (result.matchedCount === 0) {
              console.warn(`Team with id ${rec.teamId} not found`);
            }
          }
          console.log(`Updated ${records.length} teams`);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

const file = process.argv[2] || 'public/files/teamConf.csv';

updateTeams(file)
  .then(() => console.log('Team update completed'))
  .catch(err => {
    console.error('Failed to update teams:', err);
  })
  .finally(() => {
    mongoose.disconnect();
  });
