const Comparison = require('../models/Comparison');
const PastGame = require('../models/PastGame');
const User = require('../models/users');
const { findEloPlacement } = require('../lib/elo');

exports.nextComparison = async (req, res, next) => {
  try {
    const comp = await Comparison.findOne({ userId: req.user.id, resolved: false }).sort({ createdAt: 1 });
    if (!comp) return res.json(null);
    const newGame = await PastGame.findById(comp.newGameId).lean();
    const existingGame = await PastGame.findById(comp.existingGameId).lean();
    res.json({
      comparisonId: comp._id,
      indexLeft: comp.indexLeft,
      indexRight: comp.indexRight,
      indexMid: comp.indexMid,
      newGame,
      existingGame
    });
  } catch (err) {
    next(err);
  }
};

exports.submitComparison = async (req, res, next) => {
  try {
    const { comparisonId, winner } = req.body;
    const comp = await Comparison.findById(comparisonId);
    if (!comp || String(comp.userId) !== String(req.user.id)) {
      return res.status(404).json({ error: 'Comparison not found' });
    }
    comp.winner = winner;
    comp.resolved = true;
    await comp.save();

    const user = await User.findById(req.user.id);
    await findEloPlacement(comp.newGameId, user);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
