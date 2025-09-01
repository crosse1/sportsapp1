const Game = require('../models/Game');
const Team = require('../models/Team');
const Venue = require('../models/Venue');
const PastGame = require('../models/PastGame');
const User = require('../models/users');
const mongoose = require('mongoose');
const Badge = require('../models/Badge');
const { computeBadgeProgress, formatBadgeForClient } = require('../lib/badgeUtils');
const { fetchGamesByIds } = require('../lib/gameUtils');

function hexToRgb(hex) {
  if (!hex) return null;
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function colorDistance(c1, c2) {
  if (!c1 || !c2) return Number.MAX_VALUE;
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

function haversine(lat1, lon1, lat2, lon2){
  const R = 6371; // km
  const toRad = d => d * Math.PI/180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

exports.listGames = async (req, res, next) => {
  try {
    const { team, teamId, date, lat, lng } = req.query;
    const query = {};
    if (teamId) {
      query.$or = [
        { homeTeam: teamId },
        { awayTeam: teamId }
      ];
    } else if (team) {
      query.$or = [
        { homeTeamName: { $regex: team, $options: 'i' } },
        { awayTeamName: { $regex: team, $options: 'i' } }
      ];
    }
    if (date) {
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      endOfDay.setDate(endOfDay.getDate() + 1);
      query.startDate = { $gte: startOfDay, $lt: endOfDay };
    }

    let games = await Game.find(query)
      .populate('homeTeam')
      .populate('awayTeam')
      .sort({ startDate: 1 });

    const venueIds = [...new Set(games.map(g => g.venueId).filter(v => v !== undefined))];
    const venues = await Venue.find({ venueId: { $in: venueIds } });
    const venueMap = {};
    venues.forEach(v => { venueMap[v.venueId] = v; });

    let userWishlist = new Set();
    let followed = [];
    if(req.user){
      const User = require('../models/users');
      const viewer = await User.findById(req.user.id)
      .populate({path:'following', select:'username profileImage wishlist'});
      userWishlist = new Set((viewer.wishlist || []).map(g=>String(g)));
      followed = viewer.following || [];
    }

    const userCoords = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;

    if(userCoords){
      games = games.map(g => {
        const venue = venueMap[g.venueId];
        const coords = venue && venue.coordinates && Array.isArray(venue.coordinates.coordinates)
          ? venue.coordinates.coordinates
          : null;
        if(coords && coords.length === 2){
          const [lngVal, latVal] = coords;
          g.distance = haversine(userCoords.lat, userCoords.lng, latVal, lngVal);
        } else {
          g.distance = Infinity;
        }
        return g;
      });

      games.sort((a,b)=>{
        const dateA = new Date(a.startDate);
        const dateB = new Date(b.startDate);
        const dayA = dateA.toDateString();
        const dayB = dateB.toDateString();

        if(dayA === dayB){
          if(a.distance === b.distance) return dateA - dateB;
          return a.distance - b.distance;
        }

        return dateA - dateB;
      });
    }

    games = games.map(g => {
      const idStr = String(g._id);
      g.isWishlisted = userWishlist.has(idStr);
      g.followedWishers = followed.filter(u => (u.wishlist || []).some(w => String(w) === idStr));
      return g;
    });

    res.render('games', {
      games,
      isPastGame: false, 
      filters: { team, teamId, date, lat, lng }
    });
  } catch (err) {
    next(err);
  }
};

exports.searchTeams = async (req, res, next) => {
  try {
    const q = req.query.q || '';
    if (!q) return res.json([]);
    const homeIds = await Game.distinct('homeTeam');
    const awayIds = await Game.distinct('awayTeam');
    const activeIds = [...new Set([...homeIds, ...awayIds])];
    const teams = await Team.find({
        _id: { $in: activeIds },
        school: { $regex: q, $options: 'i' }
      })
      .select('school logos _id')
      .limit(5);
    res.json(teams);
  } catch (err) {
    next(err);
  }
};

exports.searchGames = async (req, res, next) => {
  try {
    const q = req.query.q || '';
    const season = parseInt(req.query.season);
    const query = {};
    if(q){
      query.$or = [
        { homeTeamName: { $regex: q, $options: 'i' } },
        { awayTeamName: { $regex: q, $options: 'i' } }
      ];
    }
    if(!isNaN(season)) query.season = season;
    const games = await Game.find(query)
      .sort({ startDate: -1 })
      .limit(10)
      .select('awayTeamName homeTeamName season');
    res.json(games);
  } catch(err){
    next(err);
  }
};

exports.showGame = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).render('error', { message: 'Invalid game id' });
    }
    const game = await Game.findById(id)
      .populate('homeTeam')
      .populate('awayTeam');
    if (!game) return res.status(404).render('error', { message: 'Game not found' });
    const venue = await Venue.findOne({ venueId: game.venueId });
    let homeBgColor = game.homeTeam && game.homeTeam.alternateColor ? game.homeTeam.alternateColor : '#ffffff';
    const awayBgColor = game.awayTeam && game.awayTeam.alternateColor ? game.awayTeam.alternateColor : '#ffffff';

    if (game.homeTeam && game.awayTeam && game.homeTeam.alternateColor && game.awayTeam.alternateColor) {
      const diff = colorDistance(hexToRgb(game.homeTeam.alternateColor), hexToRgb(game.awayTeam.alternateColor));
      if (diff < 60 && game.homeTeam.color) {
        homeBgColor = game.homeTeam.color;
      }
    }

    let followerWishers = [];
    if(req.user){
      const User = require('../models/users');
      const viewer = await User.findById(req.user.id)
      .populate({path:'followers', select:'username profileImage wishlist'});
      followerWishers = (viewer.followers || []).filter(u => (u.wishlist || []).some(w => String(w) === String(game._id)));
    }

    res.render('game', { game, homeBgColor, awayBgColor, followerWishers, venue });
  } catch (err) {
    next(err);
  }
};

