const readline = require('readline');
const Comparison = require('../models/Comparison');

const K = 32;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateRatings(playerA, playerB, scoreA) {
  const expectedA = expectedScore(playerA.elo, playerB.elo);
  const expectedB = 1 - expectedA;
  playerA.elo += K * (scoreA - expectedA);
  playerB.elo += K * ((1 - scoreA) - expectedB);
}

const RATING_TO_ELO_FACTOR = 100; // 1.0 → 100, 10.0 → 1000

function initializeEloFromRatings(ratedGames) {
  console.log('[ELO INIT] Total ratedGames:', ratedGames.length);

  const games = ratedGames.map(g => {
    const ratingRaw = g.rating;
    const rating = parseFloat(g.rating);
    const isSingle = ratedGames.length === 1;
    const useFormula = isSingle && !isNaN(rating);

    console.log(`[ELO INIT] Game: ${g.game || g.gameId}`);
    console.log(`  ➤ Raw rating:`, ratingRaw);
    console.log(`  ➤ Parsed rating:`, rating);
    console.log(`  ➤ Condition met? ratedGames.length === 1:`, isSingle);
    console.log(`  ➤ !isNaN(rating):`, !isNaN(rating));
    console.log(`  ➤ Use formula:`, useFormula);

    const baseElo = useFormula
      ? Math.round(1000 + ((rating - 1) / 9) * 1000)
      : 1500;

    console.log(`  ➤ Assigned ELO:`, baseElo);

    return { ...g, elo: baseElo };
  });

  for (let i = 0; i < games.length; i++) {
    for (let j = i + 1; j < games.length; j++) {
      const a = games[i];
      const b = games[j];
      let scoreA = 0.5;
      if (a.rating > b.rating) scoreA = 1;
      else if (a.rating < b.rating) scoreA = 0;
      updateRatings(a, b, scoreA);
    }
  }

  return games.map(g => ({
    game: String(g.gameId || g.game), // this will be consumed directly by mongoose
    elo: Math.round(g.elo)
  }));
}




  

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function extractGameId(obj) {
  if (!obj) return null;

  if (typeof obj === 'string' || typeof obj === 'number') {
    return String(obj);
  }

  if (typeof obj === 'object') {
    // ✅ Prioritize the actual game ID
    if (obj.game) return extractGameId(obj.game); // handles nested game IDs too
    if (obj.gameId) return String(obj.gameId);

    // ❌ Only fallback to _id if nothing else is present (should rarely happen)
    if (obj._id) return String(obj._id);
  }

  return null;
}


async function findEloPlacement(newGame, existingEloGames, user, state = {}) {
  const newGameId = extractGameId(newGame);
  if (!newGameId) {
    console.warn('[findEloPlacement] Unable to determine ID for new game.');
    return;
  }

  if (!newGame.elo) newGame.elo = 1500;

  // ensure entry exists on user
  if (!user.gameElo) user.gameElo = [];
  let userEntry = user.gameElo.find(e => String(extractGameId(e.game)) === String(newGameId));
  if (!userEntry) {
    userEntry = { game: newGameId, elo: newGame.elo, comparisonHistory: [], finalized: false, updatedAt: new Date() };
    user.gameElo.push(userEntry);
  } else {
    userEntry.elo = newGame.elo;
    userEntry.finalized = false;
    userEntry.updatedAt = new Date();
  }

  let left = state.indexLeft ?? 0;
  let right = state.indexRight ?? (existingEloGames.length - 1);
  const prevMid = state.indexMid;
  const winner = state.winner;

  existingEloGames = existingEloGames.filter(g => extractGameId(g) !== newGameId);

  if (prevMid !== undefined && winner) {
    const opponent = existingEloGames[prevMid];
    if (opponent) {
      updateRatings(newGame, opponent, winner === 'new' ? 1 : 0);
      const oppId = extractGameId(opponent);
      if (!newGame.comparisonHistory) newGame.comparisonHistory = [];
      newGame.comparisonHistory.push({ againstGame: oppId, preferred: winner === 'new', timestamp: new Date() });

      const oppEntry = user.gameElo.find(e => String(extractGameId(e.game)) === String(oppId));
      if (oppEntry) {
        oppEntry.elo = opponent.elo;
        oppEntry.updatedAt = new Date();
      }

      if (winner === 'new') right = prevMid - 1; else left = prevMid + 1;
    }
  }

  if (left > right) {
    newGame.finalized = true;
    userEntry.elo = newGame.elo;
    userEntry.comparisonHistory = newGame.comparisonHistory || [];
    userEntry.finalized = true;
    userEntry.updatedAt = new Date();
    await user.save();
    return userEntry; // ✅ Return full elo object
  }

  const mid = Math.floor((left + right) / 2);
  const opponent = existingEloGames[mid];
  if (!opponent) {
    newGame.finalized = true;
    userEntry.finalized = true;
    userEntry.updatedAt = new Date();
    await user.save();
    return userEntry; // ✅
  }

  await Comparison.create({
    userId: user._id,
    newGameId: newGameId,
    existingGameId: extractGameId(opponent),
    indexLeft: left,
    indexRight: right,
    indexMid: mid,
    resolved: false
  });

  userEntry.elo = newGame.elo;
  await user.save();
  return null;
}

module.exports = { initializeEloFromRatings, findEloPlacement, updateRatings, extractGameId };
