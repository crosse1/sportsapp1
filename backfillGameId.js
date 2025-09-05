/* eslint-disable no-console */
const fs = require('fs');            // kept per your requested imports (unused here)
const csv = require('csv-parser');   // kept per your requested imports (unused here)
const mongoose = require('mongoose');
const db = require('./db');
const Team = require('./models/Team'); // kept per your requested imports (unused here)

// ===== Config via envs (with sane defaults) =====
const PAST_GAMES_COLLECTION = process.env.PAST_GAMES_COLLECTION || 'pastgames';
const DRY_RUN = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

// Log connection status (as in your app)
db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', async () => {
  console.log('Connected to MongoDB');

  try {
    const col = mongoose.connection.db.collection(PAST_GAMES_COLLECTION);

    // --- BEFORE counts ---
    const total = await col.estimatedDocumentCount();
    const withLegacyId = await col.countDocuments({ Id: { $ne: null } });
    const missingGameId = await col.countDocuments({
      $or: [{ gameId: { $exists: false } }, { gameId: null }]
    });

    console.log(`📊 BEFORE
  collection:            ${PAST_GAMES_COLLECTION}
  total docs:            ${total}
  docs with legacy Id:   ${withLegacyId}
  docs missing gameId:   ${missingGameId}`);

    if (DRY_RUN) {
      console.log('🧪 DRY_RUN=true → no modifications will be made.');
    } else {
      // 1) Backfill: set gameId = Id where gameId is missing/null and Id exists
      const filter = {
        $and: [
          { Id: { $ne: null } },
          { $or: [{ gameId: { $exists: false } }, { gameId: null }] }
        ]
      };

      // Use update pipeline so the value is copied server-side
      const backfillRes = await col.updateMany(filter, [{ $set: { gameId: '$Id' } }]);
      console.log(`🛠️ Backfill complete: updated ${backfillRes.modifiedCount} document(s).`);

      // 2) Ensure partial unique index on gameId (unique only when non-null)
      // Drop an existing simple index if present, then create partial unique
      try {
  await col.dropIndex('gameId_1');
  console.log('ℹ️ Dropped existing index "gameId_1" (if it existed).');
} catch (e) {
  if (!/index not found/i.test(String(e?.message))) {
    console.warn('⚠️ dropIndex("gameId_1"):', e.message);
  }
}

      await col.createIndex(
  { gameId: 1 },
  {
    name: 'gameId_1',
    unique: true,
    partialFilterExpression: {
      gameId: { $exists: true, $type: ['string', 'int', 'long', 'double', 'decimal'] }
    }
  }
);
      console.log('✅ Ensured partial unique index on gameId (non-null only).');
    }

    // --- AFTER counts ---
    const missingAfter = await col.countDocuments({
      $or: [{ gameId: { $exists: false } }, { gameId: null }]
    });

    console.log(`📊 AFTER
  docs still missing gameId: ${missingAfter}
  (If > 0, those rows likely also lack a legacy Id.)`);

    // Quick duplicate probe (should be 0 thanks to unique index)
    const dup = await col.aggregate([
      { $match: { gameId: { $ne: null } } },
      { $group: { _id: '$gameId', c: { $sum: 1 } } },
      { $match: { c: { $gt: 1 } } },
      { $limit: 5 }
    ]).toArray();

    if (dup.length) {
      console.warn('⚠️ Found duplicates on non-null gameId (first 5):', dup.map(d => d._id));
    } else {
      console.log('🔍 No duplicates detected for non-null gameId.');
    }
  } catch (err) {
    console.error('❌ Backfill error:', err?.message || err);
    process.exitCode = 1;
  } finally {
    // Close cleanly so the script exits
    await mongoose.connection.close().catch(() => {});
    process.exit();
  }
});
