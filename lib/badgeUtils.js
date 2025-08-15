function getBadgeStyleClass(badgeID) {
  if (badgeID >= 231 && badgeID <= 364) return 'special-badge-container';
  if (badgeID >= 365 && badgeID <= 594) return 'gold-badge-container';
  if (badgeID >= 595 && badgeID <= 730) return 'bronze-badge-container';
  return '';
}

function computeBadgeProgress(badge, games) {
  const eligible = games.filter(g => {
    const homeTeam = g.homeTeam || {};
    const awayTeam = g.awayTeam || {};
    const leagueMatch = !badge.leagueConstraints?.length ||
      badge.leagueConstraints.some(l => [homeTeam.leagueId, awayTeam.leagueId].map(String).includes(String(l)));
    const teamMatch = !badge.teamConstraints?.length ||
      badge.teamConstraints.some(t => {
        if (badge.homeTeamOnly) return String(homeTeam._id) === String(t);
        return [homeTeam._id, awayTeam._id].map(String).includes(String(t));
      });
    const confMatch = !badge.conferenceConstraints?.length ||
      badge.conferenceConstraints.some(c => [homeTeam.conferenceId, awayTeam.conferenceId].map(String).includes(String(c)));
    const startOk = !badge.startDate || g.startDate >= badge.startDate;
    const endOk = !badge.endDate || g.startDate <= badge.endDate;
    return leagueMatch && teamMatch && confMatch && startOk && endOk;
  });

  if (badge.oneTeamEach) {
    const teamSet = new Set();
    eligible.forEach(g => {
      const homeTeam = g.homeTeam || {};
      const awayTeam = g.awayTeam || {};
      if (badge.teamConstraints && badge.teamConstraints.length) {
        badge.teamConstraints.forEach(t => {
          if (badge.homeTeamOnly) {
            if (String(homeTeam._id) === String(t)) teamSet.add(String(t));
          } else if ([String(homeTeam._id), String(awayTeam._id)].includes(String(t))) {
            teamSet.add(String(t));
          }
        });
      } else {
        teamSet.add(String(homeTeam._id));
        if (!badge.homeTeamOnly) teamSet.add(String(awayTeam._id));
      }
    });
    return teamSet.size;
  }

  return eligible.length;
}

module.exports = { getBadgeStyleClass, computeBadgeProgress };
