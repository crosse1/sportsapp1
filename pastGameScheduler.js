/* eslint-disable no-console */
const mongoose = require('mongoose');

// ===================== CONFIG =====================
const GAMES_COLLECTION = "games";
const PAST_GAMES_COLLECTION = "pastgames";
const TEAMS_COLLECTION = "teams";

const CHECK_EVERY_MS = 60_000; // run every minute
let   AGE_HOURS = 4;           // migrate 4 hours after startDate
const BATCH_SIZE = 200;        // max docs per pass
const VERBOSE = true;          // extra logs
const TEST_MODE = false;       // if true, treat ALL games as due (for a single manual run)
// ==================================================

let _timer = null;

/** Compute cutoff datetime (now - AGE_HOURS) */
function cutoffDate() {
  return new Date(Date.now() - AGE_HOURS * 60 * 60 * 1000);
}

/** Try to convert unknown → Date or return null */
function toDateSafe(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

/** Number or null */
function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Bool or null */
function boolOrNull(v) {
  if (v == null) return null;
  return Boolean(v);
}

/** Make sure key indexes exist (best-effort) */
async function ensureIndexes(db) {
  const past = db.collection(PAST_GAMES_COLLECTION);
  const games = db.collection(GAMES_COLLECTION);

  try {
    await past.createIndex({ Id: 1 }, { unique: true });
  } catch (e) {
    console.warn('[indexes] Id unique index:', e.message);
  }

  try {
    await games.createIndex({ startDate: 1 });
  } catch (e) {
    console.warn('[indexes] games.startDate index:', e.message);
  }
}

/**
 * Build a PastGame document from a Game doc + optional team meta.
 * This follows YOUR pastGame schema exactly.
 */
function buildPastGameDoc(gameDoc, homeMeta, awayMeta) {
  return {
    Id: numOrNull(gameDoc.gameId),                 // required & unique
    Season: numOrNull(gameDoc.season),             // required
    Week: numOrNull(gameDoc.week),                 // required
    SeasonType: gameDoc.seasonType ?? null,        // required (string)
    StartDate: toDateSafe(gameDoc.startDate),      // required (Date)

    NeutralSite: boolOrNull(gameDoc.neutralSite),
    ConferenceGame: boolOrNull(gameDoc.conferenceGame),
    Attendance: numOrNull(gameDoc.attendance),

    VenueId: numOrNull(gameDoc.venueId),
    Venue: gameDoc.venue ?? null,

    HomeId: homeMeta?.teamId ?? null,
    HomeTeam: gameDoc.homeTeamName ?? null,
    HomeClassification: gameDoc.homeClassification ?? null,
    HomeConference: gameDoc.homeConference ?? null,
    homeConferenceId: numOrNull(gameDoc.homeConferenceId),
    HomePoints: numOrNull(gameDoc.homePoints),

    AwayId: awayMeta?.teamId ?? null,
    AwayTeam: gameDoc.awayTeamName ?? null,
    AwayClassification: gameDoc.awayClassification ?? null,
    AwayConference: gameDoc.awayConference ?? null,
    awayConferenceId: numOrNull(gameDoc.awayConferenceId),
    AwayPoints: numOrNull(gameDoc.awayPoints),

    homeLeagueId: homeMeta?.leagueId ?? null,
    awayLeagueId: awayMeta?.leagueId ?? null,

    ratings: [],
    comments: [],
  };
}

/** Validate required fields for PastGame */
function validatePastGame(p) {
  const errors = [];
  if (p.Id == null) errors.push('Id');
  if (!(p.StartDate instanceof Date)) errors.push('StartDate');
  if (p.Season == null) errors.push('Season');
  if (p.Week == null) errors.push('Week');
  if (p.SeasonType == null) errors.push('SeasonType');
  return errors;
}

/** Fetch minimal team meta (teamId, leagueId) by _id ObjectId (if provided) */
async function fetchTeamMeta(teamsCol, teamObjectId) {
  if (!teamObjectId) return null;
  const t = await teamsCol.findOne(
    { _id: teamObjectId },
    { projection: { teamId: 1, leagueId: 1 } }
  );
  return t ? { teamId: numOrNull(t.teamId), leagueId: numOrNull(t.leagueId) } : null;
}

/**
 * Build the query for due games (or all games in TEST_MODE)
 */
function buildDueQuery(cutoff) {
  // Keep this dead-simple until we see migrations succeed.
  return {
    startDate: { $exists: true, $lte: cutoff }
  };
}

/**
 * One migration pass:
 *  - find due games
 *  - for each, in a txn:
 *      claim the game (set migrating/migratedAt)
 *      build & upsert past doc by Id
 *      delete game
 */
// Replace your migrateBatch with this no-transaction, super-verbose version
async function migrateBatch({ label = 'scheduled' } = {}) {
  const db = mongoose.connection.db;
  if (!db) { console.warn('[migrateBatch] No DB connection yet.'); return; }

  const gamesCol = db.collection(GAMES_COLLECTION);
  const pastCol  = db.collection(PAST_GAMES_COLLECTION);
  const teamsCol = db.collection(TEAMS_COLLECTION);

  const cutoff = cutoffDate();
  if (VERBOSE) console.log(`[${label}] cutoff=${cutoff.toISOString()} TEST_MODE=${TEST_MODE}`);

  // dead-simple due filter
  const query = { startDate: { $exists: true, $lte: cutoff } };

  const rawDue = await gamesCol.countDocuments(query);
  if (VERBOSE) console.log(`[${label}] rawDue=${rawDue}`);
  if (rawDue === 0) { if (VERBOSE) console.log(`[${label}] No due games this pass.`); return; }

  const due = await gamesCol.find(query).limit(BATCH_SIZE).toArray();
  console.log(`🔄 [${label}] Migrating ${due.length} game(s) from ${GAMES_COLLECTION} → ${PAST_GAMES_COLLECTION}...`);

  let moved = 0, skipped = 0, failed = 0;

  for (const g of due) {
    try {
      // Claim (best-effort, no session)
      const now = new Date();
      // CLAIM unconditionally by _id (no session in the no-transaction version)
const claimResult = await gamesCol.findOneAndUpdate(
  { _id: g._id },
  { $set: { migrating: true, claimAt: new Date() } },
  { returnDocument: 'after' }
);
const doc = claimResult && (claimResult.value ?? claimResult);
if (!doc) {
  if (VERBOSE) console.log(`↩️  [${label}] Skipped _id=${g._id} — missing at claim time`);
  continue;
}


      // Team meta (optional)
      const [homeMeta, awayMeta] = await Promise.all([
        fetchTeamMeta(teamsCol, doc.homeTeam),
        fetchTeamMeta(teamsCol, doc.awayTeam)
      ]);

      const pastDoc = buildPastGameDoc(doc, homeMeta, awayMeta);
      const reqMissing = validatePastGame(pastDoc);
      if (reqMissing.length) {
        console.warn(`⚠️ [${label}] Skipping _id=${doc._id} — missing required: ${reqMissing.join(', ')}`);
        if (VERBOSE) console.warn('  Game snapshot:', {
          gameId: doc.gameId, season: doc.season, week: doc.week,
          seasonType: doc.seasonType, startDate: doc.startDate
        });
        // release the claim
        await gamesCol.updateOne({ _id: doc._id }, { $set: { migrating: false }, $unset: { claimAt: "" } });
        skipped++;
        continue;
      }

      // Upsert into pastgames
      let upsertInfo;
      try {
        upsertInfo = await pastCol.updateOne(
          { Id: pastDoc.Id },
          { $setOnInsert: pastDoc },
          { upsert: true }
        );
      } catch (e) {
        // Handle duplicate key (already migrated)
        if (e && e.code === 11000) {
          if (VERBOSE) console.log(`ℹ️  [${label}] Duplicate Id=${pastDoc.Id} — treating as already migrated`);
        } else {
          throw e;
        }
      }

      // Delete from games
      const delRes = await gamesCol.deleteOne({ _id: doc._id });
      if (!delRes.deletedCount) {
        // If we didn't delete, release the claim so it can retry
        await gamesCol.updateOne({ _id: doc._id }, { $set: { migrating: false }, $unset: { claimAt: "" } });
        console.warn(`⚠️ [${label}] Did not delete _id=${doc._id} after upsert; released claim`);
        skipped++;
        continue;
      }

      console.log(`✅ [${label}] Moved game Id=${pastDoc.Id} (_id=${doc._id}) upsertedId:`, upsertInfo?.upsertedId ?? 'matched-existing');
      moved++;
    } catch (err) {
      console.error(`❌ [${label}] _id=${g._id} failed:`, err?.message || err);
      // best-effort release
      try {
        await gamesCol.updateOne({ _id: g._id }, { $set: { migrating: false }, $unset: { claimAt: "" } });
      } catch {}
      failed++;
    }
  }

  console.log(`—— [${label}] Summary: moved=${moved} skipped=${skipped} failed=${failed}`);
}




/** Start the scheduler loop */
async function startPastGameScheduler() {
  if (_timer) return; // already started

  const db = mongoose.connection.db;
  if (!db) {
    console.warn('[scheduler] No DB connection yet; will start once connected.');
  } else {
    await ensureIndexes(db);
    // Kick once immediately on boot
    await migrateBatch({ label: 'startup' }).catch(e => console.error('Initial migrateBatch error:', e));
  }

  _timer = setInterval(() => {
    migrateBatch({ label: 'scheduled' }).catch(err => console.error('migrateBatch error:', err));
  }, CHECK_EVERY_MS);
  _timer.unref?.();
  console.log(`⏱️ pastGame scheduler started (every ${CHECK_EVERY_MS / 1000}s)`);
}

/** Stop the scheduler loop */
function stopPastGameScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/** Manually trigger one pass from main.js */
async function runPastGameMigrationOnce() {
  await migrateBatch({ label: 'manual' });
}

module.exports = { startPastGameScheduler, stopPastGameScheduler, runPastGameMigrationOnce };
