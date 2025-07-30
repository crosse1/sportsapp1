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
    comparisonController = require('./controllers/comparisonController'),
    Message = require('./models/Message'),
    User = require('./models/users'),
    layouts = require('express-ejs-layouts'),
    mongoose = require('mongoose'),
    cookieParser = require('cookie-parser'),
    path = require('path'),

    jwt = require('./lib/simpleJWT');



mongoose.connect(
    "mongodb+srv://crosse:Zack0018@christiancluster.0ejv5.mongodb.net/appUsers?retryWrites=true&w=majority&appName=ChristianCluster"
);

const db = mongoose.connection;
db.once("open", () => {
    console.log('Connected to MongoDB');
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

// Middleware to authenticate token
app.use(async (req, res, next) => {
    const token = req.cookies.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, 'secret');
            const userDoc = await User.findById(decoded.id).lean();
            if (userDoc) {
                req.user = {
                    id: String(userDoc._id),
                    username: userDoc.username,
                    email: userDoc.email,
                    phoneNumber: userDoc.phoneNumber,
                    profileImage: userDoc.profileImage,
                    newFollowers: userDoc.newFollowers || []
                };
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
    if (req.user) {
        const hasUnread = await Message.exists({ participants: req.user.id, unreadBy: req.user.id });
        res.locals.hasUnreadMessages = !!hasUnread;
        res.locals.newFollowers = req.user.newFollowers || [];
        res.locals.hasNewFollowers = res.locals.newFollowers.length > 0;
    } else {
        res.locals.hasUnreadMessages = false;
        res.locals.hasNewFollowers = false;
        res.locals.newFollowers = [];
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
      next();
    } catch (err) {
      console.error('[AUTH ERROR]', err);
      return res.redirect('/login');
    }
  };

// Public landing page
app.get('/', homeController.index);
app.get('/signup', profileController.getSignUp);
app.get('/login', profileController.getLogin);
app.post('/signup', profileController.saveUser);
app.post('/login', profileController.loginUser);
app.get("/check-username/:username", profileController.checkUsername);
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});
app.get('/thanks', requireAuth, (req, res) => { res.redirect('/profileBadges/' + req.user.id); });
app.get('/profile', requireAuth, (req, res) => { res.redirect('/profileBadges/' + req.user.id); });
app.get('/profileBadges/:user?', requireAuth, profileController.profileBadges);
app.get('/profileGames/:user?', requireAuth, profileController.profileGames);
app.get('/profileStats/:user?', requireAuth, profileController.profileStats);
app.get('/profileWaitlist/:user?', requireAuth, profileController.profileWaitlist);
app.get('/profile/edit', requireAuth, profileController.getEditProfile);
app.post('/profile/edit', requireAuth, profileController.updateProfile);
app.post('/profile/photo', requireAuth, profileController.uploadProfilePhoto);
app.post('/profile/location', requireAuth, profileController.setLocation);
app.post('/profile/games', requireAuth, profileController.addGame);
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

app.get('/games', gamesController.listGames);
app.get('/teams/search', gamesController.searchTeams);
app.get('/games/searchGames', gamesController.searchGames);
app.get('/pastGames/leagues', gamesController.listPastGameLeagues);
app.get('/pastGames/seasons', gamesController.listPastGameSeasons);
app.get('/pastGames/teams', gamesController.listPastGameTeams);
app.get('/pastGames/search', gamesController.searchPastGames);
app.get('/pastGames/:id', gamesController.showPastGame);
app.get('/games/:id', gamesController.showGame);
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
