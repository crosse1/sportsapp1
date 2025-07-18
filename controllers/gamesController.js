const Game = require('../models/Game');
const Team = require('../models/Team');

exports.listGames = async (req, res, next) => {
  try {
    const { team, start, end, page = 1 } = req.query;
    const query = {};
    if (team) {
      query.$or = [
        { homeTeamName: { $regex: team, $options: 'i' } },
        { awayTeamName: { $regex: team, $options: 'i' } }
      ];
    }
    if (start) {
      query.startDate = { ...(query.startDate || {}), $gte: new Date(start) };
    }
    if (end) {
      query.startDate = { ...(query.startDate || {}), $lte: new Date(end) };
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
      if (start) params.append('start', start);
      if (end) params.append('end', end);
      Object.keys(extra).forEach(k => {
        if (extra[k]) params.append(k, extra[k]);
      });
      return params.toString();
    };

    res.render('games', {
      games,
      filters: { team, start, end },
      page: parseInt(page),
      hasNextPage,
      buildQS
    });
  } catch (err) {
    next(err);
  }
};
