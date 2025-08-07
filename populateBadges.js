const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// --- MongoDB connection ---
const mongoURI = 'mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

// --- Load models ---
const Team = require('./models/Team');
const Game = require('./models/Game');
const Badge = require('./models/Badge');

// --- Load conferenceTeamMap.json ---
const teamMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'conferenceTeamMap.json'), 'utf-8'));

// --- Main Function ---
async function populate2025HomerBadges() {
  let badgeIDCounter = 231;

  for (const conferenceId in teamMap) {
    for (const teamId of teamMap[conferenceId]) {
      try {
        const team = await Team.findById(teamId);
        if (!team) {
          console.warn(`Team with ID ${teamId} not found.`);
          continue;
        }

        const start = new Date('2025-08-01T00:00:00Z');
        const end = new Date('2025-12-31T23:59:59Z');

        // DEBUG: Find one sample game for logging
        const sampleGame = await Game.findOne({ homeTeam: team._id });
        console.log(`Sample game for ${team.school}:`, sampleGame?.homeTeam, typeof sampleGame?.homeTeam);

        // DEBUG: Check all home games with any startDate in 2025
        const allGames = await Game.find({
          homeTeam: team._id,
          startDate: { $exists: true, $ne: null }
        });
        console.log(`${team.school} has ${allGames.length} total 2025 home games.`);

        allGames.forEach(g => {
          const dateStr = g.startDate ? g.startDate.toISOString() : '[NO START DATE]';
          console.log(` - ${dateStr} | venue: ${g.venue} | neutral: ${g.neutralSite}`);
        });

        // Optional: Preview a few earliest games
        const gameCheck = await Game.find({
          homeTeam: team._id,
          startDate: { $exists: true }
        }).sort({ startDate: 1 }).limit(3);

        console.log(`First few games for ${team.school}:`);
        gameCheck.forEach(g => {
          const dateStr = g.startDate ? g.startDate.toISOString() : '[NO START DATE]';
          console.log(` - ${dateStr} | neutralSite: ${g.neutralSite}`);
        });

        // Actual filtered home game count (excluding neutral site)
        const homeGamesCount = await Game.countDocuments({
          homeTeam: team._id,
          startDate: { $gte: start, $lte: end },
          $or: [
            { neutralSite: false },
            { neutralSite: { $exists: false } },
            { neutralSite: null }
          ]
        });

        if (homeGamesCount === 0) {
          console.warn(`No 2025 home games (excluding neutral) found for ${team.school}, skipping.`);
          continue;
        }

        const newBadge = new Badge({
          badgeID: badgeIDCounter++,
          badgeName: `2025 ${team.school} Homer`,
          leagueConstraints: team.leagueId,
          teamConstraints: team._id,
          conferenceConstraints: team.conferenceId,
          iconUrl: team.logos?.[0] || '',
          reqGames: homeGamesCount,
          homeTeamOnly: true,
          oneTeamEach: false,
          timeConstraints: null,
          description: `Attend every ${team.school} home game in 2025.`,
          pointValue: 3700,
          startDate: start,
          endDate: end
        });

        await newBadge.save();
        console.log(`✅ Created '2025 Homer' badge for ${team.school} with ${homeGamesCount} true home games.`);
      } catch (err) {
        console.error(`❌ Error processing team ID ${teamId}:`, err.message);
      }
    }
  }

  console.log('🎉 Badge population complete.');
  mongoose.connection.close();
}

populate2025HomerBadges();
