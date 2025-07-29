const Comparison = require('../models/Comparison');
const Game = require('../models/PastGame');
const User = require('../models/users');
const { findEloPlacement, extractGameId } = require('../lib/elo');

module.exports.getNext = async function(req, res, next){
  try {
    const cmp = await Comparison.findOne({ userId: req.user.id, resolved: false }).sort({ _id: 1 });
    if(!cmp) return res.json(null);
    const newGame = await Game.findById(cmp.newGameId);
    const existingGame = await Game.findById(cmp.existingGameId);
    res.json({
      _id: cmp._id,
      indexLeft: cmp.indexLeft,
      indexRight: cmp.indexRight,
      indexMid: cmp.indexMid,
      newGame,
      existingGame
    });
  } catch(err){
    next(err);
  }
};

module.exports.submit = async function(req, res, next){
  try {
    const { comparisonId, winner } = req.body;
    const cmp = await Comparison.findById(comparisonId);
    if(!cmp) return res.status(404).json({ error: 'Comparison not found' });
    if(String(cmp.userId) !== String(req.user.id)) return res.status(403).json({ error:'Forbidden' });

    cmp.winner = winner;
    cmp.resolved = true;
    await cmp.save();

    const user = await User.findById(req.user.id);
    const newEntry = user.gameElo.find(e => String(extractGameId(e.game)) === String(cmp.newGameId));
    if(!newEntry) {
      user.gameElo.push({ game: cmp.newGameId, elo: 1500, finalized:false, comparisonHistory:[] });
    }

    await findEloPlacement(newEntry || {gameId: cmp.newGameId, elo: 1500}, user.gameElo, user, {
      indexLeft: cmp.indexLeft,
      indexRight: cmp.indexRight,
      indexMid: cmp.indexMid,
      winner
    });

    res.json({ success: true });
  } catch(err){
    next(err);
  }
};
