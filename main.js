"use strict";

const express = require("express"),
    app = express(),
    errorController = require("./controllers/errorController"),
    homeController = require("./controllers/homeController"),
    profileController = require("./controllers/profileController"),
    projectsController = require("./controllers/projectsController"),
    gamesController = require("./controllers/gamesController"),
    venuesController = require('./controllers/venuesController'),
    messagesController = require('./controllers/messagesController'),
    coordinationController = require('./controllers/coordinationController'),
    comparisonController = require('./controllers/comparisonController'),
    badgeController = require('./controllers/badgeController'),
    socialController = require('./controllers/socialController'),
    Message = require('./models/Message'),
    User = require('./models/users'),
    Team = require('./models/Team'),
    Game = require('./models/Game'),
    PastGame = require('./models/PastGame'),
    Badge = require('./models/Badge'),
    layouts = require('express-ejs-layouts'),
    { fetchGamesByIds } = require('./lib/gameUtils'),
    mongoose = require('mongoose'),
    { startPastGameScheduler, runPastGameMigrationOnce } = require('./pastGameScheduler'),
    cookieParser = require('cookie-parser'),
    path = require('path'),
    jwt = require('./lib/simpleJWT'),
    { getBadgeStyleClass } = require('./lib/badgeUtils');



mongoose.connect(
    "mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster"
);



const db = mongoose.connection;
db.once('open', async () => {
  console.log('Connected to MongoDB');
  db.once('open', async () => {
  console.log('Connected to MongoDB');

  // --- ONE-TIME RECOVERY: clear stuck claims on due docs ---
  try {
    const gamesCol = mongoose.connection.db.collection('games');
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago
    const rec = await gamesCol.updateMany(
      {
        startDate: { $exists: true, $lte: cutoff },
        $or: [ { migrating: true }, { claimAt: { $exists: true } } ]
      },
      { $set: { migrating: false }, $unset: { claimAt: "" } }
    );
    console.log(`[recovery] cleared flags on ${rec.modifiedCount} due docs`);
  } catch (e) {
    console.error('[recovery] error:', e);
  }
  // ---------------------------------------------------------

  startPastGameScheduler();
  // keep manual run commented to avoid races:
  // await runPastGameMigrationOnce();
});

  startPastGameScheduler();
  // await runPastGameMigrationOnce(); // ← comment this out OR the startup one in the scheduler
});



app.set('port', process.env.PORT || 3000);
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(layouts);
app.use(cookieParser());
app.use(express.urlencoded({
    extended:false,
})
);

app.use(express.json());
app.locals.getBadgeStyleClass = getBadgeStyleClass;

// Middleware to authenticate token
app.use(async (req, res, next) => {
    const token = req.cookies.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, 'secret');
            const userDoc = await User.findById(decoded.id).lean();
            if (userDoc) {
                const invites = Array.isArray(userDoc.invites) ? userDoc.invites : [];
                const hasQueuedInvites = invites.some(invite => invite && invite.modalQueued);
                req.user = {
                    id: String(userDoc._id),
                    username: userDoc.username,
                    email: userDoc.email,
                    phoneNumber: userDoc.phoneNumber,
                    venmo: userDoc.venmo || null,
                    profileImage: userDoc.profileImage,
                    newFollowers: userDoc.newFollowers || [],
                    hasQueuedGameInvites: hasQueuedInvites
                };
                res.locals.hasQueuedGameInvites = hasQueuedInvites;
            } else {
                req.user = null;
            }
        } catch (err) {
            req.user = null;
        }
    } else {
        req.user = null;
    }
    res.locals.loggedInUser = req.user;
    res.locals.currentPath = req.path;
    if (!res.locals.hasQueuedGameInvites) {
        res.locals.hasQueuedGameInvites = false;
    }
    if (req.user) {
        const hasUnread = await Message.exists({ participants: req.user.id, unreadBy: req.user.id });
        res.locals.hasUnreadMessages = !!hasUnread;
        res.locals.newFollowers = req.user.newFollowers || [];
        res.locals.hasNewFollowers = res.locals.newFollowers.length > 0;
    } else {
        res.locals.hasUnreadMessages = false;
        res.locals.hasNewFollowers = false;
        res.locals.newFollowers = [];
        res.locals.hasQueuedGameInvites = false;
    }
    next();
});

