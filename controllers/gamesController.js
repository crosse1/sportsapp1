const Game = require('../models/Game');
const Team = require('../models/Team');
const Venue = require('../models/Venue');
const PastGame = require('../models/PastGame');
const mongoose = require('mongoose');

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

exports.checkIn = async (req, res, next) => {
  try {
    // Placeholder implementation
    res.redirect(`/games/${req.params.id}`);
  } catch (err) {
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
    const idx = user.gamesList.findIndex(g => String(g) === gameId);
    let action;
    if(idx >= 0){
      user.gamesList.splice(idx,1);
      action = 'removed';
    } else {
      user.gamesList.push(gameId);
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

exports.listPastGameSeasons = async (req, res, next) => {
  try {
    let seasons = await PastGame.distinct('Season');
    seasons = seasons.filter(s => !!s).sort((a,b) => b - a);
    res.json(seasons);
  } catch(err){
    next(err);
  }
};

exports.listPastGameTeams = async (req, res, next) => {
  try {
    const season = parseInt(req.query.season);
    if(isNaN(season)) return res.json([]);
    const homeIds = await PastGame.distinct('HomeId', { Season: season });
    const awayIds = await PastGame.distinct('AwayId', { Season: season });
    const ids = [...new Set([...homeIds, ...awayIds])].filter(Boolean);
    const teams = await Team.find({ teamId: { $in: ids } })
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
    const q = req.query.q || '';
    if(isNaN(season)) return res.json([]);
    const match = { Season: season };
    if(!isNaN(teamId)){
      match.$or = [{ HomeId: teamId }, { AwayId: teamId }];
    } else if(q){
      match.$or = [
        { HomeTeam: { $regex: q, $options: 'i' } },
        { AwayTeam: { $regex: q, $options: 'i' } }
      ];
    }
    const games = await PastGame.find(match)
      .sort({ StartDate: 1 })
      .limit(10)
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
      score: `${g.HomePoints ?? ''}-${g.AwayPoints ?? ''}`
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

    const ratingMap = {};
    (game.ratings || []).forEach(r => { ratingMap[String(r.userId)] = r.rating; });
    const userIds = (game.comments || []).map(c => c.userId);
    const users = await require('../models/users').find({ _id: { $in: userIds } }).select('username');
    const userMap = {};
    users.forEach(u => { userMap[String(u._id)] = u.username; });
    const reviews = (game.comments || []).map(c => ({
      userId: c.userId,
      username: userMap[String(c.userId)] || 'User',
      comment: c.comment,
      rating: ratingMap[String(c.userId)] || null
    }));

    res.render('pastGame', { game, homeBgColor, awayBgColor, reviews, venue });
  } catch(err){
    next(err);
  }
};
