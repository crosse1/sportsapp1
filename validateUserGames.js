const db = require('./db');
const User = require('./models/users');
const Game = require('./models/Game');
const PastGame = require('./models/PastGame');

/**
 * Fallback validator that ensures every gameId in each user's gameEntries
 * exists in either the `Game` or `PastGame` collections. Logs any missing ids
 * so they can be investigated separately.
 */
async function validate() {
  try {
    const users = await User.find({}).select('username gameEntries').lean();
    for (const u of users) {
      const ids = (u.gameEntries || []).map(e => Number(e.gameId)).filter(n => !isNaN(n));
      if (!ids.length) continue;

      const [live, past] = await Promise.all([
        Game.find({ gameId: { $in: ids } }).select('gameId').lean(),
        PastGame.find({ gameId: { $in: ids } }).select('gameId').lean()
      ]);
      const found = new Set([...live, ...past].map(g => String(g.gameId)));
      const missing = ids.filter(id => !found.has(String(id)));
      if (missing.length) {
        console.warn(`User ${u.username} has missing gameIds: ${missing.join(', ')}`);
      }
    }
  } catch (err) {
    console.error('validateUserGames error', err);
  } finally {
    db.close();
  }
}

db.once('open', validate);
