const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// --- Adjust connection string to your DB ---
const mongoURI = 'mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

// --- Load models ---
const Team = require('./models/Team'); // Adjust path as needed
const Badge = require('./models/Badge'); // Ensure this exists or I can generate it

// --- Load the conferenceTeamMap ---
const teamMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'conferenceTeamMap.json'), 'utf-8'));

// --- Main Function ---
async function populateBadges() {
  let badgeIDCounter = 1;

  for (const conferenceId in teamMap) {
    for (const teamId of teamMap[conferenceId]) {
      try {
        const team = await Team.findById(teamId);

        if (!team) {
          console.warn(`Team with ID ${teamId} not found.`);
          continue;
        }

        const newBadge = new Badge({
          badgeID: badgeIDCounter++,
          badgeName: `New ${team.school} Fan`,
          leagueConstraints: team.leagueId,
          teamConstraints: team._id,
          conferenceConstraints: team.conferenceId,
          iconUrl: team.logos?.[0] || '',
          reqGames: 1,
          homeTeamOnly: true,
          oneTeamEach: true,
          timeConstraints: null,
          description: `Reward for attending your first ${team.school} game.`,
          pointValue: 500,
          startDate: null,
          endDate: null
        });

        await newBadge.save();
        console.log(`Created badge for ${team.school}`);
      } catch (err) {
        console.error(`Error processing team ID ${teamId}:`, err.message);
      }
    }
  }

  console.log('Badge population complete.');
  mongoose.connection.close();
}

populateBadges();
