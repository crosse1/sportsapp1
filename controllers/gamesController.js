const Game = require('../models/Game');
const Team = require('../models/Team');

exports.listGames = async (req, res, next) => {
  try {
    const { team, date } = req.query;
    const query = {};
    if (team) {
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
      filters: { team, date }
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
      .select('school logos')
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
    res.render('game', { game });
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