// --- Utility (local) ---
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// =======================
//  nearbyGameCheckin
// =======================
exports.nearbyGameCheckin = async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // Accept lat/lng OR latitude/longitude
    const { lat, lng, latitude, longitude } = req.body || {};
    const userLat = parseFloat(lat ?? latitude);
    const userLng = parseFloat(lng ?? longitude);
    if (Number.isNaN(userLat) || Number.isNaN(userLng)) {
      console.warn('[checkin] Invalid coordinates:', req.body);
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Time window (configurable via env)
    const BEFORE_HOURS = Number(process.env.CHECKIN_WINDOW_BEFORE_HOURS ?? 6);
    const AFTER_HOURS  = Number(process.env.CHECKIN_WINDOW_AFTER_HOURS  ?? 8);
    const now = new Date();
    const startMin = new Date(now.getTime() - BEFORE_HOURS * 3600 * 1000);
    const startMax = new Date(now.getTime() + AFTER_HOURS  * 3600 * 1000);

    // Get time-eligible candidates
    let games = await Game.find({
      completed: { $ne: true },
      startDate: { $gte: startMin, $lte: startMax }
    })
    .populate('homeTeam')
    .populate('awayTeam')
    .lean();

    console.log('[checkin] time window', { startMin, startMax, candidates: games.length });
    if (!games.length) return res.json({ game: null });

    // Load venues for the candidate games (keyed by venueId)
    const venueIds = [...new Set(games.map(g => g.venueId).filter(v => v !== undefined))];
    const venues = await Venue.find(
      { venueId: { $in: venueIds } },
      { venueId: 1, name: 1, coordinates: 1 }
    ).lean();
    const venueMap = new Map(venues.map(v => [v.venueId, v]));

    // Already checked-in games for this user
    const user = await User.findById(req.user.id).select('gameEntries').lean();
    const already = new Set((user?.gameEntries || [])
      .filter(e => e.checkedIn)
      .map(e => String(e.game)));

    // Compute distances; keep everything for logging
    const withDistances = [];
    for (const g of games) {
      const v = venueMap.get(g.venueId);
      if (!v?.coordinates?.type || !Array.isArray(v.coordinates.coordinates)) {
        console.log('[checkin] skip (no coords) gameId', g.gameId, 'venueId', g.venueId);
        continue;
      }
      const [vLng, vLat] = v.coordinates.coordinates; // GeoJSON = [lng, lat]
      const dist = haversineMeters(userLat, userLng, vLat, vLng);
      withDistances.push({
        game: g,
        venue: { id: v.venueId, name: v.name },
        distMeters: dist,
        startDate: g.startDate,
        checked: already.has(String(g._id))
      });
    }

    if (!withDistances.length) {
      console.log('[checkin] no candidates with valid venue coords');
      return res.json({ game: null });
    }

    // Sort by distance ASC, then by |startDate - now| ASC
    withDistances.sort((a, b) => {
      if (a.distMeters !== b.distMeters) return a.distMeters - b.distMeters;
      return Math.abs(new Date(a.startDate) - now) - Math.abs(new Date(b.startDate) - now);
    });

    // Distance threshold (meters). Default ~1000m
    const NEAR_THRESHOLD_M = Number(process.env.CHECKIN_NEAR_THRESHOLD_M ?? 1000);

    // Pick nearest, un-checked game within threshold
    const pick = withDistances.find(x => !x.checked && x.distMeters <= NEAR_THRESHOLD_M);

    if (!pick) {
      const nearest = withDistances[0];
      console.log(
        '[checkin] no un-checked game within threshold.',
        'nearestDist(m)=', Math.round(nearest.distMeters),
        'nearestGameId=', nearest.game.gameId,
        'nearestVenue=', nearest.venue
      );
      return res.json({ game: null });
    }

    console.log('[checkin] returning game', {
      gameId: pick.game.gameId,
      mongoId: pick.game._id,
      venue: pick.venue,
      distMeters: Math.round(pick.distMeters)
    });

    // Minimal shape the frontend expects + a bit of helpful meta
    const resp = {
      _id: pick.game._id,
      startDate: pick.game.startDate,
      homeTeamName: pick.game.homeTeamName,
      awayTeamName: pick.game.awayTeamName,
      homeTeam: pick.game.homeTeam
        ? { logos: pick.game.homeTeam.logos, school: pick.game.homeTeam.school }
        : null,
      awayTeam: pick.game.awayTeam
        ? { logos: pick.game.awayTeam.logos, school: pick.game.awayTeam.school }
        : null,
      distanceMeters: pick.distMeters,
      venue: pick.venue
    };

    return res.json({ game: resp });
  } catch (err) {
    console.error('[checkin] nearbyGameCheckin error', err);
    next(err);
  }
};

