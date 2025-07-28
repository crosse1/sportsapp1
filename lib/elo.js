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

async function findEloPlacement(newGame, existingEloGames, user) {

  newGame.elo = 1500;
  let left = 0;
  let right = existingEloGames.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const opponent = existingEloGames[mid];
    const ans = await ask(`Which do you prefer? (n) ${newGame.gameId} or (o) ${opponent.gameId}? `);
    const prefersNew = ans.trim().toLowerCase().startsWith('n');
    const scoreNew = prefersNew ? 1 : 0;
    updateRatings(newGame, opponent, scoreNew);
    if (prefersNew) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  const finalElo = Math.round(newGame.elo || 1500);
  console.log(`Final ELO for new game: ${finalElo}`);
  if (user && user.gameElo) {
    const gameId = newGame.gameId || newGame._id;
    if (!user.gameElo) user.gameElo = [];
    user.gameElo.push({ game: gameId, elo: finalElo });
    console.log("Saving new elo to user:", {
      userId: user._id,
      gameId: gameId,
      elo: finalElo,
      preSaveLength: user.gameElo.length
    });
    if (typeof user.save === 'function') {
      await user.save();
      console.log(`✅ Saved gameElo for game ${gameId}: ${finalElo}`);
    }
  }
  return finalElo;
}

module.exports = { initializeEloFromRatings, findEloPlacement };
