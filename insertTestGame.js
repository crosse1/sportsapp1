// insertCustomGame.js
// Inserts a custom Game row with current local startDate and venueId 10804.

const mongoose = require('mongoose');

// ---- Load Models (adjust paths if needed) ----
const Game = require('./models/Game');     // your game schema file
const Venue = require('./models/Venue');   // optional lookup for venue name

// ---- MongoDB connection ----
// Prefer env var; example: MONGO_URI="mongodb://localhost:27017/appUsers"
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster';

mongoose.set('strictQuery', true);

async function getNextUniqueGameId() {
  // Simple strategy: max(gameId) + 1, with a safety probe to avoid collisions.
  const maxDoc = await Game.findOne({}, { gameId: 1 }).sort({ gameId: -1 }).lean();
  let candidate = (maxDoc?.gameId ?? 0) + 1;

  // Probe upward until no collision (fast exists() check).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await Game.exists({ gameId: candidate });
    if (!exists) return candidate;
    candidate += 1;
  }
}

async function main() {
  console.log('Connecting to Mongo:', MONGO_URI);
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected.');

  try {
    // Required adjustments
    const desiredVenueId = 10804;

    // Try to resolve venue name; fallback to "10804" if not found.
    let venueName = '10804';
    try {
      const venueDoc = await Venue.findOne({ venueId: desiredVenueId }).lean();
      if (venueDoc?.name) {
        venueName = venueDoc.name;
      }
    } catch (lookupErr) {
      console.warn('Venue lookup failed; falling back to "10804".', lookupErr?.message || lookupErr);
    }

    // Current local date/time
    const startDateLocal = new Date();
    console.log('Using startDate:', startDateLocal.toString(), '→ ISO:', startDateLocal.toISOString());

    // Unique gameId
    const newGameId = await getNextUniqueGameId();
    console.log('Assigned unique gameId:', newGameId);

    // Build payload using your example (with requested changes)
    const payload = {
      gameId: newGameId,
      season: 2025,
      week: 1,
      seasonType: 'regular',
      startDate: startDateLocal,           // current local time
      startTimeTBD: false,
      completed: false,
      neutralSite: false,
      conferenceGame: false,

      // Requested venue fields
      venueId: desiredVenueId,
      venue: venueName,                    // will be actual venue name if found, else "10804"

      // Teams from your example (ObjectId strings)
      homeTeam: new mongoose.Types.ObjectId('687ebf79c6407a8e20ade535'),
      homeTeamName: 'Kansas',
      homeClassification: 'fbs',
      homeConference: 'Big 12',
      homeLineScores: [],
      homePregameElo: 1583,

      awayTeam: new mongoose.Types.ObjectId('687ebf79c6407a8e20ade4d2'),
      awayTeamName: 'Fresno State',
      awayClassification: 'fbs',
      awayConference: 'Mountain West',
      awayLineScores: [],
      awayPregameElo: 1490,

      // Optional fields from schema we’re leaving default/empty:
      // attendance, highlights, notes, points, Elo postgame, etc.
      highlights: '',
      notes: '',
      ratings: [],
    };

    const created = await Game.create(payload);

    console.log('\n✅ Inserted Game:');
    console.log({
      _id: created._id.toString(),
      gameId: created.gameId,
      season: created.season,
      week: created.week,
      seasonType: created.seasonType,
      startDate: created.startDate.toISOString(),
      venueId: created.venueId,
      venue: created.venue,
      homeTeam: created.homeTeam?.toString(),
      homeTeamName: created.homeTeamName,
      awayTeam: created.awayTeam?.toString(),
      awayTeamName: created.awayTeamName,
    });
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.gameId) {
      console.error('❌ Duplicate gameId detected unexpectedly. Re-run to try again.');
    } else {
      console.error('❌ Error inserting game:', err);
    }
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  mongoose.connection.close();
});