// =======================
//  apiCheckIn
// =======================
exports.apiCheckIn = async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const rawGameId = (req.body || {}).gameId;
    if (!rawGameId && rawGameId !== 0) return res.status(400).json({ error: 'Game ID required' });

    // Accept either Mongo _id or numeric gameId
    let gameDoc = null;
    if (mongoose.isValidObjectId(String(rawGameId))) {
      gameDoc = await Game.findById(rawGameId).populate('homeTeam awayTeam');
    }
    if (!gameDoc && !Number.isNaN(Number(rawGameId))) {
      gameDoc = await Game.findOne({ gameId: Number(rawGameId) }).populate('homeTeam awayTeam');
    }
    if (!gameDoc) return res.status(404).json({ error: 'Game not found' });

    const user = await User.findById(req.user.id)
      .populate({ path: 'gameEntries.game', populate: [{ path: 'homeTeam' }, { path: 'awayTeam' }] });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.badges = user.badges || [];
    user.gamesList = user.gamesList || [];

    const gameMongoId = String(gameDoc._id);
    const gameIdStr = String(gameDoc.gameId);

    const alreadyEntry = user.gameEntries.find(e => String(e.game?._id || e.game) === gameMongoId && e.checkedIn);
    const alreadyInGames = user.gamesList.includes(gameIdStr);

    // Track games/venues/teams for profile and badge progress
    const beforeIds = [...user.gamesList];
    if (!alreadyInGames) user.gamesList.push(gameIdStr);

    if (gameDoc.venueId != null) {

      const venueDoc = await Venue.findOne({ venueId: gameDoc.venueId }).select('_id');
      if (venueDoc) {
        const venueExists = user.venuesList.some(v => String(v) === String(venueDoc._id));
        if (!venueExists) user.venuesList.push(venueDoc._id);
      }

    }
    const homeId = gameDoc.homeTeam?._id;
    const awayId = gameDoc.awayTeam?._id;
    if (homeId && !user.teamsList.some(t => String(t) === String(homeId))) user.teamsList.push(homeId);
    if (awayId && !user.teamsList.some(t => String(t) === String(awayId))) user.teamsList.push(awayId);

    if (!alreadyEntry) {
      user.gameEntries.push({ game: gameDoc._id, checkedIn: true });
      user.points = (user.points || 0) + 225;
    }

    const beforeGames = await fetchGamesByIds(beforeIds);
    const afterGames = alreadyInGames ? beforeGames : [...beforeGames, gameDoc];

    // Load badges (lean), convert buffer icons, attach style + progress
    const badges = await Badge.find().lean();

    const completedBadges = [];
    const progressedBadges = [];

    for (const badge of badges) {
      const progressBefore = computeBadgeProgress(badge, beforeGames);
      const progressAfter  = computeBadgeProgress(badge, afterGames);

      if (progressAfter > progressBefore) {
        const payload = formatBadgeForClient(badge, { progress: progressAfter });
        if (progressAfter >= (badge.reqGames || 0) && progressBefore < (badge.reqGames || 0)) {
          const alreadyEarned = user.badges.some(id => String(id) === String(badge._id));
          if (!alreadyEarned) {
            user.points += badge.pointValue || 0;
            user.badges.push(badge._id);
          }
          completedBadges.push(payload);
        } else {
          progressedBadges.push(payload);
        }
      }
    }

    await user.save();

    res.json({ success: true, alreadyCheckedIn: Boolean(alreadyEntry), newPoints: user.points, completedBadges, progressedBadges });
  } catch (err) {
    console.error('[checkin] apiCheckIn error', err);
    next(err);
  }
};

