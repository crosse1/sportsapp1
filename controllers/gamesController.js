const Game = require('../models/Game');
const Team = require('../models/Team');

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

exports.listGames = async (req, res, next) => {
  try {
    const { team, teamId, date } = req.query;
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

    res.render('games', {
      games,
      filters: { team, teamId, date }
    });
  } catch (err) {
    next(err);
  }
};

exports.searchTeams = async (req, res, next) => {
  try {
    const q = req.query.q || '';
    if (!q) return res.json([]);
    const teams = await Team.find({ school: { $regex: q, $options: 'i' } })
      .select('school logos _id')
      .limit(5);
    res.json(teams);
  } catch (err) {
    next(err);
  }
};

exports.showGame = async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.id)
      .populate('homeTeam')
      .populate('awayTeam');
    if (!game) return res.status(404).render('error', { message: 'Game not found' });
    let homeBgColor = game.homeTeam && game.homeTeam.alternateColor ? game.homeTeam.alternateColor : '#ffffff';
    const awayBgColor = game.awayTeam && game.awayTeam.alternateColor ? game.awayTeam.alternateColor : '#ffffff';

    if (game.homeTeam && game.awayTeam && game.homeTeam.alternateColor && game.awayTeam.alternateColor) {
      const diff = colorDistance(hexToRgb(game.homeTeam.alternateColor), hexToRgb(game.awayTeam.alternateColor));
      if (diff < 60 && game.homeTeam.color) {
        homeBgColor = game.homeTeam.color;
      }
    }

    res.render('game', { game, homeBgColor, awayBgColor });
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
