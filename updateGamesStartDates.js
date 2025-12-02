const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");
const Game = require("./models/Game"); // adjust path if needed

// === CONFIG ===
const MONGODB_URI =
  "mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster";

const CSV_PATH = "public/files/GamesDate5.csv";
const DRY_RUN = false;
// ===============

// Helpers
function parseBool(val) {
  if (val == null) return false;
  return String(val).trim().toLowerCase() === "true";
}

function parseNum(val) {
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function parseLineScores(val) {
  if (!val) return [];
  return String(val)
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => !isNaN(v));
}

function tryParseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function norm(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d.getTime();
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  const gamesCol = mongoose.connection.db.collection("games");
  const pastCol = mongoose.connection.db.collection("pastgames");

  // Load CSV
  const rows = await new Promise((resolve, reject) => {
    const out = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on("data", (row) => {
        const lower = {};
        for (const [k, v] of Object.entries(row)) {
          lower[String(k).toLowerCase()] = v;
        }
        out.push(lower);
      })
      .on("end", () => resolve(out))
      .on("error", reject);
  });

  console.log(`📄 Loaded ${rows.length} CSV rows.`);

  let examined = 0,
    updated = 0,
    inserted = 0;

  for (const r of rows) {
    examined++;

    // Id + date from CSV
    const rawId = r.id;
    const date = tryParseDate(r.startdate);

    if (!rawId || !date) {
      console.log("⚠️ Skipping malformed row (missing id/date):", r);
      continue;
    }

    const idNum = parseNum(rawId);
    const idStr = String(rawId).trim();

    // Build robust ID query used for BOTH collections
    const idQueryOr = [];
    if (idNum !== null) {
      idQueryOr.push(
        { gameId: idNum },
        { gameId: idStr },
        { id: idNum },
        { id: idStr },
        { Id: idNum },
        { Id: idStr }
      );
    } else {
      idQueryOr.push(
        { gameId: idStr },
        { id: idStr },
        { Id: idStr }
      );
    }

    const query = { $or: idQueryOr };

    const game = await gamesCol.findOne(query);
    const past = await pastCol.findOne(query);

    // Update startDate in whichever collection has the doc
    for (const doc of [game, past]) {
      if (!doc) continue;

      if (norm(doc.startDate) !== norm(date)) {
        console.log(`🛠️ Updating startDate for external ID ${rawId} (doc _id=${doc._id})`);

        if (!DRY_RUN) {
          const col = doc === game ? gamesCol : pastCol;
          await col.updateOne(
            { _id: doc._id },
            { $set: { startDate: date } }
          );
        }

        updated++;
      }
    }

    // 🚫 If this external ID exists in either collection, do NOT create a new Game
    if (game || past) {
      // Optional: debugging logs so you can see why it skipped
      // console.log(`⏭️ Skipping create for external ID ${rawId} (already in ${game ? "games" : ""}${game && past ? " & " : ""}${past ? "pastgames" : ""})`);
      continue;
    }

    // Build Game model object from CSV
    const gameIdNum = idNum; // For the schema's gameId (Number)
    const newGame = {
      gameId: gameIdNum,
      season: parseNum(r.season),
      week: parseNum(r.week),
      seasonType: r.seasontype || null,
      startDate: date,
      startTimeTBD: parseBool(r.starttimetbd),
      completed: parseBool(r.completed),
      neutralSite: parseBool(r.neutralsite),
      conferenceGame: parseBool(r.conferencegame),
      attendance: parseNum(r.attendance),
      venueId: parseNum(r.venueid),
      venue: r.venue || null,

      // home team data
      homeTeam: null,
      homeTeamName: r.hometeam || null,
      homeClassification: r.homeclassification || null,
      homeConference: r.homeconference || null,
      homePoints: parseNum(r.homepoints),
      homeLineScores: parseLineScores(r.homelinescores),
      homePostgameWinProbability: parseNum(r.homepostgamewinprobability),
      homePregameElo: parseNum(r.homepregameelo),
      homePostgameElo: parseNum(r.homepostgameelo),

      // away team data
      awayTeam: null,
      awayTeamName: r.awayteam || null,
      awayClassification: r.awayclassification || null,
      awayConference: r.awayconference || null,
      awayPoints: parseNum(r.awaypoints),
      awayLineScores: parseLineScores(r.awaylinescores),
      awayPostgameWinProbability: parseNum(r.awaypostgamewinprobability),
      awayPregameElo: parseNum(r.awaypregameelo),
      awayPostgameElo: parseNum(r.awaypostgameelo),

      excitementIndex: parseNum(r.excitementindex),
      ratings: [],
      notes: null,
      highlights: null,
      homeConferenceId: null,
      awayConferenceId: null
    };

    if (DRY_RUN) {
      console.log("🆕 DRY-RUN: Would create Game:", newGame);
    } else {
      await Game.create(newGame);
      console.log(`🆕 Inserted new Game for external ID ${rawId} (gameId=${gameIdNum})`);
    }

    inserted++;
  }

  console.log("\n===== SUMMARY =====");
  console.log("Examined:", examined);
  console.log("Updated startDate:", updated);
  console.log("Inserted new games:", inserted);
  console.log("===================\n");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("💥 ERROR:", err);
  mongoose.disconnect();
});
