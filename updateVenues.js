const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const db = require('./db');
const Team = require('./models/Team');
const Venue = require('./models/Venue');

// Log connection events

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

function updateVenues(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => {
        const teamId = row.Id ? Number(row.Id) : undefined;
        const imgUrl = row.imgUrl || row.imgURL || row.ImgUrl || row.IMGURL; // handle case variations
        if (teamId && imgUrl) {
          records.push({ teamId, imgUrl });
        }
      })
      .on('end', async () => {
        try {
          let updated = 0;
          for (const rec of records) {
            const team = await Team.findOne({ teamId: rec.teamId });
            if (!team) {
              console.warn(`Team with teamId ${rec.teamId} not found`);
              continue;
            }
            const venue = await Venue.findOne({ team: team._id });
            if (!venue) {
              console.warn(`Venue for teamId ${rec.teamId} not found`);
              continue;
            }
            venue.imgUrl = rec.imgUrl;
            await venue.save();
            updated += 1;
          }
          console.log(`Updated ${updated} venues`);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

const file = process.argv[2] || 'public/files/stadiumImg.csv';

updateVenues(file)
  .then(() => console.log('Venue update completed'))
  .catch(err => {
    console.error('Failed to update venues:', err);
  })
  .finally(() => {
    mongoose.disconnect();
  });
