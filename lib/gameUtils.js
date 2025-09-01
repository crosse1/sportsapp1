const Game = require('../models/Game');
const PastGame = require('../models/PastGame');
const Team = require('../models/Team');
const Venue = require('../models/Venue');

/**
 * Fetch games by their permanent gameIds from both the `Game` and `PastGame`
 * collections. Returned documents are lean and have `homeTeam`, `awayTeam`, and
 * `venue` populated when possible so they can be used by badge/stat logic.
 */
async function fetchGamesByIds(ids = []) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const numericIds = ids.map(id => Number(id)).filter(n => !isNaN(n));
  if (!numericIds.length) return [];

  // Lookup active games first
  let games = await Game.find({ gameId: { $in: numericIds } })
    .populate('homeTeam')
    .populate('awayTeam')
    .lean();

  const foundIds = new Set(games.map(g => g.gameId));
  const missing = numericIds.filter(id => !foundIds.has(id));

  if (missing.length) {
    let pastGames = await PastGame.find({ gameId: { $in: missing } }).lean();
    if (pastGames.length) {
      const teamIds = [...new Set(pastGames.flatMap(pg => [pg.HomeId, pg.AwayId]))];
      const teams = await Team.find({ teamId: { $in: teamIds } })
        .select('teamId logos color alternateColor leagueId conferenceId')
        .lean();
      const teamMap = {};
      teams.forEach(t => { teamMap[t.teamId] = t; });

      const venueIds = [...new Set(pastGames.map(pg => pg.VenueId).filter(v => v !== undefined))];
      const venues = await Venue.find({ venueId: { $in: venueIds } }).lean();
      const venueMap = {};
      venues.forEach(v => { venueMap[v.venueId] = v; });

      pastGames = pastGames.map(pg => ({
        ...pg,
        homeTeam: teamMap[pg.HomeId] || null,
        awayTeam: teamMap[pg.AwayId] || null,
        venue: venueMap[pg.VenueId] || null,
        startDate: pg.StartDate,
        homeTeamName: pg.HomeTeam,
        awayTeamName: pg.AwayTeam
      }));

      games = games.concat(pastGames);
    }
  }

  return games;
}

module.exports = { fetchGamesByIds };
