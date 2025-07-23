const path = require("path");
const multer = require("multer");

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if(ext !== '.jpg' && ext !== '.jpeg') return cb(new Error('Invalid file'));
        cb(null, true);
    }
});


const jwt = require('../lib/simpleJWT');

const User = require('../models/users');
const Team = require('../models/Team');
const Game = require('../models/Game');
const PastGame = require('../models/PastGame');
const Venue = require('../models/Venue');

async function enrichGameEntries(entries){
    if(!entries || !entries.length) return [];
    const ids = entries.map(e => e.game).filter(Boolean);
    const pastGames = await PastGame.find({ _id: { $in: ids } }).lean();
    const teamIds = [...new Set(pastGames.flatMap(g => [g.HomeId, g.AwayId]))];
    const teams = await Team.find({ teamId: { $in: teamIds } }).select('teamId logos color alternateColor').lean();
    const teamMap = {};
    teams.forEach(t => { teamMap[t.teamId] = t; });
    const pgMap = {};
    pastGames.forEach(pg => {
        pg.homeTeam = teamMap[pg.HomeId] || null;
        pg.awayTeam = teamMap[pg.AwayId] || null;
        pgMap[String(pg._id)] = pg;
    });
    return entries.map(e => {
        const entryObj = e.toObject ? e.toObject() : { ...e };
        entryObj.game = pgMap[String(e.game)] || null;
        return entryObj;
    });
}

exports.getSignUp = async (req, res, next) => {
    try {
        const teams = await Team.find();
        res.render('contact', { layout: false, teams });
    } catch (err) {
        next(err);
    }
};

exports.getLogin = (req, res) => {
    res.render('login', { layout: false });
};

exports.saveUser = async (req, res, next) => {
    const { username, email, phoneNumber, password, favoriteTeams } = req.body;
    try {
        const fav = favoriteTeams ? (Array.isArray(favoriteTeams) ? favoriteTeams : [favoriteTeams]) : [];
        if (fav.length === 0) {
            const teams = await Team.find();
            return res.status(400).render('contact', { layout: false, teams, error: 'Please select at least one favorite team.' });
        }
        const newUser = new User({ username, email, phoneNumber, password, favoriteTeams: fav });
        await newUser.save();
        const token = jwt.sign({ id: newUser._id, username: newUser.username, email: newUser.email, phoneNumber: newUser.phoneNumber }, 'secret');
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/');
    } catch (error) {
        if (error.name === 'ValidationError') {
            const teams = await Team.find();
            return res.status(400).render('contact', { layout: false, teams, error: error.message });
        }
        next(error);
    }
};

exports.loginUser = async (req, res, next) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.redirect('/login');
        const match = await user.comparePassword(password);
        if (!match) return res.redirect('/login');
        const token = jwt.sign({ id: user._id, username: user.username, email: user.email, phoneNumber: user.phoneNumber }, 'secret');
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/');
    } catch (error) {
        next(error);
    }
};



exports.getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('favoriteTeams')
            .populate({
                path: 'gameEntries.game',
                populate: ['homeTeam', 'awayTeam']
            })
            .populate({
                path: 'wishlist',
                populate: ['homeTeam', 'awayTeam']
            })
            .populate({ path: 'gamesList', populate: ['homeTeam','awayTeam'] });
            
        if (!user) return res.redirect('/login');

        const wishlistGames = user.wishlist || [];
        const gameEntriesRaw = user.gameEntries || [];
        let enrichedEntries = [];
        if(gameEntriesRaw.length){
            enrichedEntries = await enrichGameEntries(gameEntriesRaw);
        }

        const ratingMap = {};
        if(user.gameEntries){
            user.gameEntries.forEach(e=>{ ratingMap[String(e.game)] = e.rating; });
        }
        if(user.gamesList){
            user.gamesList.forEach(g=>{ g.userRating = ratingMap[String(g._id)]; });
        }
        res.render('profile', {
            user,
            isCurrentUser: true,
            isFollowing: false,
            viewer: req.user,
            wishlistGames,
            gamesList: user.gamesList,
            gameEntries: enrichedEntries
        });
    } catch (err) {
        next(err);
    }
};

