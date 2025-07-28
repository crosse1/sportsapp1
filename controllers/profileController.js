const path = require("path");
const multer = require("multer");
const mongoose = require('mongoose');
const toObjectId = id => new mongoose.Types.ObjectId(id);

const memoryStorage = multer.memoryStorage();
const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + ext);
    }
});

const uploadMemory = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if(ext !== '.jpg' && ext !== '.jpeg') return cb(new Error('Invalid file'));
        cb(null, true);
    }
});

const uploadDisk = multer({
    storage: diskStorage,
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
const getStateFromCoordinates = require('../lib/stateLookup');

function sanitizeComment(text) {
    if (!text) return '';
    const badWords = [
        'fuck', 'shit', 'damn', 'bitch', 'asshole', 'bastard',
        'dick', 'crap', 'slut'
    ];
    let result = text;
    for (const word of badWords) {
        const re = new RegExp(`\\b${word}\\b`, 'gi');
        result = result.replace(re, match => '*'.repeat(match.length));
    }
    return result;
}

async function enrichGameEntries(entries){
    if(!entries || !entries.length) return [];
    const ids = entries.map(e => e.game).filter(Boolean);
    const pastGames = await PastGame.find({ _id: { $in: ids } }).lean();
    console.log('Entry Game IDs:', ids);
    console.log('Found PastGame IDs:', pastGames.map(g => String(g._id)));

    const teamIds = [...new Set(pastGames.flatMap(g => [g.HomeId, g.AwayId]))];
    const teams = await Team.find({ teamId: { $in: teamIds } })
        .select('teamId logos color alternateColor')
        .lean();
    const teamMap = {};
    teams.forEach(t => { teamMap[t.teamId] = t; });

    const venueIds = [...new Set(pastGames.map(g => g.VenueId).filter(v => v !== undefined))];
    const venues = await Venue.find({ venueId: { $in: venueIds } }).lean();
    const venueMap = {};
    venues.forEach(v => { venueMap[v.venueId] = v; });

    const pgMap = {};
    pastGames.forEach(pg => {
        pg.homeTeam = teamMap[pg.HomeId] || null;
        pg.awayTeam = teamMap[pg.AwayId] || null;
        pg.venue = venueMap[pg.VenueId] || null;
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

exports.saveUser = [uploadMemory.single('profileImage'), async (req, res, next) => {
    const { username, email, phoneNumber, password, favoriteTeams } = req.body;
    try {
        if(!req.file){
            const teams = await Team.find();
            return res.status(400).render('contact', { layout:false, teams, error:'Profile picture is required.' });
        }
        const fav = favoriteTeams ? (Array.isArray(favoriteTeams) ? favoriteTeams : [favoriteTeams]) : [];
        if (fav.length === 0) {
            const teams = await Team.find();
            return res.status(400).render('contact', { layout: false, teams, error: 'Please select at least one favorite team.' });
        }
        const newUser = new User({
            username,
            email,
            phoneNumber,
            password,
            favoriteTeams: fav,
            profileImage:{ data:req.file.buffer, contentType:req.file.mimetype }
        });
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
}];

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
            canMessage: false,
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

exports.updateProfile = [uploadMemory.single('profileImage'), async (req, res, next) => {
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
        res.redirect('/profileBadges/' + user._id);
    } catch (err) {
        next(err);
    }
}];
exports.uploadProfilePhoto = [uploadMemory.single("profileImage"), async (req, res, next) => {
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

exports.profileBadges = async (req, res, next) => {
    try {
        const userId = req.params.user || req.user.id;
        const profileUser = await User.findById(userId).populate('favoriteTeams');
        if (!profileUser) return res.redirect('/profileBadges/' + req.user.id);
        const isCurrentUser = req.user && req.user.id.toString() === profileUser._id.toString();
        let isFollowing = false, canMessage = false;
        if (req.user && !isCurrentUser) {
            const viewer = await User.findById(req.user.id);
            isFollowing = viewer.following.some(f => String(f) === String(profileUser._id));
            const followsBack = profileUser.following.some(f => String(f) === String(viewer._id));
            canMessage = isFollowing && followsBack;
        }
        res.render('profileBadges', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            activeTab: 'badges'
        });
    } catch (err) {
        next(err);
    }
};

exports.profileStats = async (req, res, next) => {
    try {
        const userId = req.params.user || req.user.id;
        console.log('[profileStats] Requested User ID:', userId);

        const profileUser = await User.findById(userId)
            .populate('favoriteTeams')
            .populate('teamsList')
            .populate('venuesList');

        if (!profileUser) {
            console.warn('[profileStats] No user found, redirecting to self');
            return res.redirect('/profileStats/' + req.user.id);
        }

        console.log(`[profileStats] Found user: ${profileUser.username} (${profileUser._id})`);
        console.log(`[profileStats] teamsList count: ${profileUser.teamsList?.length}`);
        console.log(`[profileStats] venuesList count: ${profileUser.venuesList?.length}`);

        const isCurrentUser = req.user && req.user.id.toString() === profileUser._id.toString();

        let isFollowing = false, canMessage = false;
        if (req.user && !isCurrentUser) {
            const viewer = await User.findById(req.user.id);
            isFollowing = viewer.following.some(f => String(f) === String(profileUser._id));
            const followsBack = profileUser.following.some(f => String(f) === String(viewer._id));
            canMessage = isFollowing && followsBack;
        }

        const enrichedEntries = await enrichGameEntries(profileUser.gameEntries || []);

        const topRatedGames = enrichedEntries
            .filter(e => e.game && e.game._id)
            .map(e => {
                const game = e.game;
                const rating = typeof e.rating === 'number' ? e.rating : 0;
                const gameDate = game.startDate || game.StartDate || null;
                const awayLogo = (game.awayTeam && game.awayTeam.logos && game.awayTeam.logos[0]) ?
                    game.awayTeam.logos[0] : '/images/placeholder.jpg';
                const homeLogo = (game.homeTeam && game.homeTeam.logos && game.homeTeam.logos[0]) ?
                    game.homeTeam.logos[0] : '/images/placeholder.jpg';
                return { _id: game._id, gameDate, awayTeamLogoUrl: awayLogo, homeTeamLogoUrl: homeLogo, rating };
            })
            .sort((a,b) => b.rating - a.rating)
            .slice(0,3);

        const uniqueTeamIds = [...new Set((profileUser.teamsList || []).map(t => String(t._id || t)))];
        const uniqueVenueIds = [...new Set((profileUser.venuesList || []).map(v => String(v._id || v)))];

        console.log('[profileStats] Unique Team IDs:', uniqueTeamIds);
        console.log('[profileStats] Unique Venue IDs:', uniqueVenueIds);

        const teamsCount = uniqueTeamIds.length;
        const venuesCount = uniqueVenueIds.length;

        const statesVisited = new Set();
        for (const v of profileUser.venuesList || []) {
            let state = v.state;
            if (!state && v.coordinates && Array.isArray(v.coordinates.coordinates)) {
                const [lon, lat] = v.coordinates.coordinates;
                state = getStateFromCoordinates(lat, lon);
                console.log(`[profileStats] Converted coordinates (${lat}, ${lon}) to state: ${state}`);
            } else {
                console.log(`[profileStats] Venue already has state: ${state}`);
            }
            if (state) statesVisited.add(state);
        }

        const statesCount = statesVisited.size;
        console.log('[profileStats] States visited:', [...statesVisited]);
        console.log('[profileStats] Count of unique states:', statesCount);

        res.render('profileStats', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            activeTab: 'stats',
            gameEntries: enrichedEntries,
            topRatedGames,
            teamsList: profileUser.teamsList || [],
            venuesList: profileUser.venuesList || [],
            teamsCount,
            venuesCount,
            statesCount
        });
    } catch (err) {
        console.error('[profileStats] Error occurred:', err);
        next(err);
    }
};


exports.profileGames = async (req, res, next) => {
    try {
        const userId = req.params.user || req.user.id;
        const profileUser = await User.findById(userId).populate('favoriteTeams');
        if (!profileUser) return res.redirect('/profileGames/' + req.user.id);
        const gameEntriesRaw = profileUser.gameEntries || [];
        let enrichedEntries = [];
        if (gameEntriesRaw.length) {
            enrichedEntries = await enrichGameEntries(gameEntriesRaw);
            enrichedEntries.sort((a, b) => {
                const da = a.game && (a.game.startDate || a.game.StartDate);
                const db = b.game && (b.game.startDate || b.game.StartDate);
                return new Date(db) - new Date(da);
            });
        }
        const isCurrentUser = req.user && req.user.id.toString() === profileUser._id.toString();
        let isFollowing = false, canMessage = false;
        if (req.user && !isCurrentUser) {
            const viewer = await User.findById(req.user.id);
            isFollowing = viewer.following.some(f => String(f) === String(profileUser._id));
            const followsBack = profileUser.following.some(f => String(f) === String(viewer._id));
            canMessage = isFollowing && followsBack;
        }
        res.render('profileGames', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            activeTab: 'games',
            gameEntries: enrichedEntries,
            usePastGameLinks: true
        });
    } catch (err) {
        next(err);
    }
};

exports.profileWaitlist = async (req, res, next) => {
    try {
        const userId = req.params.user || req.user.id;
        const profileUser = await User.findById(userId)
            .populate('favoriteTeams')
            .populate({ path: 'wishlist', populate: ['homeTeam', 'awayTeam'] });
        if (!profileUser) return res.redirect('/profileWaitlist/' + req.user.id);
        const isCurrentUser = req.user && req.user.id.toString() === profileUser._id.toString();
        let isFollowing = false, canMessage = false;
        if (req.user && !isCurrentUser) {
            const viewer = await User.findById(req.user.id);
            isFollowing = viewer.following.some(f => String(f) === String(profileUser._id));
            const followsBack = profileUser.following.some(f => String(f) === String(viewer._id));
            canMessage = isFollowing && followsBack;
        }
        res.render('profileWaitlist', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            activeTab: 'waitlist',
            wishlistGames: profileUser.wishlist || [],
            
            usePastGameLinks: false
        });
    } catch (err) {
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
                path: 'wishlist',
                populate: ['homeTeam','awayTeam']
            })
            .populate({ path: 'gamesList', populate: ['homeTeam','awayTeam'] });
        if (!user) return res.redirect('/profile');

        if(req.user){
            await User.findByIdAndUpdate(req.user.id, { $pull: { newFollowers: user._id } });
            if(req.user.newFollowers){
                req.user.newFollowers = req.user.newFollowers.filter(f => String(f) !== String(user._id));
            }
        }

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
        if(!targetUser.newFollowers.some(f=>String(f)===currentId)){
            targetUser.newFollowers.push(currentId);
        }
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
        targetUser.newFollowers = targetUser.newFollowers.filter(f => String(f) !== currentId);
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

exports.clearNewFollowers = async (req, res, next) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { newFollowers: [] });
        req.user.newFollowers = [];
        res.json({ success: true });
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

exports.addGame = [uploadDisk.single('photo'), async (req, res, next) => {
    try {
        const { gameId, rating, comment } = req.body;

        const sanitizedComment = sanitizeComment(comment || '');

        const user = await User.findById(req.user.id);
        if (!user) return res.redirect('/login');

        const entry = {
            game: gameId,
            rating: parseFloat(rating),
            comment: sanitizedComment || null,
            image: req.file ? '/uploads/' + req.file.filename : null
        };

        if (!user.gameEntries) user.gameEntries = [];

        const alreadyExists = user.gameEntries.some(e => String(e.game) === String(gameId));
        if (alreadyExists) {
            const enrichedEntries = await enrichGameEntries(user.gameEntries);
            return res.status(400).render('profileGames', {
                user,
                isCurrentUser: true,
                isFollowing: false,
                canMessage: false,
                viewer: req.user,
                activeTab: 'games',
                gameEntries: enrichedEntries,
                error: 'You’ve already entered a rating for this game.'
            });
        }
        
        user.gameEntries.push(entry);

        // Look up the past game to infer teams and venue
        const pastGameDoc = await PastGame.findById(gameId);

        if (pastGameDoc) {
            let updated = false;
            const rated = pastGameDoc.ratings.some(r => String(r.userId) === String(user._id));
            if (!rated) {
                pastGameDoc.ratings.push({ userId: user._id, rating: parseFloat(rating) });
                updated = true;
            }
            const reviewed = pastGameDoc.comments.some(c => String(c.userId) === String(user._id));
            if (!reviewed && sanitizedComment) {
                pastGameDoc.comments.push({ userId: user._id, comment: sanitizedComment });
                updated = true;
            }
            if (updated) {
                await pastGameDoc.save();
            }
        }

        const pastGame = pastGameDoc ? pastGameDoc.toObject() : null;

        const teamsToAdd = [];
        const venuesToAdd = [];

        if (pastGame) {
            if (pastGame.HomeId) {
                const homeTeam = await Team.findOne({ teamId: pastGame.HomeId }).select('_id');
                if (homeTeam) teamsToAdd.push(String(homeTeam._id));
            }
            if (pastGame.AwayId) {
                const awayTeam = await Team.findOne({ teamId: pastGame.AwayId }).select('_id');
                if (awayTeam) teamsToAdd.push(String(awayTeam._id));
            }
            if (pastGame.VenueId) {
                const venue = await Venue.findOne({ venueId: pastGame.VenueId }).select('_id');
                if (venue) venuesToAdd.push(String(venue._id));
            }
        }

        // Dedupe and cast to ObjectId
        user.teamsList = [
            ...(user.teamsList || []),
            ...teamsToAdd.map(toObjectId)
        ];
        
        user.venuesList = [
            ...(user.venuesList || []),
            ...venuesToAdd.map(toObjectId)
        ];

        await user.save();
        res.redirect('/profileGames/' + user._id);
    } catch (err) {
        next(err);
    }
}];

exports.updateGameEntry = [uploadDisk.single('photo'), async (req, res, next) => {
    try {
        const entryId = req.params.id;
        const { rating, comment } = req.body;
        const sanitizedComment = sanitizeComment(comment || '');

        const user = await User.findById(req.user.id);
        if(!user) return res.status(401).json({ error:'Unauthorized' });

        const entry = user.gameEntries.id(entryId);
        if(!entry) return res.status(404).json({ error:'Entry not found' });

        entry.rating = parseFloat(rating);
        entry.comment = sanitizedComment || null;
        if(req.file){
            entry.image = '/uploads/' + req.file.filename;
        }

        const pastGameDoc = await PastGame.findById(entry.game);
        if(pastGameDoc){
            let updated = false;
            const ratingObj = pastGameDoc.ratings.find(r => String(r.userId) === String(user._id));
            if(ratingObj){
                ratingObj.rating = parseFloat(rating);
                updated = true;
            }
            const commentObj = pastGameDoc.comments.find(c => String(c.userId) === String(user._id));
            if(commentObj){
                commentObj.comment = sanitizedComment;
                updated = true;
            } else if(sanitizedComment){
                pastGameDoc.comments.push({ userId:user._id, comment:sanitizedComment });
                updated = true;
            }
            if(updated){
                await pastGameDoc.save();
            }
        }

        await user.save();

        const enriched = await enrichGameEntries([entry]);
        res.json({ success:true, entry: enriched[0] });
    } catch(err){
        next(err);
    }
}];

