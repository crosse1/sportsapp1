"use strict";

const express = require("express"),
    app = express(),
    errorController = require("./controllers/errorController"),
    homeController = require("./controllers/homeController"),
    profileController = require("./controllers/profileController"),
    projectsController = require("./controllers/projectsController"),
    layouts = require('express-ejs-layouts'),
    mongoose = require('mongoose'),
    cookieParser = require('cookie-parser'),

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
app.use((req, res, next) => {
    const token = req.cookies.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, 'secret');
            req.user = decoded;
        } catch (err) {
            req.user = null;
        }
    } else {
        req.user = null;
    }
    res.locals.user = req.user;
    next();
});

const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.redirect('/login');
    }
    next();
};

// Public landing page
app.get('/', homeController.index);
app.get('/signup', profileController.getSignUp);
app.get('/login', profileController.getLogin);
app.post('/signup', profileController.saveUser);
app.post('/login', profileController.loginUser);
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});
app.get('/thanks', requireAuth, profileController.getProfile);
app.get('/profile', requireAuth, profileController.getProfile);
app.get('/profile/edit', requireAuth, profileController.getEditProfile);
app.post('/profile/edit', requireAuth, profileController.updateProfile);
app.get('/welcome', requireAuth, homeController.showWelcome);

app.get("/users", requireAuth, profileController.getAllUsers);

app.get('/tutorial', requireAuth, homeController.showTutorial);

app.get('/about', requireAuth, homeController.showAbout);


app.get('/projects', requireAuth, projectsController.getProjects);
app.get('/newProject', requireAuth, projectsController.getNewProject);


app.use(homeController.logRequestPaths);
app.use(errorController.noPageFound);
app.use(errorController.respondInternalError);

app.listen(app.get("port"), () => {
    console.log(`Server running at http://localhost:${app.get('port')}`);
});
