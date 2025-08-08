const mongoose = require('mongoose');
const Badge = require('./models/Badge');

// --- MongoDB connection ---
const mongoURI = 'mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

async function cleanAndAdjustSuperfanBadges() {
  try {
    const allBadges = await Badge.find({ badgeID: { $gte: 365 } });

    let removedCount = 0;
    let updatedCount = 0;

    for (const badge of allBadges) {
      if (badge.reqGames < 3) {
        await Badge.deleteOne({ _id: badge._id });
        removedCount++;
        console.log(`🗑 Deleted badge ${badge.badgeID} (${badge.badgeName}) with reqGames = ${badge.reqGames}`);
      } else {
        badge.pointValue = 8200;
        await badge.save();
        updatedCount++;
        console.log(`✅ Updated badge ${badge.badgeID} to pointValue = 8200`);
      }
    }

    console.log(`\n🎯 Cleanup complete. Removed: ${removedCount}, Updated: ${updatedCount}`);
  } catch (err) {
    console.error('❌ Error during badge cleanup:', err.message);
  } finally {
    mongoose.connection.close();
  }
}

cleanAndAdjustSuperfanBadges();
