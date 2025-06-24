"use strict";

const express = require("express"),
    app = express(),
    errorController = require("./controllers/errorController"),
    homeController = require("./controllers/homeController"),
    profileController = require("./controllers/profileController"),
    projectsController = require("./controllers/projectsController"),
    layouts = require('express-ejs-layouts'),
    mongoose = require('mongoose');

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
app.use(express.urlencoded({
    extended:false,
})
);

app.use(express.json());

app.get('/', homeController.index);
app.get('/contact', profileController.getSignIn);
app.get('/thanks', profileController.getProfile);

app.get("/users", profileController.getAllUsers);

app.get('/tutorial', homeController.showTutorial);

app.get('/about', homeController.showAbout);


app.post('/thanks', profileController.saveUser);

app.get('/projects', projectsController.getProjects);
app.get('/newProject', projectsController.getNewProject);


app.use(homeController.logRequestPaths);
app.use(errorController.noPageFound);
app.use(errorController.respondInternalError);

app.listen(app.get("port"), () => {
    console.log(`Server running at http://localhost:${app.get('port')}`);
});