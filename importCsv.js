const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const Team = require('./models/Team');
const Game = require('./models/Game');
const Venue = require('./models/Venue');

mongoose.connect("mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', err => console.error('MongoDB connection error:', err));

db.once('open', () => console.log('Connected to MongoDB'));

function parseBoolean(val) {
  if (val === undefined || val === null) return undefined;
  const str = String(val).trim().toUpperCase();
  if (str === 'TRUE') return true;
  if (str === 'FALSE') return false;
  return undefined;
}

function parseNumber(val) {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
}

function parseLineScores(val) {
  if (!val) return [];
  const delimiters = ['|', '-', ';', ' '];
  for (const d of delimiters) {
    if (val.includes(d)) {
      return val.split(d).map(v => parseNumber(v)).filter(v => v !== undefined);
    }
  }
  const num = parseNumber(val);
  return num !== undefined ? [num] : [];
}

async function importVenues() {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream('public/files/Venues2.csv')
      .pipe(csv())
      .on('data', rawRow => {
        // ==== FIX BOM + stray quotes ====
        const row = {};
        for (let [k, v] of Object.entries(rawRow)) {
          k = k.replace(/^\uFEFF/, "");        // remove BOM
          k = k.replace(/^"+|"+$/g, "");       // strip surrounding quotes
          row[k] = v;
        }

        rows.push(row);
      })

      .on('end', async () => {
        try {
          let inserted = 0;
          let skipped = 0;

          for (const row of rows) {
            const id = parseNumber(row.Id);
            if (!id) {
              console.warn(`⏭️ Skipping row with invalid venue Id:`, row);
              continue;
            }

            // Does this venue already exist?
            const existing = await Venue.findOne({ venueId: id });

            if (existing) {
              skipped++;
              continue; // don't overwrite existing venue
            }

            // Link team if applicable
            const teamDoc = await Team.findOne({ 'location.id': id });

            const venue = new Venue({
              venueId: id,
              name: row.Name,
              capacity: parseNumber(row.Capacity),
              grass: parseBoolean(row.Grass),
              dome: parseBoolean(row.Dome),
              city: row.City,
              state: row.State,
              zip: row.Zip,
              countryCode: row.CountryCode,
              timezone: row.Timezone,
              coordinates: row.Latitude && row.Longitude ? {
                type: 'Point',
                coordinates: [
                  parseNumber(row.Longitude),
                  parseNumber(row.Latitude)
                ]
              } : undefined,
              elevation: parseNumber(row.Elevation),
              constructionYear: parseNumber(row.ConstructionYear),
              team: teamDoc ? teamDoc._id : undefined
            });

            await venue.save();
            inserted++;
          }

          console.log(`🏟️ Venues processed: ${rows.length}`);
          console.log(`➡️ Inserted: ${inserted}`);
          console.log(`➡️ Skipped (already existed): ${skipped}`);

          resolve();
        } catch (err) {
          reject(err);
        }
      })

      .on('error', reject);
  });
}


