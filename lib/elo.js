const readline = require('readline');

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


async function findEloPlacement(newGame, existingEloGames, user) {
  const newGameId = extractGameId(newGame);
  if (!newGameId) {
    console.warn('[findEloPlacement] Unable to determine ID for new game.');
    return;
  }

  const alreadyExists = user.gameElo?.some(e => String(extractGameId(e)) === String(newGameId));

  if (alreadyExists) {
    console.warn('[findEloPlacement] Game already in ELO list — skipping.', newGameId);
    return;
  }

  newGame.elo = 1500;

  let left = 0;
  let right = existingEloGames.length - 1;
  let iterations = 0;
  const maxIterations = existingEloGames.length + 5;
  existingEloGames = existingEloGames.filter(g => extractGameId(g) !== newGameId);

  let prevMid = -1; // Prevent repeating same mid

while (left <= right && iterations < maxIterations) {
  const mid = Math.floor((left + right) / 2);

  // Prevent infinite loop by breaking if we're stuck
  if (mid === prevMid) {
    console.warn(`[findEloPlacement] Stuck at same midpoint ${mid}, breaking to avoid infinite loop.`);
    break;
  }

  const opponent = existingEloGames[mid];
  const opponentId = extractGameId(opponent);

  console.log(`[findEloPlacement] iteration ${iterations} - left:${left}, right:${right}, mid:${mid} (${opponentId})`);

  const ans = await ask(`Which do you prefer? (n) ${newGameId} or (o) ${opponentId}? `);
  console.log('→ Received answer from prompt:', ans);
  const prefersNew = ans.trim().toLowerCase().startsWith('n');
  const scoreNew = prefersNew ? 1 : 0;

  updateRatings(newGame, opponent, scoreNew);

  if (!newGame.comparisonHistory) newGame.comparisonHistory = [];
  newGame.comparisonHistory.push({
    againstGame: opponentId,
    preferred: prefersNew,
    timestamp: new Date()
  });

  prevMid = mid;

  if (prefersNew) {
    right = mid - 1;
  } else {
    left = mid + 1;
  }

  iterations++;
}
  
  

  if (iterations >= maxIterations) {
    console.warn('[findEloPlacement] Binary search exceeded safe iteration limit.');
  }

  let finalElo = Math.round(newGame.elo || 1500);
  if (iterations === 0) {
    console.warn('[findEloPlacement] No comparisons performed, using default ELO');
    finalElo = 1500;
  }
  console.log(`[findEloPlacement] Final ELO for new game ${newGameId}: ${finalElo}`);

  newGame.elo = Math.round(newGame.elo || 1500);
newGame.finalized = true;
newGame.updatedAt = new Date();

if (iterations === 0) {
  console.warn('[findEloPlacement] No comparisons performed, using default ELO');
  newGame.elo = 1500;
}

console.log(`[findEloPlacement] Final ELO for new game ${newGameId}: ${newGame.elo}`);

// Push enriched game object instead of just ID/ELO pair
if (user) {
  if (!user.gameElo) user.gameElo = [];
  user.gameElo.push({
    game: newGameId,
    elo: newGame.elo,
    comparisonHistory: newGame.comparisonHistory || [],
    finalized: true,
    updatedAt: new Date()
  });

  console.log('[findEloPlacement] Saving new ELO to user:', {
    userId: user._id,
    gameId: newGameId,
    elo: newGame.elo,
    preSaveLength: user.gameElo.length
  });

  if (typeof user.save === 'function') {
    await user.save();
    console.log(`✅ Saved gameElo for game ${newGameId}: ${newGame.elo}`);
  }
}


  return finalElo;
}

module.exports = { initializeEloFromRatings, findEloPlacement };
