const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const Venue = require('./models/Venue');
const db = require('./db'); // this will trigger the connection

db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', async () => {
  console.log('Connected to MongoDB');

  const file = process.argv[2] || 'public/files/venue.csv';
  if (!file) {
    console.error('Usage: node updateVenueImages.js path/to/venue.csv');
    process.exit(1);
  }

  try {
    const records = await loadCSV(file);
    console.log(`Loaded ${records.length} records from CSV`);

    let checked = 0;
    let updated = 0;

    for (const row of records) {
      const id = row.venueId || row.venueID || row.VenueId || row.VENUEID || row.id || row.Id;
      const imgUrl = row.imgUrl || row.imgURL || row.ImgUrl || row.IMGURL;

      if (!id || !imgUrl) {
        console.warn('Skipping row due to missing data:', row);
        continue;
      }

      checked += 1;
      const venue = await Venue.findOne({ venueId: Number(id) });

      if (venue && (!venue.imgUrl || venue.imgUrl === '')) {
        venue.imgUrl = imgUrl;
        await venue.save();
        updated += 1;
        console.log(`Updated venue ${id}`);
      }
    }

    console.log(`✔️ Checked ${checked} venues`);
    console.log(`🖼️ Updated ${updated} venues`);
  } catch (err) {
    console.error('❌ Error processing file:', err.message);
  } finally {
    mongoose.disconnect();
  }
});

function loadCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}
