// eloHelpers.js
function getEloBounds() {
    return { minElo: 1000, maxElo: 2000 };
  }
  
  function sortGameEloByElo(gameElo) {
    return gameElo.filter(e => e.finalized).sort((a, b) => a.elo - b.elo);
  }
  
  function getComparisonCandidate(gameElo, minElo, maxElo) {
    const finalized = sortGameEloByElo(gameElo);
    const midpoint = Math.floor((minElo + maxElo) / 2);
  
    return finalized.reduce((closest, game) => {
      const dist = Math.abs(game.elo - midpoint);
      return !closest || dist < Math.abs(closest.elo - midpoint) ? game : closest;
    }, null);
  }
  
  function updateEloBounds(result, comparisonGame, currentMin, currentMax) {
    const comparisonElo = comparisonGame.elo;
    if (result === 'new') {
      return { minElo: comparisonElo + 1, maxElo: currentMax };
    } else {
      return { minElo: currentMin, maxElo: comparisonElo - 1 };
    }
  }
  
  function calculateFinalElo(minElo, maxElo) {
    return Math.floor((minElo + maxElo) / 2);
  }
  
  module.exports = {
    getEloBounds,
    sortGameEloByElo,
    getComparisonCandidate,
    updateEloBounds,
    calculateFinalElo
  };
  