app.use((req, res, next) => {
    if (req.user) {
        res.locals.navImg = req.user.profileImage && req.user.profileImage.data
            ? `/users/${req.user.id}/profile-image`
            : '/images/default-profile.png';
    } else {
        res.locals.navImg = '/images/default-profile.png';
    }
    next();
});

// Middleware to find checked-in games that need ratings
app.use(async (req, res, next) => {
    if (!req.user) {
        res.locals.pendingRatings = [];
        return next();
    }
    try {
        const user = await User.findById(req.user.id).select('gameEntries').lean();
        const pending = (user?.gameEntries || []).filter(e => {
            if (!e.checkedIn) return false;
            if (e.elo || e.comment || e.image) return false;
            if (e.ratingPrompted) return false;
            return true;
        });
        const ids = pending.map(e => e.gameId);
        const games = await fetchGamesByIds(ids);
        const gameMap = {};
        games.forEach(g => { gameMap[String(g.gameId)] = g; });
        const entries = pending.map(e => {
            const g = gameMap[String(e.gameId)];
            if (!g) return null;
            if (g.homePoints == null || g.awayPoints == null) return null;
            return {
                _id: String(e._id),
                game: {
                    _id: String(g._id || g.gameId),
                    homeTeamName: g.homeTeamName || g.HomeTeam || (g.homeTeam && (g.homeTeam.teamName || g.homeTeam.school)),
                    awayTeamName: g.awayTeamName || g.AwayTeam || (g.awayTeam && (g.awayTeam.teamName || g.awayTeam.school)),
                    homePoints: g.homePoints ?? g.HomePoints,
                    awayPoints: g.awayPoints ?? g.AwayPoints,
                    startDate: g.startDate || g.StartDate,
                    homeLogo: g.homeTeam && (g.homeTeam.logo || (g.homeTeam.logos && g.homeTeam.logos[0])) || null,
                    awayLogo: g.awayTeam && (g.awayTeam.logo || (g.awayTeam.logos && g.awayTeam.logos[0])) || null
                }
            };
        }).filter(Boolean);
        res.locals.pendingRatings = entries;
    } catch (err) {
        res.locals.pendingRatings = [];
    }
    next();
});

const decodeToken = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
      req.user = null;
      return next();
    }
  
    try {
      const decoded = jwt.verify(token, 'secret');
      const user = await User.findById(decoded.id);
      req.user = user || null;
    } catch (err) {
      console.error('[decodeToken ERROR]', err);
      req.user = null;
    }
  
    next();
  };
  
  module.exports = decodeToken;

const requireAuth = async (req, res, next) => {
    const token = req.cookies.token;
  
    if (!token) {
      return res.redirect('/login');
    }
  
    try {
      const decoded = jwt.verify(token, 'secret'); // Use env variable in production
      const user = await User.findById(decoded.id);
      if (!user) return res.redirect('/login');
  
      req.user = user; // 🔥 THIS is the critical fix
      if (user.favoriteTeams.length === 0 && req.path !== '/select-teams') {
        return res.redirect('/select-teams');
      }
      next();
    } catch (err) {
      console.error('[AUTH ERROR]', err);
      return res.redirect('/login');
    }
  };