exports.getEditProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).populate('favoriteTeams');
        if (!user) return res.redirect('/login');
        const teams = await Team.find();
        res.render('editProfile', { user, teams });
    } catch (err) {
        next(err);
    }
};

exports.updateProfile = [upload.single('profileImage'), async (req, res, next) => {
    try {
        const { username, email, phoneNumber, favoriteTeams } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.redirect('/login');
        user.username = username;
        user.email = email;
        user.phoneNumber = phoneNumber;
        user.favoriteTeams = favoriteTeams ? (Array.isArray(favoriteTeams) ? favoriteTeams : [favoriteTeams]) : [];
        if(req.file){
            user.profileImage = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }
        await user.save();
        const token = jwt.sign({ id: user._id, username: user.username, email: user.email, phoneNumber: user.phoneNumber }, 'secret');
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/profile');
    } catch (err) {
        next(err);
    }
}];
exports.uploadProfilePhoto = [upload.single("profileImage"), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image" });
        const user = await User.findById(req.user.id);
        user.profileImage = {
            data: req.file.buffer,
            contentType: req.file.mimetype
        };
        await user.save();
        const token = jwt.sign({ id: user._id, username: user.username, email: user.email, phoneNumber: user.phoneNumber }, "secret");
        res.cookie("token", token, { httpOnly: true });
        res.json({ imageData: "data:" + user.profileImage.contentType + ";base64," + user.profileImage.data.toString('base64') });
    } catch (err) {
        next(err);
    }
}];

exports.getProfileImage = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('profileImage');
        if(!user || !user.profileImage || !user.profileImage.data){
            const fs = require('fs');
            const imgPath = path.join(__dirname, '../public/images/placeholder.jpg');
            return fs.promises.readFile(imgPath).then(data => {
                res.contentType('image/jpeg');
                res.send(data);
            });
        }
        res.contentType(user.profileImage.contentType);
        res.send(user.profileImage.data);
    } catch(err){
        next(err);
    }
};



exports.getAllUsers = async (req, res, next) => {
    try{
        const users = await User.find().populate('favoriteTeams');
        res.render("users", {users});
    } catch (error) {
        next(error);
    }

};

// Search users by username
exports.searchUsers = async (req, res, next) => {
    try {
        const q = req.query.q || '';
        if (!q) return res.json([]);
        const users = await User.find({ username: { $regex: q, $options: 'i' } })
        .select('username profileImage followers followersCount followingCount');
        res.json(users);
    } catch (err) {
        next(err);
    }
};

// View another user's profile
exports.viewUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id)
            .populate('favoriteTeams')
            .populate({
                path: 'gameEntries.game',
                populate: ['homeTeam','awayTeam']
            })
            .populate({
                path: 'wishlist',
                populate: ['homeTeam','awayTeam']
            })
            .populate({ path: 'gamesList', populate: ['homeTeam','awayTeam'] });
        if (!user) return res.redirect('/profile');

        const wishlistGames = user.wishlist || [];
        const gameEntriesRaw = user.gameEntries || [];
        let enrichedEntries = [];
        if(gameEntriesRaw.length){
            enrichedEntries = await enrichGameEntries(gameEntriesRaw);
        }
        const isCurrentUser = req.user && String(req.user.id) === String(user._id);
        let isFollowing = false, canMessage = false;
        if(req.user){
            const viewer = await User.findById(req.user.id);
            isFollowing = viewer.following.some(f => String(f) === String(user._id));
            const followsBack = user.following.some(f => String(f) === String(viewer._id));
            canMessage = isFollowing && followsBack;
        }
        const ratingMap = {};
        if(user.gameEntries){
            user.gameEntries.forEach(e=>{ ratingMap[String(e.game)] = e.rating; });
        }
        if(user.gamesList){
            user.gamesList.forEach(g=>{ g.userRating = ratingMap[String(g._id)]; });
        }
        res.render("profile", {
            user,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            wishlistGames,
            gamesList: user.gamesList,
            gameEntries: enrichedEntries
        });
    } catch (err) {
        next(err);
    }
};

