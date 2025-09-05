const test = require('node:test');
const assert = require('node:assert/strict');

const { getGameById } = require('../lib/gameUtils');
const { computeBadgeProgress } = require('../lib/badgeUtils');
const Game = require('../models/Game');
const PastGame = require('../models/PastGame');
const Team = require('../models/Team');
const Venue = require('../models/Venue');

// Helper to create a mongoose-like query chain
function mockQuery(result) {
  return {
    populate() { return this; },
    select() { return this; },
    lean() { return Promise.resolve(result); }
  };
}

// Helper to restore original mongoose methods after each test
function withMocks(mocks, fn) {
  return async () => {
    const originals = mocks.map(([obj, method]) => [obj, method, obj[method]]);
    mocks.forEach(([obj, method, impl]) => { obj[method] = impl; });
    try {
      await fn();
    } finally {
      originals.forEach(([obj, method, orig]) => { obj[method] = orig; });
    }
  };
}

test('getGameById returns active game', withMocks([
  [Game, 'findOne', () => mockQuery({ gameId: 1, homeTeam: { _id: 'h' }, awayTeam: { _id: 'a' } })],
  [PastGame, 'findOne', () => mockQuery(null)]
], async () => {
  const game = await getGameById(1);
  assert.equal(game.gameId, 1);
  assert.equal(game.homeTeam._id, 'h');
}));

test('getGameById falls back to past games', withMocks([
  [Game, 'findOne', () => mockQuery(null)],
  [PastGame, 'findOne', () => mockQuery({
    gameId: 2,
    HomeId: 10,
    AwayId: 20,
    VenueId: 5,
    StartDate: new Date('2023-01-01'),
    HomeTeam: 'Home',
    AwayTeam: 'Away'
  })],
  [Team, 'find', () => mockQuery([
    { teamId: 10, _id: 'T10', leagueId: 1, conferenceId: 1 },
    { teamId: 20, _id: 'T20', leagueId: 1, conferenceId: 2 }
  ])],
  [Venue, 'findOne', () => ({ lean: () => Promise.resolve({ venueId: 5, _id: 'V5' }) })]
], async () => {
  const game = await getGameById(2);
  assert.equal(game.gameId, 2);
  assert.equal(game.homeTeam._id, 'T10');
  assert.equal(game.awayTeam._id, 'T20');
  assert.equal(game.venue._id, 'V5');
  assert.ok(game.startDate instanceof Date);
}));

test('computeBadgeProgress counts games from both sources', async () => {
  const games = [
    { homeTeam: { _id: 'T10', leagueId: 1, conferenceId: 1 }, awayTeam: { _id: 'T20', leagueId: 1, conferenceId: 2 }, startDate: new Date('2023-01-01') },
    { homeTeam: { _id: 'T10', leagueId: 1, conferenceId: 1 }, awayTeam: { _id: 'T30', leagueId: 1, conferenceId: 2 }, startDate: new Date('2023-01-02') }
  ];
  const badge = { reqGames: 2, teamConstraints: ['T10'], homeTeamOnly: true };
  const progress = computeBadgeProgress(badge, games);
  assert.equal(progress, 2);
});
