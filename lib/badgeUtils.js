// lib/badgeUtils.js

/**
 * Map a badgeID to a CSS class used by your UI.
 * Keep this simple and centralized so both server-rendered EJS and
 * client modals can rely on the same buckets.
 */
function getBadgeStyleClass(badgeID) {
  const id = Number(badgeID);
  if (!Number.isFinite(id)) return '';

  // Your current ranges:
  if (id >= 231 && id <= 364) return 'special-badge-container';
  if (id >= 365 && id <= 594) return 'gold-badge-container';
  if (id >= 595 && id <= 730) return 'bronze-badge-container';

  return ''; // no styling outside the windows
}

/**
 * Compute how many games count toward a given badge for the provided game list.
 * This is your existing logic, preserved.
 */
function computeBadgeProgress(badge, games) {
  const eligible = games.filter(g => {
    const homeTeam = g.homeTeam || {};
    const awayTeam = g.awayTeam || {};

    const leagueMatch = !badge.leagueConstraints?.length ||
      badge.leagueConstraints.some(l =>
        [homeTeam.leagueId, awayTeam.leagueId].map(String).includes(String(l))
      );

    const teamMatch = !badge.teamConstraints?.length ||
      badge.teamConstraints.some(t => {
        if (badge.homeTeamOnly) return String(homeTeam._id) === String(t);
        return [homeTeam._id, awayTeam._id].map(String).includes(String(t));
      });

    const confMatch = !badge.conferenceConstraints?.length ||
      badge.conferenceConstraints.some(c =>
        [homeTeam.conferenceId, awayTeam.conferenceId].map(String).includes(String(c))
      );

    const startOk = !badge.startDate || g.startDate >= badge.startDate;
    const endOk   = !badge.endDate   || g.startDate <= badge.endDate;

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

/**
 * Helper to produce the exact badge payload the frontend modals need,
 * including styleClass and percent.
 * Also converts Mongo Buffer icon to a data URL if present.
 */
function formatBadgeForClient(badge, { progress = 0 } = {}) {
  const req = Math.max(0, Number(badge.reqGames || 0));
  const done = Math.max(0, Number(progress));
  const percent = req ? Math.min(100, Math.round((Math.min(done, req) / req) * 100)) : 0;

  // Convert Buffer icon if needed
  let iconUrl = badge.iconUrl;
  if (iconUrl && iconUrl.data && iconUrl.contentType) {
    iconUrl = `data:${iconUrl.contentType};base64,${iconUrl.data.toString('base64')}`;
  }

  return {
    _id: badge._id,
    badgeID: badge.badgeID,
    badgeName: badge.badgeName,
    description: badge.description || '',
    iconUrl,
    styleClass: getBadgeStyleClass(badge.badgeID),
    reqGames: req,
    progress: done,
    percent
  };
}

module.exports = { getBadgeStyleClass, computeBadgeProgress, formatBadgeForClient };
