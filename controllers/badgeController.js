const mongoose = require('mongoose');
const Badge = require('../models/Badge');
const User = require('../models/users');
const Game = require('../models/Game');
const Team = require('../models/Team');

exports.showBadge = async (req, res, next) => {
  try {
    const badge = await Badge.findById(req.params.id).lean();
    if (!badge) {
      return res.status(404).render('error', { message: 'Badge not found' });
    }

    let team = null;
    if (badge.teamConstraints && badge.teamConstraints.length > 0) {
      team = await Team.findById(badge.teamConstraints[0]).lean();
    }

    const usersCompleted = await User.find({ badges: badge._id })
      .select('username profileImage')
      .lean();

    const now = new Date();
    const query = { startDate: { $gte: now } };
    const orConditions = [];

    if (badge.leagueConstraints && badge.leagueConstraints.length) {
      const leagueIds = badge.leagueConstraints.map(id => parseInt(id));
      orConditions.push({ leagueId: { $in: leagueIds } });
    }

    if (badge.conferenceConstraints && badge.conferenceConstraints.length) {
      const confIds = badge.conferenceConstraints.map(id => parseInt(id));
      orConditions.push({ $or: [
        { homeConferenceId: { $in: confIds } },
        { awayConferenceId: { $in: confIds } }
      ] });
    }

    if (badge.teamConstraints && badge.teamConstraints.length) {
      const teamIds = badge.teamConstraints.map(id => new mongoose.Types.ObjectId(id));
      orConditions.push({ $or: [
        { homeTeam: { $in: teamIds } },
        { awayTeam: { $in: teamIds } }
      ] });
    }

    if (orConditions.length) {
      query.$or = orConditions;
    }

    let games = await Game.find(query)
      .populate('homeTeam')
      .populate('awayTeam')
      .sort({ startDate: 1 })
      .lean();

    let wishlist = new Set();
    if (req.user) {
      const viewer = await User.findById(req.user.id).select('wishlist');
      if (viewer && viewer.wishlist) {
        wishlist = new Set(viewer.wishlist.map(id => String(id)));
      }
    }

    games = games.map(g => ({
      ...g,
      isWishlisted: wishlist.has(String(g._id))
    }));

    res.render('badge', {
      badge,
      team,
      usersCompleted,
      upcomingGames: games
    });
  } catch (err) {
    next(err);
  }
};

