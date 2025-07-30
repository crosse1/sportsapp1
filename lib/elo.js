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
      ? Math.round(1000 + ((rating - 1) * 100 / 9))
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


async function findEloPlacementRecursive(newEntry, otherGames, user, { winner, indexLeft, indexRight, indexMid }) {
  let min = 1000;
  let max = 2000;
  const history = [];

  // Filter only finalized Elo entries
  const finalizedGames = otherGames.filter(g => g.finalized);

  while (min < max) {
    const midpoint = Math.floor((min + max) / 2);
    const closestGame = finalizedGames.reduce((closest, g) => {
      return Math.abs(g.elo - midpoint) < Math.abs(closest.elo - midpoint) ? g : closest;
    });

    // Ask user: do you prefer newEntry or closestGame?
    // This comes from the comparison created by the frontend
    const preferredNewGame = (String(winner) === String(newEntry.game));

    // Save that comparison
    newEntry.comparisonHistory.push({
      againstGame: closestGame.game,
      preferred: preferredNewGame,
      timestamp: new Date()
    });

    if (preferredNewGame) {
      min = closestGame.elo + 1;
    } else {
      max = closestGame.elo - 1;
    }

    history.push({ comparedTo: closestGame.game, midpoint, preferredNewGame });

    const remaining = finalizedGames.filter(
      g => g.elo > min && g.elo < max && g.game !== closestGame.game
    );
    if (remaining.length === 0) break;
  }

  const finalElo = Math.floor((min + max) / 2);
  newEntry.elo = finalElo;
  newEntry.finalized = true;
  newEntry.updatedAt = new Date();

  return {
    ...newEntry,
    finalized: true,
    history
  };
}

module.exports = {
  findEloPlacementRecursive,
};

function ratingToElo(rating) {
  const r = parseFloat(rating);
  if (isNaN(r)) return 1500;
  return Math.round(1000 + ((r - 1) * 100 / 9));
}

function eloToRating(elo) {
  return 1 + 9 * ((parseFloat(elo) - 1000) / 100);
}

function getNextComparisonCandidate(user, newGame, minElo, maxElo) {
  const midpoint = (minElo + maxElo) / 2;
  let best = null;
  let bestDiff = Infinity;
  const newId = extractGameId(newGame.game || newGame);
  const compared = new Set(
    (newGame.comparisonHistory || []).map(h => String(extractGameId(h.againstGame)))
  );

  (user.gameElo || []).forEach(g => {
    const gid = extractGameId(g.game);
    if (gid === newId || !g.finalized) return;
    if (g.elo < minElo || g.elo > maxElo) return;
    if (compared.has(String(gid))) return;
    const diff = Math.abs(g.elo - midpoint);
    if (diff < bestDiff) {
      best = g;
      bestDiff = diff;
    }
  });

  return best;
}

module.exports = {
  initializeEloFromRatings,
  
  updateRatings,
  extractGameId,
  ratingToElo,
  eloToRating,
  getNextComparisonCandidate
};