const requireAuthJson = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Public landing page
app.get('/', (req, res) => {
    if (req.user) {
        return res.redirect('/games');
    }
    return homeController.index(req, res);
});
app.get('/signup', profileController.getSignUp);
app.get('/login', profileController.getLogin);
app.post('/signup', profileController.saveUser);
app.post('/login', profileController.loginUser);
app.get("/check-username/:username", profileController.checkUsername);
app.get('/select-teams', requireAuth, profileController.selectFavoriteTeams);
app.post('/select-teams', requireAuth, profileController.saveFavoriteTeams);
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});
app.get('/thanks', requireAuth, (req, res) => { res.redirect('/profileBadges/' + req.user.id); });
app.get('/profile', requireAuth, (req, res) => {
    const slug = req.user ? (req.user.venmo || req.user.id) : '';
    return res.redirect(slug ? `/profile/${slug}/stats` : '/games');
});
app.get('/profileBadges/:user?', requireAuth, profileController.profileBadges);
app.get('/profileGames/:user/:gameEntry', requireAuth, profileController.profileGameShowcase);
app.get('/profileGames/:user?', requireAuth, profileController.profileGames);
app.get('/users/followers/search', requireAuth, profileController.searchFollowers);
app.get('/profileStats/:user?', requireAuth, profileController.profileStats);
app.get('/profileWaitlist/:user?', requireAuth, profileController.profileWaitlist);
app.get('/profile/:user/:team([0-9a-fA-F]{24}|\\d+)', requireAuth, profileController.favoriteTeamStats);
app.get('/profile/edit', requireAuth, profileController.getEditProfile);
app.post('/profile/edit', requireAuth, profileController.updateProfile);
app.post('/profile/photo', requireAuth, profileController.uploadProfilePhoto);
app.post('/profile/location', requireAuth, profileController.setLocation);
app.post('/profile/games', requireAuth, profileController.addGame);
app.post('/profile/games/:id/rate', requireAuth, profileController.rateExistingGame);
app.get('/profile/:identifier/games/:gameEntry', requireAuth, profileController.profileGameShowcase);
app.get('/profile/:identifier/stats', requireAuth, profileController.profileStats);
app.get('/profile/:identifier/games', requireAuth, profileController.profileGames);
app.get('/profile/:identifier/badges', requireAuth, profileController.profileBadges);
app.get('/profile/:identifier/waitlist', requireAuth, profileController.profileWaitlist);
app.get('/profile/:identifier', requireAuth, (req, res) => {
    const slug = req.params.identifier;
    return res.redirect(`/profile/${slug}/stats`);
});
app.put('/gameEntry/:id', requireAuth, profileController.updateGameEntry);
app.delete('/gameEntry/:id', requireAuth, profileController.deleteGameEntry);
app.get('/welcome', requireAuth, (req, res) => {
    res.redirect('/');
});

app.get("/users", requireAuth, profileController.getAllUsers);
app.get('/users/search', requireAuth, profileController.searchUsers);
app.get('/users/:id/profile-image', profileController.getProfileImage);
app.post('/users/:id/follow', requireAuth, profileController.followUser);
app.post('/users/:id/unfollow', requireAuth, profileController.unfollowUser);
app.post('/users/clear-new-followers', requireAuth, profileController.clearNewFollowers);
app.get('/users/:id', requireAuth, (req, res) => {
    res.redirect('/profileBadges/' + req.params.id);
});
app.get('/users/:id/followers', requireAuth, profileController.viewFollowers);
app.get('/users/:id/following', requireAuth, profileController.viewFollowing);

app.get('/messages', requireAuth, messagesController.listThreads);
app.get('/messages/modal', requireAuth, messagesController.renderModal);
app.get('/inbox/modal', requireAuth, messagesController.renderInboxModal);
app.get('/messages/:id', requireAuth, messagesController.viewThread);
app.post('/messages/start/:id', requireAuth, messagesController.startThread);
app.post('/messages/thread/:userId', requireAuth, messagesController.getOrCreateThread);
app.post('/messages/:id/send', requireAuth, messagesController.sendMessage);

app.get('/tutorial', requireAuth, homeController.showTutorial);

app.get('/about', requireAuth, homeController.showAbout);


app.get('/projects', requireAuth, projectsController.getProjects);
app.get('/newProject', requireAuth, projectsController.getNewProject);

