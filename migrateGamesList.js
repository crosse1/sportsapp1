const mongoose = require('mongoose');
const User = require('./models/users');
require('dotenv').config();

async function migrate(){
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sportsapp');
  const users = await User.find({ gamesList: { $exists: true, $not: { $size: 0 } } });
  for (const user of users) {
    const existing = new Set((user.gameEntries || []).map(e => String(e.game)));
    let changed = false;
    for (const g of user.gamesList) {
      const id = String(g);
      if (!existing.has(id)) {
        user.gameEntries.push({ game: g, checkedIn: true });
        changed = true;
      }
    }
    if (changed) {
      user.gamesList = [];
      await user.save();
      console.log(`Migrated user ${user._id}`);
    }
  }
  await mongoose.disconnect();
}

migrate().then(()=>{console.log('Migration complete');}).catch(err=>{console.error(err); process.exit(1);});
