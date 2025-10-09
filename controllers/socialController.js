const PastGame = require('../models/PastGame');
const Game = require('../models/Game');
const User = require('../models/users');
const Team = require('../models/Team');

const TEAM_LOGO_PLACEHOLDER = 'https://via.placeholder.com/60';
const FAN_CHECKIN_MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000, 100000];

// Helper to format ordinal numbers (1st, 2nd, 3rd, etc.)
function formatOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function resolveTeamDocument(teamLike, numericId, cache) {
  if (teamLike && typeof teamLike === 'object' && teamLike.logos) {
    const key = teamLike.teamId != null ? String(teamLike.teamId) : numericId != null ? String(numericId) : null;
    if (key && !cache.has(key)) cache.set(key, teamLike);
    return teamLike;
  }

  const normalizedId = numericId != null ? Number(numericId) : null;
  if (!Number.isFinite(normalizedId)) return null;
  const cacheKey = String(normalizedId);
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const doc = await Team.findOne({ teamId: normalizedId }).lean();
  cache.set(cacheKey, doc || null);
  return doc || null;
}

async function buildGameVisuals(game, cache) {
  const homeId = game.HomeId != null ? Number(game.HomeId) : game.homeTeam && game.homeTeam.teamId != null ? Number(game.homeTeam.teamId) : null;
  const awayId = game.AwayId != null ? Number(game.AwayId) : game.awayTeam && game.awayTeam.teamId != null ? Number(game.awayTeam.teamId) : null;

  const [homeTeamDoc, awayTeamDoc] = await Promise.all([
    resolveTeamDocument(game.homeTeam, homeId, cache),
    resolveTeamDocument(game.awayTeam, awayId, cache)
  ]);

  return {
    homeLogo: homeTeamDoc && Array.isArray(homeTeamDoc.logos) && homeTeamDoc.logos[0] ? homeTeamDoc.logos[0] : TEAM_LOGO_PLACEHOLDER,
    awayLogo: awayTeamDoc && Array.isArray(awayTeamDoc.logos) && awayTeamDoc.logos[0] ? awayTeamDoc.logos[0] : TEAM_LOGO_PLACEHOLDER,
    homeColor: homeTeamDoc && homeTeamDoc.color ? homeTeamDoc.color : '#ffffff',
    awayColor: awayTeamDoc && awayTeamDoc.color ? awayTeamDoc.color : '#ffffff'
  };
}

function normalizeGameForView(gameDoc) {
  if (!gameDoc) return null;
  const normalized = { ...gameDoc };

  if (gameDoc.startDate && !normalized.StartDate) {
    normalized.StartDate = gameDoc.startDate;
  }

  if (normalized.StartDate && !(normalized.StartDate instanceof Date)) {
    normalized.StartDate = new Date(normalized.StartDate);
  }

  if (gameDoc.homeTeam && gameDoc.homeTeam.teamId != null && normalized.HomeId == null) {
    normalized.HomeId = gameDoc.homeTeam.teamId;
  }
  if (gameDoc.awayTeam && gameDoc.awayTeam.teamId != null && normalized.AwayId == null) {
    normalized.AwayId = gameDoc.awayTeam.teamId;
  }

  if (!normalized.HomeTeam) {
    normalized.HomeTeam = gameDoc.homeTeamName
      || (gameDoc.homeTeam && (gameDoc.homeTeam.school || gameDoc.homeTeam.mascot || gameDoc.homeTeam.name))
      || '';
  }

  if (!normalized.AwayTeam) {
    normalized.AwayTeam = gameDoc.awayTeamName
      || (gameDoc.awayTeam && (gameDoc.awayTeam.school || gameDoc.awayTeam.mascot || gameDoc.awayTeam.name))
      || '';
  }

  return normalized;
}

function describeMatchup(game) {
  if (!game) return '';
  const away = game.AwayTeam || 'Away';
  const home = game.HomeTeam || 'Home';
  return `${away} vs ${home}`;
}

