const PastGame = require('../models/PastGame');
const User = require('../models/users');
const Team = require('../models/Team');

// Helper to format ordinal numbers (1st, 2nd, 3rd, etc.)
function formatOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

exports.showMostCheckedIn = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const pastGames = await PastGame.find({
      StartDate: { $gte: startOfYesterday, $lt: startOfToday }
    }).lean();

    if (!pastGames.length) {
      return res.render('social', { pastgame: null, count: 0, homeLogo: '', awayLogo: '', homeColor: '#ffffff', awayColor: '#ffffff' });
    }

    const ids = pastGames.map(g => String(g.gameId));

    const checkins = await User.aggregate([
      { $unwind: '$gameEntries' },
      { $match: { 'gameEntries.checkedIn': true, 'gameEntries.gameId': { $in: ids } } },
      { $group: { _id: '$gameEntries.gameId', users: { $addToSet: '$_id' } } },
      { $project: { count: { $size: '$users' } } }
    ]);

    const countMap = {};
    checkins.forEach(c => { countMap[c._id] = c.count; });

    let selected = pastGames[0];
    let max = 0;
    pastGames.forEach(g => {
      const c = countMap[String(g.gameId)] || 0;
      if (c > max) {
        max = c;
        selected = g;
      }
    });

    const [homeTeam, awayTeam] = await Promise.all([
      Team.findOne({ teamId: selected.HomeId }).lean(),
      Team.findOne({ teamId: selected.AwayId }).lean()
    ]);

    const homeLogo = homeTeam && homeTeam.logos && homeTeam.logos[0] ? homeTeam.logos[0] : 'https://via.placeholder.com/60';
    const awayLogo = awayTeam && awayTeam.logos && awayTeam.logos[0] ? awayTeam.logos[0] : 'https://via.placeholder.com/60';
    const homeColor = homeTeam && homeTeam.color ? homeTeam.color : '#ffffff';
    const awayColor = awayTeam && awayTeam.color ? awayTeam.color : '#ffffff';

    // --- Build social timeline events ---
    const events = [];

    if (req.user) {
      // Aggregate total check-ins for all games once so we can
      // compute milestones and ranking information.
      const globalCheckins = await User.aggregate([
        { $unwind: '$gameEntries' },
        { $match: { 'gameEntries.checkedIn': true } },
        { $group: { _id: '$gameEntries.gameId', users: { $addToSet: '$_id' } } },
        { $project: { count: { $size: '$users' } } }
      ]);

      const countMapAll = {};
      globalCheckins.forEach(c => { countMapAll[c._id] = c.count; });

      // Preload past game documents for milestone calculations
      const allGameIds = globalCheckins.map(g => Number(g._id));
      const pastGameDocs = await PastGame.find({ gameId: { $in: allGameIds } }).lean();
      const pastGameMap = {};
      pastGameDocs.forEach(pg => { pastGameMap[String(pg.gameId)] = pg; });

      // Group counts by date for ranking
      const byDate = {};
      pastGameDocs.forEach(pg => {
        const key = pg.StartDate.toISOString().split('T')[0];
        byDate[key] = byDate[key] || [];
        const count = countMapAll[String(pg.gameId)] || 0;
        byDate[key].push({ gameId: String(pg.gameId), count });
      });
      Object.values(byDate).forEach(list => list.sort((a, b) => b.count - a.count));

      // Fetch followed users and their check-ins
      const me = await User.findById(req.user.id).select('following').lean();
      const followingIds = me?.following || [];
      const followedUsers = await User.find({ _id: { $in: followingIds } })
        .select('username gameEntries')
        .lean();

      for (const fu of followedUsers) {
        const entries = (fu.gameEntries || []).filter(e => e.checkedIn);
        for (const entry of entries) {
          const game = pastGameMap[String(entry.gameId)];
          if (!game) continue; // skip if we can't load game info

          const [hTeam, aTeam] = await Promise.all([
            Team.findOne({ teamId: game.HomeId }).lean(),
            Team.findOne({ teamId: game.AwayId }).lean()
          ]);

          const hLogo = hTeam && hTeam.logos && hTeam.logos[0] ? hTeam.logos[0] : 'https://via.placeholder.com/60';
          const aLogo = aTeam && aTeam.logos && aTeam.logos[0] ? aTeam.logos[0] : 'https://via.placeholder.com/60';
          const hColor = hTeam && hTeam.color ? hTeam.color : '#ffffff';
          const aColor = aTeam && aTeam.color ? aTeam.color : '#ffffff';

          const timestamp = game.StartDate;
          events.push({
            type: 'checkin',
            user: { _id: fu._id, username: fu.username },
            game,
            homeLogo: hLogo,
            awayLogo: aLogo,
            homeColor: hColor,
            awayColor: aColor,
            timestamp
          });

          const total = countMapAll[String(entry.gameId)] || 0;
          const fanMilestones = [1, 100, 1000, 10000, 100000];
          if (fanMilestones.includes(total)) {
            events.push({
              type: 'fanMilestone',
              user: { _id: fu._id, username: fu.username },
              game,
              homeLogo: hLogo,
              awayLogo: aLogo,
              homeColor: hColor,
              awayColor: aColor,
              milestone: total,
              ordinal: formatOrdinal(total),
              timestamp
            });
          }
        }
      }

      // Game milestone events (e.g. game surpasses 100, 500 fans, etc.)
      const gameMilestones = [100, 500, 1000, 5000, 10000, 50000];
      for (const gc of globalCheckins) {
        const count = gc.count;
        if (!gameMilestones.includes(count)) continue;
        const game = pastGameMap[String(gc._id)];
        if (!game) continue;
        const dateKey = game.StartDate.toISOString().split('T')[0];
        const list = byDate[dateKey] || [];
        const rank = list.findIndex(g => g.gameId === String(gc._id)) + 1;

        const [hTeam, aTeam] = await Promise.all([
          Team.findOne({ teamId: game.HomeId }).lean(),
          Team.findOne({ teamId: game.AwayId }).lean()
        ]);

        const hLogo = hTeam && hTeam.logos && hTeam.logos[0] ? hTeam.logos[0] : 'https://via.placeholder.com/60';
        const aLogo = aTeam && aTeam.logos && aTeam.logos[0] ? aTeam.logos[0] : 'https://via.placeholder.com/60';
        const hColor = hTeam && hTeam.color ? hTeam.color : '#ffffff';
        const aColor = aTeam && aTeam.color ? aTeam.color : '#ffffff';

        events.push({
          type: 'gameMilestone',
          game,
          homeLogo: hLogo,
          awayLogo: aLogo,
          homeColor: hColor,
          awayColor: aColor,
          milestone: count,
          rank,
          timestamp: game.StartDate
        });
      }
    }

    // Deduplicate events before rendering so each action only appears once.
    const seen = new Set();
    const uniqueEvents = [];
    for (const ev of events) {
      let key = ev.type || 'event';
      if (ev.type === 'checkin') {
        const userId = ev.user && ev.user._id ? String(ev.user._id) : 'unknown';
        const gameId = ev.game && (ev.game._id || ev.game.gameId) ? String(ev.game._id || ev.game.gameId) : 'unknown';
        key += `:${userId}:${gameId}`;
      } else if (ev.type === 'fanMilestone') {
        const userId = ev.user && ev.user._id ? String(ev.user._id) : 'unknown';
        const gameId = ev.game && (ev.game._id || ev.game.gameId) ? String(ev.game._id || ev.game.gameId) : 'unknown';
        key += `:${userId}:${gameId}:${ev.milestone}`;
      } else if (ev.type === 'gameMilestone') {
        const gameId = ev.game && (ev.game._id || ev.game.gameId) ? String(ev.game._id || ev.game.gameId) : 'unknown';
        key += `:${gameId}:${ev.milestone}`;
      } else {
        key += `:${JSON.stringify(ev)}`;
      }

      if (!seen.has(key)) {
        seen.add(key);
        uniqueEvents.push(ev);
      }
    }

    // Order events from most recent to oldest
    uniqueEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.render('social', {
      pastgame: selected,
      count: max,
      homeLogo,
      awayLogo,
      homeColor,
      awayColor,
      events: uniqueEvents
    });
  } catch (err) {
    next(err);
  }
};