async function importTeams() {
  return new Promise((resolve, reject) => {
    const teams = [];
    fs.createReadStream('public/files/Team.csv')
      .pipe(csv())
      .on('data', (row) => {
        const team = {
          teamId: parseNumber(row.Id || row['"Id"']),
          school: row.School,
          mascot: row.Mascot,
          abbreviation: row.Abbreviation,
          alternateNames: [row['AlternateNames[0]'], row['AlternateNames[1]']].filter(v => v && v !== '#null'),
          conference: row.Conference,
          division: row.Division,
          classification: row.Classification,
          color: row.Color && row.Color !== '#null' ? row.Color : undefined,
          alternateColor: row.AlternateColor && row.AlternateColor !== '#null' ? row.AlternateColor : undefined,
          logos: [row['Logos[0]'], row['Logos[1]']].filter(v => v && v !== '#null'),
          twitter: row.Twitter,
          location: {
            id: parseNumber(row['Location Id']),
            name: row['Location Name'],
            city: row['Location City'],
            state: row['Location State'],
            zip: row['Location Zip'],
            countryCode: row['Location CountryCode'],
            timezone: row['Location Timezone'],
            latitude: parseNumber(row['Location Latitude']),
            longitude: parseNumber(row['Location Longitude']),
            elevation: parseNumber(row['Location Elevation']),
            capacity: parseNumber(row['Location Capacity']),
            constructionYear: parseNumber(row['Location ConstructionYear']),
            grass: parseBoolean(row['Location Grass']),
            dome: parseBoolean(row['Location Dome'])
          }
        };
        teams.push(team);
      })
      .on('end', async () => {
        try {
          await Team.deleteMany({});
          await Team.insertMany(teams);
          console.log(`Imported ${teams.length} teams`);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

async function importGames() {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream('public/files/Games2.csv')
      .pipe(csv())
      .on('data', raw => {
        const cleaned = {};
        for (let [key, value] of Object.entries(raw)) {

          // 🔥 Fix 1: Remove UTF-8 BOM if present
          key = key.replace(/^\uFEFF/, '');

          // 🔥 Fix 2: Remove accidental leading/trailing quotes
          key = key.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');

          cleaned[key] = value;
        }

        rows.push(cleaned);
      })
      .on('end', async () => {
        try {
          await Game.deleteMany({});

          for (const row of rows) {

            // Use cleaned Id
            const gameId = parseNumber(row.Id);

            if (gameId === undefined || gameId === null) {
              console.warn(`⏭️ Skipping row with invalid Id: ${JSON.stringify(row, null, 2)}`);
              continue;
            }

            const homeTeamDoc = await Team.findOne({ teamId: parseNumber(row.HomeId) });
            const awayTeamDoc = await Team.findOne({ teamId: parseNumber(row.AwayId) });

            const game = new Game({
              gameId,
              season: parseNumber(row.Season),
              week: parseNumber(row.Week),
              seasonType: row.SeasonType,
              startDate: row.StartDate ? new Date(row.StartDate) : undefined,
              startTimeTBD: parseBoolean(row.StartTimeTBD),
              completed: parseBoolean(row.Completed),
              neutralSite: parseBoolean(row.NeutralSite),
              conferenceGame: parseBoolean(row.ConferenceGame),
              attendance: parseNumber(row.Attendance),
              venueId: parseNumber(row.VenueId),
              venue: row.Venue,

              homeTeam: homeTeamDoc ? homeTeamDoc._id : undefined,
              homeTeamName: row.HomeTeam,
              homeClassification: row.HomeClassification,
              homeConference: row.HomeConference,
              homePoints: parseNumber(row.HomePoints),
              homeLineScores: parseLineScores(row.HomeLineScores),
              homePostgameWinProbability: parseNumber(row.HomePostgameWinProbability),
              homePregameElo: parseNumber(row.HomePregameElo),
              homePostgameElo: parseNumber(row.HomePostgameElo),

              awayTeam: awayTeamDoc ? awayTeamDoc._id : undefined,
              awayTeamName: row.AwayTeam,
              awayClassification: row.AwayClassification,
              awayConference: row.AwayConference,
              awayPoints: parseNumber(row.AwayPoints),
              awayLineScores: parseLineScores(row.AwayLineScores),
              awayPostgameWinProbability: parseNumber(row.AwayPostgameWinProbability),
              awayPregameElo: parseNumber(row.AwayPregameElo),
              awayPostgameElo: parseNumber(row.AwayPostgameElo),

              excitementIndex: parseNumber(row.ExcitementIndex),
              highlights: row.Highlights,
              notes: row.Notes
            });

            await game.save();
          }

          console.log(`Imported ${rows.length} games`);
          resolve();

        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}




async function run() {
  try {
    
    await importVenues();
    
    console.log('CSV import completed');
  } catch (err) {
    console.error('Import failed', err);
  } finally {
    mongoose.disconnect();
  }
}

run();