app.get('/social', socialController.showMostCheckedIn);
app.get('/games', gamesController.listGames);
app.get('/teams/search', gamesController.searchTeams);
app.get('/games/searchGames', gamesController.searchGames);
app.get('/pastGames/leagues', gamesController.listPastGameLeagues);
app.get('/pastGames/seasons', gamesController.listPastGameSeasons);
app.get('/pastGames/teams', gamesController.listPastGameTeams);
app.get('/pastGames/search', gamesController.searchPastGames);
app.get('/games/:gameId/coordination', requireAuth, coordinationController.getCoordination);
app.post('/games/:gameId/invite', requireAuth, coordinationController.inviteUser);
app.post('/games/:gameId/respond', requireAuth, coordinationController.respondToInvite);
app.get('/users/invites/queued', requireAuthJson, coordinationController.getQueuedInvites);
app.get('/games/:gameId/chat', requireAuth, coordinationController.getChatMessages);
app.post('/games/:gameId/chat', requireAuth, coordinationController.postChatMessage);
app.get('/pastGames/:id', gamesController.showPastGame);
app.get('/games/:id', gamesController.showGame);
app.get('/team/:id', async (req, res) => {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).send('Team not found');

    const games = await Game.find({
        $or: [{ homeTeam: team._id }, { awayTeam: team._id }]
    }).populate('homeTeam awayTeam');

    const upcomingGames = games
        .filter(g => g.startDate && g.startDate > new Date())
        .sort((a, b) => a.startDate - b.startDate);

    const pastGames = await PastGame.find({
        $or: [{ HomeId: team.teamId }, { AwayId: team.teamId }]
    }).select('_id gameId Id');
    const pastGameIds = pastGames
        .map(pg => Number(pg.gameId ?? pg.Id))
        .filter(Number.isFinite);
    const pastGameObjectIds = pastGames.map(pg => pg._id);
    let averageElo = 'N/A';
    if (pastGameIds.length) {
        const eloAgg = await User.aggregate([
            { $unwind: '$gameElo' },
            {
                $match: {
                    'gameElo.elo': { $ne: null },
                    $or: [
                        { 'gameElo.gameId': { $in: pastGameIds } },
                        { 'gameElo.game': { $in: pastGameObjectIds } }
                    ]
                }
            },
            { $group: { _id: null, avgElo: { $avg: '$gameElo.elo' } } }
        ]);
        if (eloAgg.length && eloAgg[0].avgElo != null) {
            const rating = ((eloAgg[0].avgElo - 1000) / 1000) * 9 + 1;
            averageElo = rating.toFixed(1);
        }
    }

    const gameIds = games.map(g => String(g.gameId));
    const usersCheckedIn = await User.countDocuments({
        gameEntries: { $elemMatch: { gameId: { $in: gameIds }, checkedIn: true } }
    });

    const relevantBadges = await Badge.find({
        $or: [
            { teamConstraints: { $exists: false } },
            { teamConstraints: { $size: 0 } },
            { teamConstraints: { $in: [String(team._id)] } }
        ]
    });

    res.render('team', {
        team,
        upcomingGames,
        averageElo,
        usersCheckedIn,
        relevantBadges
    });
});
app.get('/badge/:id', badgeController.showBadge);
app.post('/api/nearbyGameCheckin', gamesController.nearbyGameCheckin);
app.post('/api/checkin', gamesController.apiCheckIn);
app.post('/games/:id/checkin', gamesController.checkIn);
app.post('/games/:id/wishlist', requireAuth, gamesController.toggleWishlist);
app.post('/games/:id/list', requireAuth, gamesController.toggleGameList);
app.post('/teams/:id/list', requireAuth, gamesController.toggleTeamList);
app.post('/venues/:id/list', requireAuth, gamesController.toggleVenueList);

app.get('/venues', venuesController.listVenues);

app.get('/compare', requireAuth, (req,res)=>{ res.render('compare'); });
app.get('/nextComparison', requireAuth, comparisonController.getNextComparisonCandidate);
app.post('/submitComparison', requireAuth, comparisonController.submit);


app.use(homeController.logRequestPaths);
app.use(errorController.noPageFound);
app.use(errorController.respondInternalError);

app.listen(app.get("port"), () => {
    console.log(`Server running at http://localhost:${app.get('port')}`);
});
