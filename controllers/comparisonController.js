const Comparison = require('../models/Comparison');
const Game = require('../models/PastGame');
const User = require('../models/users');
const { findEloPlacement, extractGameId } = require('../lib/elo');

module.exports.getNext = async function(req, res, next){
  try {
    const cmp = await Comparison.findOne({ userId: req.user.id, resolved: false }).sort({ _id: 1 });
    if (!cmp) return res.json(null);

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
  } catch (err) {
    next(err);
  }
};

module.exports.submit = async function(req, res, next) {
  try {
    const { comparisonId, winner } = req.body;

    const cmp = await Comparison.findById(comparisonId);
    if (!cmp) return res.status(404).json({ error: 'Comparison not found' });
    if (String(cmp.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    cmp.winner = winner;
    cmp.resolved = true;
    await cmp.save();

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ensure gameElo entry exists for this new game
    let existingEntry = user.gameElo.find(e => String(extractGameId(e.game)) === String(cmp.newGameId));
    if (!existingEntry) {
      user.gameElo.push({ game: cmp.newGameId, elo: 1500, finalized: false, comparisonHistory: [] });
      await user.save(); // Save immediately so we can safely mutate it in Elo logic
    }

    // Re-fetch to ensure we're passing a fresh reference
    const newEntry = user.gameElo.find(e => String(extractGameId(e.game)) === String(cmp.newGameId));

    console.log(`[ELO] Submitting comparison. winner=${winner}, newGame=${cmp.newGameId}, opponent=${cmp.existingGameId}`);

    const result = await findEloPlacement(newEntry, user.gameElo, user, {
      indexLeft: cmp.indexLeft,
      indexRight: cmp.indexRight,
      indexMid: cmp.indexMid,
      winner
    });

    // If the ELO process finalized the rating, update the entry again
    if (result && result.finalized) {
      const entry = user.gameElo.find(e => String(extractGameId(e.game)) === String(cmp.newGameId));
      if (entry) {
        entry.elo = result.elo;
        entry.finalized = true;
        entry.comparisonHistory = result.comparisonHistory || [];
        entry.updatedAt = new Date();
      } else {
        user.gameElo.push(result);
      }

      console.log(`[ELO] Finalized game ${cmp.newGameId} with ELO ${result.elo}`);
      await user.save();
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