// Follow a user
exports.followUser = async (req, res, next) => {
    try {
        const targetId = req.params.id;
        const currentId = req.user.id;
        if (targetId === currentId) return res.status(400).json({ error: 'Cannot follow yourself' });
        const [currentUser, targetUser] = await Promise.all([
            User.findById(currentId),
            User.findById(targetId)
        ]);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (currentUser.following.some(f => String(f) === targetId)) {
            return res.status(400).json({ error: 'Already following' });
        }
        currentUser.following.push(targetId);
        currentUser.followingCount = currentUser.following.length;
        targetUser.followers.push(currentId);
        targetUser.followersCount = targetUser.followers.length;
        await Promise.all([currentUser.save(), targetUser.save()]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// Unfollow a user
exports.unfollowUser = async (req, res, next) => {
    try {
        const targetId = req.params.id;
        const currentId = req.user.id;
        const [currentUser, targetUser] = await Promise.all([
            User.findById(currentId),
            User.findById(targetId)
        ]);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        currentUser.following = currentUser.following.filter(f => String(f) !== targetId);
        currentUser.followingCount = currentUser.following.length;
        targetUser.followers = targetUser.followers.filter(f => String(f) !== currentId);
        targetUser.followersCount = targetUser.followers.length;
        await Promise.all([currentUser.save(), targetUser.save()]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// View followers list
exports.viewFollowers = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).populate('followers');
        if (!user) return res.redirect('/profile');
        res.render('followList', { title: 'Followers', users: user.followers });
    } catch (err) {
        next(err);
    }
};

// View following list
exports.viewFollowing = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).populate('following');
        if (!user) return res.redirect('/profile');
        res.render('followList', { title: 'Following', users: user.following });
    } catch (err) {
        next(err);
    }
};

exports.setLocation = async (req, res, next) => {
    try {
        if(!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { latitude, longitude } = req.body;
        await User.findByIdAndUpdate(req.user.id, {
            location: { latitude, longitude, updatedAt: new Date() }
        });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

exports.addGame = [upload.single('photo'), async (req, res, next) => {
    try {
        const { gameId, rating, comment } = req.body;

        const pastGame = await PastGame.findById(gameId);
        if(!pastGame) return res.status(400).redirect('/profile');

        const [game, homeTeam, awayTeam, venue, user] = await Promise.all([
            Game.findOne({ gameId: pastGame.Id }),
            Team.findOne({ teamId: pastGame.HomeId }),
            Team.findOne({ teamId: pastGame.AwayId }),
            Venue.findOne({ venueId: pastGame.VenueId }),
            User.findById(req.user.id)
        ]);

        if(!user) return res.status(400).redirect('/profile');

        const addSet = {};
        if(game) addSet.gamesList = game._id;
        const teamIds = [];
        if(homeTeam) teamIds.push(homeTeam._id);
        if(awayTeam) teamIds.push(awayTeam._id);
        if(teamIds.length) addSet.teamsList = { $each: teamIds };
        if(venue) addSet.venuesList = venue._id;

        if(Object.keys(addSet).length){
            await User.updateOne({ _id: user._id }, { $addToSet: addSet });
        }

        const rateNum = parseFloat(rating);
        if(!isNaN(rateNum)){
            if(game){
                game.ratings = game.ratings || [];
                game.ratings.push(rateNum);
                await game.save();
            }
            pastGame.ratings = pastGame.ratings || [];
            pastGame.ratings.push(rateNum);
            await pastGame.save();
        }

        if(!user.gameEntries) user.gameEntries = [];
        const entryId = game ? game._id : pastGame._id;
        let entry = user.gameEntries.find(e => String(e.game) === String(entryId));
        if(!entry){
            entry = { game: entryId };
            user.gameEntries.push(entry);
        }
        if(!isNaN(rateNum)) entry.rating = rateNum;
        if(comment) entry.comment = comment;
        if(req.file){
            entry.photo = { data: req.file.buffer, contentType: req.file.mimetype };
        }

        await user.save();
        res.redirect('/profile');
    } catch(err){
        next(err);
    }
}];
