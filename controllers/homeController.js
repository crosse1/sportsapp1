
exports.index = (req, res) => {
    res.render("index");
};

exports.logRequestPaths = (req, res, next) => {
    console.log(`request made to: ${req.url}`);
    next();
}

exports.showProfile = (req, res) => {
    res.render("profile");
};



exports.showAbout = (req, res) => {
    res.render("about");
};

exports.showTutorial = (req, res) => {
    res.render("tutorial");
};

exports.showWelcome = (req, res) => {
    res.render("welcome");
};