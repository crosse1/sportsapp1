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

function initializeEloFromRatings(ratedGames) {
  const games = ratedGames.map(g => ({ ...g, elo: 1500 }));
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
  return games.map(g => ({ gameId: g.gameId, elo: Math.round(g.elo) }));
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function extractGameId(obj) {
  if (!obj) return null;
  if (typeof obj === 'string' || typeof obj === 'number') return String(obj);
  if (typeof obj === 'object') {
    if (obj._id) return String(obj._id);
    if (obj.game) return extractGameId(obj.game);
    if (obj.gameId) return String(obj.gameId);
  }
  return null;
}

async function findEloPlacement(newGame, existingEloGames, user) {
  const newGameId = extractGameId(newGame);
  if (!newGameId) {
    console.warn('[findEloPlacement] Unable to determine ID for new game.');
    return;
  }

  const alreadyExists = existingEloGames.some(e => extractGameId(e) === newGameId);
  if (alreadyExists) {
    console.warn('[findEloPlacement] Game already in ELO list — skipping.', newGameId);
    return;
  }

  newGame.elo = 1500;

  let left = 0;
  let right = existingEloGames.length - 1;
  let iterations = 0;
  const maxIterations = existingEloGames.length + 5;

  while (left <= right && iterations < maxIterations) {
    const mid = Math.floor((left + right) / 2);
    const opponent = existingEloGames[mid];
    const opponentId = extractGameId(opponent);
    console.log(`[findEloPlacement] Compare new ${newGameId} with ${opponentId} at index ${mid}`);

    const ans = await ask(`Which do you prefer? (n) ${newGameId} or (o) ${opponentId}? `);
    const prefersNew = ans.trim().toLowerCase().startsWith('n');
    const scoreNew = prefersNew ? 1 : 0;

    updateRatings(newGame, opponent, scoreNew);

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

  const finalElo = Math.round(newGame.elo || 1500);
  console.log(`[findEloPlacement] Final ELO for new game ${newGameId}: ${finalElo}`);

  if (user && user.gameElo) {
    if (!user.gameElo) user.gameElo = [];
    user.gameElo.push({ game: newGameId, elo: finalElo });
    console.log('[findEloPlacement] Saving new ELO to user:', {
      userId: user._id,
      gameId: newGameId,
      elo: finalElo,
      preSaveLength: user.gameElo.length
    });
    if (typeof user.save === 'function') {
      await user.save();
      console.log(`✅ Saved gameElo for game ${newGameId}: ${finalElo}`);
    }
  }

  return finalElo;
}

module.exports = { initializeEloFromRatings, findEloPlacement };
