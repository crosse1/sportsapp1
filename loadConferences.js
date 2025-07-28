const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const db = require('./db');
const Conference = require('./models/Conference');

// Log connection events

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

function loadConferences(filePath, overwrite = false) {
  return new Promise((resolve, reject) => {
    const conferences = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => {
        const confName = row.confName;
        const confId = row.confId ? Number(row.confId) : undefined;
        if (confName && confId) {
          conferences.push({ confName, confId });
        } else {
          console.warn(`Malformed row skipped: ${JSON.stringify(row)}`);
        }
      })
      .on('end', async () => {
        try {
          for (const conf of conferences) {
            if (overwrite) {
              await Conference.findOneAndUpdate(
                { confId: conf.confId },
                conf,
                { upsert: true, new: true }
              );
              console.log(`Upserted conference ${conf.confName}`);
            } else {
              const exists = await Conference.exists({ confId: conf.confId });
              if (exists) {
                console.log(`Skipped existing conference ${conf.confName}`);
                continue;
              }
              await new Conference(conf).save();
              console.log(`Inserted conference ${conf.confName}`);
            }
          }
          console.log(`Processed ${conferences.length} conferences`);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

const file = process.argv[2] || 'public/files/Conferences.csv';
const overwrite = process.argv.includes('--overwrite');

loadConferences(file, overwrite)
  .then(() => console.log('Conference load completed'))
  .catch(err => {
    console.error('Failed to load conferences:', err);
  })
  .finally(() => {
    mongoose.disconnect();
  });
