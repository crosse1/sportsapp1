const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');

// ==== CONFIG (edit these) ====
const MONGODB_URI = "mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster";
const COLLECTION = "games";
const CSV_PATH = "public/files/GamesDate1.csv";
const DRY_RUN = false; // true = log only, don't write
// Which document fields might hold your external game id?
const ID_FIELDS = ['gameId', 'id', 'espnId', 'Id']; // add/remove as needed
// Which date field should be updated / used as fallback?
const DATE_FIELDS_PREFERENCE = ['startDate', 'gameDate']; // first found wins
// ============================

// --- helpers ---
function tryParseDate(val) {
  if (!val) return { ok: false, date: null };
  const d = new Date(val);
  return isNaN(d) ? { ok: false, date: null } : { ok: true, date: d };
}
function normalizeForCompare(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string') {
    const { ok, date } = tryParseDate(val);
    return ok ? date.getTime() : val.trim();
  }
  const d = new Date(val);
  return isNaN(d) ? String(val) : d.getTime();
}
function isObjectIdString(s) {
  return typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);
}
function pickTargetDateField(doc) {
  for (const f of DATE_FIELDS_PREFERENCE) {
    if (Object.prototype.hasOwnProperty.call(doc, f)) return f;
  }
  return DATE_FIELDS_PREFERENCE[0]; // default to first if none exist
}

async function run() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000, maxPoolSize: 5 });
  console.log('✅ Connected to MongoDB');

  const col = mongoose.connection.db.collection(COLLECTION);

  // Read + normalize CSV rows (lowercase keys)
  const rows = await new Promise((resolve, reject) => {
    const out = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        const lower = {};
        for (const [k, v] of Object.entries(row)) {
          lower[String(k).trim().toLowerCase()] = v;
        }
        out.push(lower);
      })
      .on('end', () => resolve(out))
      .on('error', reject);
  });

  console.log(`📄 Loaded ${rows.length} rows from ${CSV_PATH}`);

  let examined = 0, updated = 0, notFound = 0, skipped = 0;

  for (const r of rows) {
    examined++;

    // Your CSV uses Id/StartDate -> after normalization these are id/startdate
    const rawId = r.gameid ?? r.id ?? r._id ?? r.eventid ?? r.espnid;
    const rawDate = r.startdate ?? r.gamedate ?? r.date ?? r.start ?? r.start_time;

    if (!rawId || !rawDate) {
      console.warn(`⚠️ Skipping malformed row: ${JSON.stringify(r)}`);
      skipped++;
      continue;
    }

    const idStr = String(rawId).trim();
    const idNum = Number(idStr);
    const or = [];

    // Match by _id if it looks like ObjectId
    if (isObjectIdString(idStr)) {
      or.push({ _id: new mongoose.Types.ObjectId(idStr) });
    }

    // Try each configured ID field as number and as string
    for (const f of ID_FIELDS) {
      or.push({ [f]: idStr });
      if (!Number.isNaN(idNum)) or.push({ [f]: idNum });
    }

    const doc = await col.findOne({ $or: or });
    if (!doc) {
      console.warn(`🔎 Not found in DB for id="${idStr}" (tried fields: ${ID_FIELDS.join(', ')})`);
      notFound++;
      continue;
    }

    const targetField = pickTargetDateField(doc);
    const current = doc[targetField];
    const currentNorm = normalizeForCompare(current);
    const csvNorm = normalizeForCompare(rawDate);

    if (currentNorm === csvNorm) {
      continue; // already matches
    }

    // Respect existing type: if DB has Date and CSV parses, write a Date; else write string
    const parsed = tryParseDate(rawDate);
    const newValue = (current instanceof Date && parsed.ok) ? parsed.date : rawDate;

    const beforeStr = current instanceof Date ? current.toISOString() : String(current);
    const afterStr = newValue instanceof Date ? newValue.toISOString() : String(newValue);

    if (DRY_RUN) {
      console.log(`DRY-RUN ✅ Would update _id=${doc._id} ${targetField}: "${beforeStr}" -> "${afterStr}"`);
      updated++;
      continue;
    }

    await col.updateOne({ _id: doc._id }, { $set: { [targetField]: newValue } });
    console.log(`✅ Updated _id=${doc._id} ${targetField}: "${beforeStr}" -> "${afterStr}"`);
    updated++;
  }

  console.log('\n---- Summary ----');
  console.log(`Examined CSV rows: ${examined}`);
  console.log(`Updated documents: ${updated}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`Not found in DB:   ${notFound}`);
  console.log(`Skipped rows:      ${skipped}`);

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('💥 Error:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