// =======================
//  checkIn (non-API redirect)
// =======================
exports.checkIn = async (req, res, next) => {
  try {
    if (!req.user) return res.redirect('/login');

    const rawId = req.params.id;
    let gameDoc = null;

    if (mongoose.isValidObjectId(String(rawId))) {
      gameDoc = await Game.findById(rawId).populate('homeTeam awayTeam');
    }
    if (!gameDoc && !Number.isNaN(Number(rawId))) {
      gameDoc = await Game.findOne({ gameId: Number(rawId) }).populate('homeTeam awayTeam');
    }
    if (!gameDoc) return res.redirect('/games'); // or 404 if you prefer

    const user = await User.findById(req.user.id)
      .populate({ path: 'gameEntries.game', populate: [{ path: 'homeTeam' }, { path: 'awayTeam' }] });
    const hasEntry = user && user.gameEntries.some(e => String(e.game?._id || e.game) === String(gameDoc._id) && e.checkedIn);

    if (user) {
      user.gamesList = user.gamesList || [];
      const gameIdStr = String(gameDoc.gameId);
      const alreadyInGames = user.gamesList.includes(gameIdStr);
      const beforeIds = [...user.gamesList];
      if (!alreadyInGames) user.gamesList.push(gameIdStr);


      if (gameDoc.venueId != null) {
        const venueDoc = await Venue.findOne({ venueId: gameDoc.venueId }).select('_id');
        if (venueDoc) {
          const venueExists = user.venuesList.some(v => String(v) === String(venueDoc._id));
          if (!venueExists) user.venuesList.push(venueDoc._id);
        }
      }
      const homeId = gameDoc.homeTeam?._id;
      const awayId = gameDoc.awayTeam?._id;
      if (homeId && !user.teamsList.some(t => String(t) === String(homeId))) user.teamsList.push(homeId);
      if (awayId && !user.teamsList.some(t => String(t) === String(awayId))) user.teamsList.push(awayId);

      if (!hasEntry) {
        user.gameEntries.push({ game: gameDoc._id, checkedIn: true });
        user.points = (user.points || 0) + 225;
      }

      const beforeGames = await fetchGamesByIds(beforeIds);
      const afterGames = alreadyInGames ? beforeGames : [...beforeGames, gameDoc];


      user.badges = user.badges || [];
      const badges = await Badge.find().lean();
      for (const badge of badges) {
        const progressBefore = computeBadgeProgress(badge, beforeGames);
        const progressAfter = computeBadgeProgress(badge, afterGames);
        if (progressAfter > progressBefore && progressAfter >= (badge.reqGames || 0) && progressBefore < (badge.reqGames || 0)) {
          const alreadyEarned = user.badges.some(id => String(id) === String(badge._id));
          if (!alreadyEarned) {
            user.points += badge.pointValue || 0;
            user.badges.push(badge._id);
          }
        }
      }
      await user.save();
    }

    res.redirect(`/games/${gameDoc._id}`);
  } catch (err) {
    console.error('[checkin] checkIn error', err);
    next(err);
  }
};



exports.toggleWishlist = async (req, res, next) => {
  try {
    const User = require('../models/users');
    const user = await User.findById(req.user.id);
    const gameId = req.params.id;
    const idx = user.wishlist.findIndex(g => String(g) === gameId);
    let action;
    if(idx >= 0){
      user.wishlist.splice(idx,1);
      action = 'removed';
    } else {
      user.wishlist.push(gameId);
      action = 'added';
    }
    await user.save();
    res.json({success:true, action});
  } catch(err){
    next(err);
  }
};

