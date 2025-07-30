// controllers/comparisonController.js
const {
  getEloBounds,
  sortGameEloByElo,
  getComparisonCandidate,
  updateEloBounds,
  calculateFinalElo
} = require('../lib/eloHelpers');
const User = require('../models/users');
const GameComparison = require('../models/Comparison');

exports.submit = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { gameA, gameB, winner } = req.body;

    const newGameId = [gameA, gameB].find(id => !user.gameElo.some(e => e.game.equals(id)));
    const existingGameId = [gameA, gameB].find(id => id !== newGameId);

    if (!newGameId || !existingGameId) {
      return res.status(400).json({ error: 'Both a new and existing game must be provided' });
    }

    const newGameEntry = user.gameElo.find(e => e.game.equals(newGameId));
    const existingGameEntry = user.gameElo.find(e => e.game.equals(existingGameId));

    if (!existingGameEntry || !existingGameEntry.finalized) {
      return res.status(400).json({ error: 'Existing game must have finalized Elo' });
    }

    const result = winner === newGameId ? 'new' : 'existing';
    const min = newGameEntry.minElo ?? getEloBounds().minElo;
    const max = newGameEntry.maxElo ?? getEloBounds().maxElo;

    const { minElo, maxElo } = updateEloBounds(result, existingGameEntry, min, max);
    console.log(`[ELO] Bounds updated — min: ${minElo}, max: ${maxElo}`);

    // Save comparison result
    await GameComparison.create({ userId: user._id, gameA, gameB, winner });

    // Update new game entry
    newGameEntry.minElo = minElo;
    newGameEntry.maxElo = maxElo;
    newGameEntry.comparisonHistory = newGameEntry.comparisonHistory || [];
    newGameEntry.comparisonHistory.push({
      againstGame: existingGameId,
      preferred: result === 'new',
      timestamp: new Date()
    });

    if (minElo >= maxElo || maxElo - minElo <= 1) {
      newGameEntry.elo = calculateFinalElo(minElo, maxElo);
      newGameEntry.finalized = true;
      console.log(`[ELO] Finalized newGame ${newGameId} at ${newGameEntry.elo}`);
    }

    newGameEntry.updatedAt = new Date();
    await user.save();

    res.status(200).json({ message: 'Comparison recorded' });
  } catch (err) {
    console.error('[submitComparison ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};



// controllers/comparisonController.js
exports.getNextComparisonCandidate = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const newGame = user.gameElo.find(e => !e.finalized);

    if (!newGame) return res.status(204).json({ message: 'No comparisons needed' });

    const { minElo, maxElo } = newGame;
    const candidate = getComparisonCandidate(user.gameElo, minElo, maxElo);

    if (!candidate) return res.status(204).json({ message: 'No eligible comparisons left' });

    res.status(200).json({
      gameA: newGame.game,
      gameB: candidate.game
    });
  } catch (err) {
    console.error('[getNextComparisonCandidate ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
