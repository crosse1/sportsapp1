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

async function applyComparisons(user, newGameId) {
  const comparisons = await Comparison.find({ userId: user._id, newGameId, resolved: true }).sort({ createdAt: 1 }).lean();
  const eloGames = (user.gameElo || []).map(e => ({ ...e }));
  const newGame = { elo: 1500 };
  let left = 0;
  let right = eloGames.length - 1;
  for (const c of comparisons) {
    const opponent = eloGames[c.indexMid];
    if (!opponent) continue;
    const scoreNew = c.winner === 'new' ? 1 : 0;
    updateRatings(newGame, opponent, scoreNew);
    if (c.winner === 'new') right = c.indexMid - 1; else left = c.indexMid + 1;
  }
  return { eloGames, newGame, left, right };
}

async function findEloPlacement(newGameId, user) {
  const { eloGames, newGame, left, right } = await applyComparisons(user, newGameId);

  const alreadyExists = eloGames.some(e => extractGameId(e.game || e) === String(newGameId));
  if (alreadyExists) {
    console.warn('[findEloPlacement] Game already in ELO list — skipping.', newGameId);
    return;
  }

  if (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const opponentId = extractGameId(eloGames[mid]);
    await Comparison.create({
      userId: user._id,
      newGameId,
      existingGameId: opponentId,
      indexLeft: left,
      indexRight: right,
      indexMid: mid
    });
    return;
  }

  user.gameElo = eloGames;
  user.gameElo.push({ game: newGameId, elo: Math.round(newGame.elo) });
  await user.save();
  return Math.round(newGame.elo);
}

module.exports = { initializeEloFromRatings, findEloPlacement };