exports.toggleGameList = async (req, res, next) => {
  try {
    const User = require('../models/users');
    const user = await User.findById(req.user.id);
    const gameId = req.params.id;
    const entry = user.gameEntries.find(e => String(e.game) === gameId);
    let action;
    if (entry) {
      entry.checkedIn = !entry.checkedIn;
      action = entry.checkedIn ? 'added' : 'removed';
    } else {
      user.gameEntries.push({ game: gameId, checkedIn: true });
      action = 'added';
    }
    await user.save();
    res.json({success:true, action});
  } catch(err){
    next(err);
  }
};

exports.toggleTeamList = async (req, res, next) => {
  try {
    const User = require('../models/users');
    const user = await User.findById(req.user.id);
    const teamId = req.params.id;
    const idx = user.teamsList.findIndex(t => String(t) === teamId);
    let action;
    if(idx >= 0){
      user.teamsList.splice(idx,1);
      action = 'removed';
    } else {
      user.teamsList.push(teamId);
      action = 'added';
    }
    await user.save();
    res.json({success:true, action});
  } catch(err){
    next(err);
  }
};

exports.toggleVenueList = async (req, res, next) => {
  try {
    const User = require('../models/users');
    const user = await User.findById(req.user.id);
    const venueId = req.params.id;
    const idx = user.venuesList.findIndex(v => String(v) === venueId);
    let action;
    if(idx >= 0){
      user.venuesList.splice(idx,1);
      action = 'removed';
    } else {
      user.venuesList.push(venueId);
      action = 'added';
    }
    await user.save();
    res.json({success:true, action});
  } catch(err){
    next(err);
  }
};

exports.listPastGameLeagues = async (req, res, next) => {
  try {
    const homeIds = await PastGame.distinct('homeLeagueId');
    const awayIds = await PastGame.distinct('awayLeagueId');
    const ids = [...new Set([...homeIds, ...awayIds])].filter(id => id !== undefined && id !== null);
    const League = require('../models/League');
    const leagues = await League.find({ leagueId: { $in: ids.map(String) } })
      .select('leagueId leagueName')
      .lean();
    const map = {};
    leagues.forEach(l => { map[parseInt(l.leagueId)] = l.leagueName; });
    const results = ids.map(id => ({ leagueId: id, leagueName: map[id] || String(id) }))
      .sort((a,b)=> a.leagueName.localeCompare(b.leagueName));
    res.json(results);
  } catch(err){
    next(err);
  }
};

exports.listPastGameSeasons = async (req, res, next) => {
  try {
    const leagueId = parseInt(req.query.leagueId);
    const match = {};
    if(!isNaN(leagueId)) {
      match.$or = [{ homeLeagueId: leagueId }, { awayLeagueId: leagueId }];
    }
    let seasons = await PastGame.distinct('Season', match);
    seasons = seasons.filter(s => !!s).sort((a,b) => b - a);
    res.json(seasons);
  } catch(err){
    next(err);
  }
};

exports.listPastGameTeams = async (req, res, next) => {
  try {
    const season = parseInt(req.query.season);
    const leagueId = parseInt(req.query.leagueId);
    const search = req.query.q || '';
    if(isNaN(season)) return res.json([]);
    const match = { Season: season };
    if(!isNaN(leagueId)) {
      match.$or = [{ homeLeagueId: leagueId }, { awayLeagueId: leagueId }];
    }
    const homeIds = await PastGame.distinct('HomeId', match);
    const awayIds = await PastGame.distinct('AwayId', match);
    const ids = [...new Set([...homeIds, ...awayIds])].filter(Boolean);
    const teamQuery = { teamId: { $in: ids } };
    if(!isNaN(leagueId)) {
      teamQuery.leagueId = String(leagueId);
    }
    if(search) teamQuery.school = { $regex: search, $options:'i' };
    const teams = await Team.find(teamQuery)
      .select('teamId school logos')
      .sort({ school: 1 })
      .lean();
    res.json(teams);
  } catch(err){
    next(err);
  }
};

