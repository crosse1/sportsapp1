const PastGame = require('../models/PastGame');
const User = require('../models/users');
const Team = require('../models/Team');

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

    res.render('social', {
      pastgame: selected,
      count: max,
      homeLogo,
      awayLogo,
      homeColor,
      awayColor
    });
  } catch (err) {
    next(err);
  }
};
