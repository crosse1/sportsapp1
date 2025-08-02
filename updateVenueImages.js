const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const Venue = require('./models/Venue');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set');
  process.exit(1);
}

async function updateVenueImages(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node updateVenueImages.js path/to/venues.csv');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const records = await updateVenueImages(file);
    let checked = 0;
    let updated = 0;

    for (const row of records) {
      const id = row.venueId || row.venueID || row.VenueId || row.VENUEID || row.id || row.Id;
      const imgUrl = row.imgUrl || row.imgURL || row.ImgUrl || row.IMGURL;
      if (!id || !imgUrl) continue;
      checked += 1;

      try {
        const venue = await Venue.findOne({ venueId: Number(id) });
        if (venue && (!venue.imgUrl || venue.imgUrl === '')) {
          venue.imgUrl = imgUrl;
          await venue.save();
          updated += 1;
        }
      } catch (err) {
        console.error(`Error updating venueId ${id}:`, err.message);
      }
    }

    console.log(`Checked ${checked} venues`);
    console.log(`Updated ${updated} venues`);
  } catch (err) {
    console.error('Error processing file:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();