exports.searchPastGames = async (req, res, next) => {
  try {
    const season = parseInt(req.query.season);
    const teamId = parseInt(req.query.teamId);
    const leagueId = parseInt(req.query.leagueId);
    const q = req.query.q || '';
    if(isNaN(season)) return res.json([]);
    const match = { Season: season };
    if(!isNaN(teamId)){
      match.$or = [{ HomeId: teamId }, { AwayId: teamId }];
    } else {
      if(!isNaN(leagueId)){
        match.homeLeagueId = leagueId;
        match.awayLeagueId = leagueId;
      }
      if(q){
        match.$or = [
          { HomeTeam: { $regex: q, $options: 'i' } },
          { AwayTeam: { $regex: q, $options: 'i' } }
        ];
      }
    }
    const games = await PastGame.find(match)
      .sort({ StartDate: 1 })
      .lean();
    const teamIds = [...new Set(games.flatMap(g => [g.HomeId, g.AwayId]))];
    const teams = await Team.find({ teamId: { $in: teamIds } })
      .select('teamId logos')
      .lean();
    const teamMap = {};
    teams.forEach(t => { teamMap[t.teamId] = t; });
    const results = games.map(g => ({
      id: g._id,
      homeTeamName: g.HomeTeam,
      awayTeamName: g.AwayTeam,
      homeLogo: teamMap[g.HomeId] && teamMap[g.HomeId].logos && teamMap[g.HomeId].logos[0],
      awayLogo: teamMap[g.AwayId] && teamMap[g.AwayId].logos && teamMap[g.AwayId].logos[0],
      score: `${g.HomePoints ?? ''}-${g.AwayPoints ?? ''}`,
      homePoints: g.HomePoints,
      awayPoints: g.AwayPoints,
      gameDate: g.StartDate
    }));
    res.json(results);
  } catch(err){
    next(err);
  }
};

exports.showPastGame = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).render('error', { message: 'Invalid game id' });
    }
    const game = await PastGame.findById(id).lean();
    if (!game) return res.status(404).render('error', { message: 'Game not found' });

    const teams = await Team.find({ teamId: { $in: [game.HomeId, game.AwayId] } });
    const teamMap = {};
    teams.forEach(t => { teamMap[t.teamId] = t; });
    game.homeTeam = teamMap[game.HomeId] || null;
    game.awayTeam = teamMap[game.AwayId] || null;

    const venue = await Venue.findOne({ venueId: game.VenueId });

    let homeBgColor = game.homeTeam && game.homeTeam.alternateColor ? game.homeTeam.alternateColor : '#ffffff';
    const awayBgColor = game.awayTeam && game.awayTeam.alternateColor ? game.awayTeam.alternateColor : '#ffffff';

    if (game.homeTeam && game.awayTeam && game.homeTeam.alternateColor && game.awayTeam.alternateColor) {
      const diff = colorDistance(hexToRgb(game.homeTeam.alternateColor), hexToRgb(game.awayTeam.alternateColor));
      if (diff < 60 && game.homeTeam.color) {
        homeBgColor = game.homeTeam.color;
      }
    }

    const User = require('../models/users');
    const userIds = (game.comments || []).map(c => c.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('username gameElo');

    const userMap = {};
    users.forEach(u => {
      userMap[String(u._id)] = {
        username: u.username,
        gameElo: u.gameElo || []
      };
    });

    const reviews = (game.comments || []).map(c => {
      const info = userMap[String(c.userId)] || { username: 'User', gameElo: [] };
      const eloEntry = (info.gameElo || []).find(e =>
        String(e.game) === String(game._id) && typeof e.elo === 'number'
      );
      const rating = eloEntry ? (((eloEntry.elo - 1000) / 1000) * 9 + 1).toFixed(1) : null;
      return {
        userId: c.userId,
        username: info.username,
        comment: c.comment,
        rating
      };
    });

    

    const eloAgg = await User.aggregate([
      { $unwind: '$gameElo' },
      { $match: { 'gameElo.game': game._id, 'gameElo.elo': { $ne: null } } },
      { $group: { _id: null, avgElo: { $avg: '$gameElo.elo' } } }
    ]);
    let avgRating = 'N/A';
    if (eloAgg.length && eloAgg[0].avgElo != null) {
      const avgElo = eloAgg[0].avgElo;
      const rating = ((avgElo - 1000) / 1000) * 9 + 1;
      avgRating = rating.toFixed(1);
    }


    res.render('pastGame', { game, homeBgColor, awayBgColor, reviews, venue, avgRating });
  } catch(err){
    next(err);
  }
};