exports.showMostCheckedIn = async (req, res, next) => {
  try {
    const pastGames = await PastGame.find({})
      .sort({ StartDate: -1 })
      .lean();

    if (!pastGames.length) {
      return res.render('social', {
        pastgame: null,
        count: 0,
        homeLogo: '',
        awayLogo: '',
        homeColor: '#ffffff',
        awayColor: '#ffffff',
        events: []
      });
    }

    const pastGameMap = {};
    pastGames.forEach(pg => { pastGameMap[String(pg.gameId)] = pg; });

    const globalCheckins = await User.aggregate([
      { $unwind: '$gameEntries' },
      { $match: { 'gameEntries.checkedIn': true } },
      { $group: { _id: '$gameEntries.gameId', users: { $addToSet: '$_id' } } },
      { $project: { count: { $size: '$users' } } }
    ]);

    const countMapAll = {};
    globalCheckins.forEach(c => { countMapAll[String(c._id)] = c.count; });

    let selected = pastGames[0];
    let max = countMapAll[String(selected.gameId)] || 0;
    pastGames.forEach(g => {
      const c = countMapAll[String(g.gameId)] || 0;
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
    const teamCache = new Map();
    const events = [];

    const checkinDetails = await User.aggregate([
      { $unwind: '$gameEntries' },
      { $match: { 'gameEntries.checkedIn': true } },
      {
        $project: {
          userId: '$_id',
          username: '$username',
          gameId: '$gameEntries.gameId',
          entryId: '$gameEntries._id',
          checkinTimestamp: {
            $ifNull: [
              '$gameEntries.checkedInAt',
              { $toDate: '$gameEntries._id' }
            ]
          }
        }
      },
      { $match: { gameId: { $ne: null } } },
      { $sort: { gameId: 1, checkinTimestamp: 1, entryId: 1 } }
    ]);

    const checkinsByGame = new Map();
    const checkinLookup = new Map();

    for (const detail of checkinDetails) {
      const gameIdStr = detail.gameId != null ? String(detail.gameId) : null;
      if (!gameIdStr) continue;
      const timestamp = detail.checkinTimestamp instanceof Date
        ? detail.checkinTimestamp
        : new Date(detail.checkinTimestamp);
      const entryIdStr = detail.entryId ? String(detail.entryId) : `${detail.userId}:${gameIdStr}`;

      const existing = checkinsByGame.get(gameIdStr) || [];
      existing.push({
        userId: detail.userId,
        username: detail.username,
        timestamp,
        entryId: entryIdStr
      });
      checkinsByGame.set(gameIdStr, existing);
    }

    for (const [gameIdStr, entries] of checkinsByGame.entries()) {
      entries.sort((a, b) => {
        const timeDiff = a.timestamp - b.timestamp;
        if (timeDiff !== 0) return timeDiff;
        return a.entryId.localeCompare(b.entryId);
      });

      const game = pastGameMap[gameIdStr];
      if (!game) continue;
      const normalizedGame = normalizeGameForView(game);
      const visuals = await buildGameVisuals(normalizedGame, teamCache);
      const description = describeMatchup(normalizedGame);
      const gameLink = normalizedGame._id ? `/pastGames/${normalizedGame._id}` : '#';

      entries.forEach((entry, index) => {
        const ordinalValue = index + 1;
        const lookupKey = `${String(entry.userId)}:${gameIdStr}`;
        checkinLookup.set(lookupKey, {
          timestamp: entry.timestamp,
          ordinal: ordinalValue
        });
      });

      for (const milestone of FAN_CHECKIN_MILESTONES) {
        if (milestone > entries.length) break;
        const milestoneEntry = entries[milestone - 1];
        events.push({
          type: 'fanMilestone',
          user: {
            _id: milestoneEntry.userId,
            username: milestoneEntry.username || 'Unknown Fan'
          },
          game: normalizedGame,
          homeLogo: visuals.homeLogo,
          awayLogo: visuals.awayLogo,
          homeColor: visuals.homeColor,
          awayColor: visuals.awayColor,
          milestone,
          ordinal: formatOrdinal(milestone),
          timestamp: milestoneEntry.timestamp,
          gameLink,
          gameDescription: description
        });
      }
    }

    if (req.user) {
      // Group counts by date for ranking
      const relevantPastGames = globalCheckins
        .map(gc => pastGameMap[String(gc._id)])
        .filter(Boolean);

      const byDate = {};
      relevantPastGames.forEach(pg => {
        const key = pg.StartDate.toISOString().split('T')[0];
        byDate[key] = byDate[key] || [];
        const count = countMapAll[String(pg.gameId)] || 0;
        byDate[key].push({ gameId: String(pg.gameId), count });
      });
      Object.values(byDate).forEach(list => list.sort((a, b) => b.count - a.count));

      // Fetch followed users and their check-ins / waitlists
      const me = await User.findById(req.user.id).select('following').lean();
      const followingIds = me?.following || [];
      const followedUsers = await User.find({ _id: { $in: followingIds } })
        .select('username gameEntries wishlist')
        .lean();

      const waitlistIds = new Set();
      followedUsers.forEach(fu => {
        (fu.wishlist || []).forEach(id => {
          if (id) waitlistIds.add(String(id));
        });
      });

      let waitlistGameMap = new Map();
      if (waitlistIds.size) {
        const wishlistGames = await Game.find({ _id: { $in: Array.from(waitlistIds) } })
          .populate('homeTeam')
          .populate('awayTeam')
          .lean();
        waitlistGameMap = new Map(wishlistGames.map(g => [String(g._id), g]));
      }

      for (const fu of followedUsers) {
        const entries = (fu.gameEntries || []).filter(e => e.checkedIn);
        for (const entry of entries) {
          const gameIdStr = entry.gameId != null ? String(entry.gameId) : null;
          if (!gameIdStr) continue;
          const game = pastGameMap[gameIdStr];
          if (!game) continue; // skip if we can't load game info

          const normalizedGame = normalizeGameForView(game);
          const visuals = await buildGameVisuals(normalizedGame, teamCache);
          const lookupKey = `${String(fu._id)}:${gameIdStr}`;
          const lookupMeta = checkinLookup.get(lookupKey);
          const timestamp = lookupMeta && lookupMeta.timestamp ? lookupMeta.timestamp : normalizedGame.StartDate;

          events.push({
            type: 'checkin',
            user: { _id: fu._id, username: fu.username },
            game: normalizedGame,
            homeLogo: visuals.homeLogo,
            awayLogo: visuals.awayLogo,
            homeColor: visuals.homeColor,
            awayColor: visuals.awayColor,
            timestamp,
            gameLink: normalizedGame._id ? `/pastGames/${normalizedGame._id}` : '#',
            gameDescription: describeMatchup(normalizedGame)
          });
        }

        const wishlistEntries = fu.wishlist || [];
        for (const rawId of wishlistEntries) {
          const idStr = rawId ? String(rawId) : null;
          if (!idStr) continue;
          const wishlistGame = waitlistGameMap.get(idStr);
          if (!wishlistGame) continue;

          const normalizedGame = normalizeGameForView(wishlistGame);
          const visuals = await buildGameVisuals(normalizedGame, teamCache);
          const timestamp = normalizedGame.StartDate instanceof Date ? normalizedGame.StartDate : new Date(normalizedGame.StartDate || Date.now());

          events.push({
            type: 'waitlist',
            user: { _id: fu._id, username: fu.username },
            game: normalizedGame,
            homeLogo: visuals.homeLogo,
            awayLogo: visuals.awayLogo,
            homeColor: visuals.homeColor,
            awayColor: visuals.awayColor,
            timestamp,
            gameLink: normalizedGame._id ? `/games/${normalizedGame._id}` : '#',
            gameDescription: describeMatchup(normalizedGame)
          });
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

        const normalizedGame = normalizeGameForView(game);
        const visuals = await buildGameVisuals(normalizedGame, teamCache);

        events.push({
          type: 'gameMilestone',
          game: normalizedGame,
          homeLogo: visuals.homeLogo,
          awayLogo: visuals.awayLogo,
          homeColor: visuals.homeColor,
          awayColor: visuals.awayColor,
          milestone: count,
          rank,
          timestamp: normalizedGame.StartDate,
          gameLink: normalizedGame._id ? `/pastGames/${normalizedGame._id}` : '#',
          gameDescription: describeMatchup(normalizedGame)
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
      } else if (ev.type === 'waitlist') {
        const userId = ev.user && ev.user._id ? String(ev.user._id) : 'unknown';
        const gameId = ev.game && (ev.game._id || ev.game.gameId) ? String(ev.game._id || ev.game.gameId) : 'unknown';
        key += `:${userId}:${gameId}`;
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
