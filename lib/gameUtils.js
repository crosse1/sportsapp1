const Game = require('../models/Game');
const PastGame = require('../models/PastGame');
const Team = require('../models/Team');
const Venue = require('../models/Venue');

/**
 * Fetch a single game by its permanent `gameId`. The lookup will search the
 * `Game` collection first and then fall back to the `PastGame` collection if
 * necessary. Returned documents are lean and have `homeTeam`, `awayTeam`, and
 * `venue` populated when possible so they can be used by badge/stat logic.
 */
async function getGameById(gameId) {
  const numericId = Number(gameId);
  if (!Number.isFinite(numericId)) return null;

  // Try to find an active/upcoming game first
  let game = await Game.findOne({ gameId: numericId })
    .populate('homeTeam')
    .populate('awayTeam')
    .lean();
  if (game) return game;

  // Fallback to past games
  let pg = await PastGame.findOne({ gameId: numericId }).lean();
  if (!pg) {
    pg = await PastGame.findOne({ Id: numericId }).lean();
    if (!pg) return null;
  }

  const candidateGameId = Number(pg.gameId);
  const canonicalId = Number.isFinite(candidateGameId) ? candidateGameId : Number(pg.Id);

  const [teams, venue] = await Promise.all([
    Team.find({ teamId: { $in: [pg.HomeId, pg.AwayId].filter(Boolean) } })
      .select('teamId logos color alternateColor leagueId conferenceId')
      .lean(),
    pg.VenueId ? Venue.findOne({ venueId: pg.VenueId }).lean() : Promise.resolve(null)
  ]);

  const teamMap = {};
  teams.forEach(t => { teamMap[t.teamId] = t; });

  return {
    ...pg,
    gameId: canonicalId,
    homeTeam: teamMap[pg.HomeId] || null,
    awayTeam: teamMap[pg.AwayId] || null,
    venue: venue || null,
    startDate: pg.StartDate,
    homeTeamName: pg.HomeTeam,
    awayTeamName: pg.AwayTeam
  };
}

/**
 * Fetch multiple games by their `gameId`s. Uses `getGameById` under the hood
 * and resolves lookups in parallel via `Promise.all`.
 */
async function fetchGamesByIds(ids = []) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const games = await Promise.all(ids.map(id => getGameById(id)));
  return games.filter(Boolean);
}

module.exports = { fetchGamesByIds, getGameById };
