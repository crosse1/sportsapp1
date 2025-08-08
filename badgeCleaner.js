const mongoose = require('mongoose');
const Badge = require('./models/Badge');
const Game = require('./models/Game'); // Assuming you have a Game model

// --- MongoDB connection ---
const mongoURI = 'mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

async function removeBadgesWithNoHomeGames() {
  try {
    const badges = await Badge.find({ badgeID: { $gte: 1, $lte: 230 } });

    let deletedCount = 0;

    for (const badge of badges) {
      const teamId = badge.teamConstraints?.[0];
      if (!teamId) continue;

      const hasHomeGames = await Game.exists({ homeTeam: teamId });

      if (!hasHomeGames) {
        await Badge.deleteOne({ _id: badge._id });
        console.log(`🗑 Deleted badge ${badge.badgeID} (${badge.badgeName}) - Team ${teamId} never appears as home team`);
        deletedCount++;
      }
    }

    console.log(`\n✅ Cleanup complete. Total badges deleted: ${deletedCount}`);
  } catch (err) {
    console.error('❌ Error during cleanup:', err.message);
  } finally {
    mongoose.connection.close();
  }
}

removeBadgesWithNoHomeGames();
