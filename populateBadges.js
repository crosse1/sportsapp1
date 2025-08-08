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
async function populateFairweatherBadges() {
  let badgeIDCounter = 595;
  const start = new Date('2025-08-20T00:00:00Z');
  const end = new Date('2025-12-02T23:59:59Z');

  for (const conferenceId in teamMap) {
    for (const teamId of teamMap[conferenceId]) {
      try {
        const team = await Team.findById(teamId);
        if (!team) {
          console.warn(`Team with ID ${teamId} not found.`);
          continue;
        }

        // Count games where the team is either home or away within the time window
        const gameCount = await Game.countDocuments({
          startDate: { $gte: start, $lte: end },
          $or: [
            { homeTeam: team._id },
            { awayTeam: team._id }
          ]
        });

        if (gameCount < 5) {
          console.log(`⏭️ Skipping ${team.school} — only ${gameCount} games found.`);
          continue;
        }

        const newBadge = new Badge({
          badgeID: badgeIDCounter++,
          badgeName: `2025 ${team.school} Fairweather`,
          leagueConstraints: team.leagueId,
          teamConstraints: team._id,
          conferenceConstraints: team.conferenceId,
          iconUrl: team.logos?.[0] || '',
          reqGames: 3,
          homeTeamOnly: false,
          oneTeamEach: false,
          timeConstraints: null,
          description: `Attend at least 3 of ${team.school}'s games in 2025.`,
          pointValue: 1300,
          startDate: start,
          endDate: end
        });

        await newBadge.save();
        console.log(`✅ Created 'Fairweather' badge for ${team.school} (${gameCount} games found)`);
      } catch (err) {
        console.error(`❌ Error processing team ID ${teamId}:`, err.message);
      }
    }
  }

  console.log('🎉 Fairweather badge population complete.');
  mongoose.connection.close();
}

populateFairweatherBadges();
