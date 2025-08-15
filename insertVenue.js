// insertCustomVenue.js
// Inserts a customized Venue with requested fields and a NEW unique venueId.

const mongoose = require('mongoose');

// ---- Load Models ----
const Venue = require('./models/Venue'); // uses your provided schema

// ---- MongoDB connection ----
// Prefer env var; falls back to placeholder string if needed.
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster';

mongoose.set('strictQuery', true);

async function getNextUniqueVenueId() {
  // Find the next available numeric venueId (max + 1), skipping any collisions just in case.
  const maxDoc = await Venue.findOne({}, { venueId: 1 }).sort({ venueId: -1 }).lean();
  let candidate = (maxDoc?.venueId ?? 0) + 1;

  // In the unlikely event of a race or gaps, probe upward until no collision.
  // (Exists is fast and optimized.)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await Venue.exists({ venueId: candidate });
    if (!exists) return candidate;
    candidate += 1;
  }
}

async function upsertCustomVenue() {
  try {
    console.log('Connecting to Mongo:', MONGO_URI);
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected.');

    // NOTE: You asked for these exact values even though the coordinates
    // (-87.66040, 41.93274) are in Chicago, not Atlanta.
    // Keeping as requested.
    const payload = {
      name: 'Mercedes-Benz Stadium',
      imgUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/BDS2024.jpg/…', // Consider replacing with full URL
      capacity: 75000,
      grass: false,
      dome: true,
      city: 'Atlanta',
      state: 'GA',
      zip: '30313',
      countryCode: 'US',
      timezone: 'America/New_York',
      coordinates: {
        type: 'Point',
        // GeoJSON is [longitude, latitude]; West is negative.
        coordinates: [-87.66040, 41.93274],
      },
      elevation: 307.9,
      constructionYear: 2017,
      // team: someTeamObjectIdIfYouHaveOne
    };

    // Optional safety: if you don’t want duplicate-name venues in same city.
    const sameNameCity = await Venue.findOne({ name: payload.name, city: payload.city }).lean();
    if (sameNameCity) {
      console.warn(
        `A venue named "${payload.name}" already exists in ${payload.city} (venueId=${sameNameCity.venueId}). Inserting a new one anyway with a new venueId as requested.`
      );
    }

    // Get a NEW unique venueId
    const venueId = await getNextUniqueVenueId();
    payload.venueId = venueId;

    const created = await Venue.create(payload);
    console.log('✅ Inserted venue:');
    console.log({
      _id: created._id.toString(),
      venueId: created.venueId,
      name: created.name,
      city: created.city,
      state: created.state,
      timezone: created.timezone,
      coords: created.coordinates,
    });
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.venueId) {
      console.error('❌ Duplicate venueId encountered despite probing. Re-run to try again.');
    } else {
      console.error('❌ Error inserting venue:', err);
    }
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

upsertCustomVenue();
