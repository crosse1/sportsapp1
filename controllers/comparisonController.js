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
  console.log('[DEBUG] submit() triggered');
  
  try {
    const { comparisonId, winner } = req.body;

    const cmp = await Comparison.findById(comparisonId);
    if (!cmp) return res.status(404).json({ error: 'Comparison not found' });
    if (String(cmp.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    cmp.winner = winner;
    console.log(`[DEBUG] Comparison submitted — winner: ${winner}`);
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

    let newEntry = user.gameElo.find(e => String(extractGameId(e.game)) === String(cmp.newGameId));
    const newGameId = extractGameId(newEntry.game);

    // Get all other games for comparison
    const otherGames = user.gameElo.filter(e => String(extractGameId(e.game)) !== String(newGameId));

    // Preserve and pass current comparison state
    let result = await findEloPlacement(newEntry, otherGames, user, {
      indexLeft: cmp.indexLeft,
      indexRight: cmp.indexRight,
      indexMid: cmp.indexMid,
      winner
    });

    // Keep looping if it's not finalized
    while (result === null) {
      const freshEntry = user.gameElo.find(e => String(extractGameId(e.game)) === String(newGameId));
      const opponents = user.gameElo.filter(e => String(extractGameId(e.game)) !== String(newGameId));
      result = await findEloPlacement(freshEntry, opponents, user); // no need to pass state anymore
    }

    if (result.finalized) {
      const entry = user.gameElo.find(e => String(extractGameId(e.game)) === String(newGameId));
      if (entry) {
        entry.elo = result.elo;
        entry.finalized = true;
        entry.comparisonHistory = result.comparisonHistory || [];
        entry.updatedAt = new Date();
      } else {
        user.gameElo.push(result);
      }

      console.log(`[ELO] Finalized game ${newGameId} with ELO ${result.elo}`);
      await user.save();
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

