const Game = require('../models/Game');
const Team = require('../models/Team');

exports.listGames = async (req, res, next) => {
  try {
    const { team, date, page = 1 } = req.query;
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
    const limit = 50;
    const skip = (parseInt(page) - 1) * limit;

    let games = await Game.find(query)
      .populate('homeTeam')
      .populate('awayTeam')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(limit + 1); // fetch one extra to check if next page exists

    const hasNextPage = games.length > limit;
    if (hasNextPage) games = games.slice(0, limit);

    const buildQS = (extra = {}) => {
      const params = new URLSearchParams();
      if (team) params.append('team', team);
      if (date) params.append('date', date);
      Object.keys(extra).forEach(k => {
        if (extra[k]) params.append(k, extra[k]);
      });
      return params.toString();
    };

    res.render('games', {
      games,
      filters: { team, date },
      page: parseInt(page),
      hasNextPage,
      buildQS
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
