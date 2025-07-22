const Game = require('../models/Game');
const Team = require('../models/Team');
const Venue = require('../models/Venue');

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
    const game = await Game.findById(req.params.id)
      .populate('homeTeam')
      .populate('awayTeam');
    const venue = await Venue.findOne({ venueId: game.venueId });
    if (!game) return res.status(404).render('error', { message: 'Game not found' });
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
