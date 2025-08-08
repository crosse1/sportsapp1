const path = require("path");
const fs = require('fs');
const multer = require("multer");
const mongoose = require('mongoose');
const toObjectId = id => new mongoose.Types.ObjectId(id);
const { findEloPlacement } = require('../lib/elo');

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
const Conference = require('../models/Conference');
const GameComparison = require('../models/gameComparison');
const Badge = require('../models/Badge');
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

// Enriches an array of {game, elo} objects with full PastGame info
async function enrichEloGames(entries){
    if(!entries || !entries.length) return [];
    
    const enriched = await enrichGameEntries(entries);
    
    return enriched;
}

function ratingToElo(rating){
    const val = parseFloat(rating);
    if(isNaN(val)) return 1500;
    return Math.round(1000 + ((val - 1) / 9) * 1000);
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

exports.checkUsername = async (req, res, next) => {
    try {
        const username = req.params.username;
        const exists = await User.exists({ username: new RegExp("^" + username + "$", "i") });
        res.json({ available: !exists });
    } catch (err) {
        next(err);
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
        const eloGames = await enrichEloGames(profileUser.gameElo || []);

        // Fetch all badges and compute user's progress for each
        const badgesRaw = await Badge.find().lean();

 const teamIdsFromBadges = badgesRaw
  .map(b => b.teamConstraints || [])
  .flat()
  .filter(Boolean)
  .map(id => id.toString());

 const teamsData = await Team.find(
  { _id: { $in: teamIdsFromBadges } },
  '_id school alternateColor'
 ).lean();

 const conferences = await Conference.find({}, 'confId confName').lean();


        // Convert image buffers to base64 data URLs
        const badges = badgesRaw.map(b => {
            if (b.iconUrl && b.iconUrl.data) {
                b.iconUrl = `data:${b.iconUrl.contentType};base64,${b.iconUrl.data.toString('base64')}`;
            }
            return b;
        });

        // Gather all games the user has attended
        const gameIds = (profileUser.gameEntries || []).map(g => g.game).filter(Boolean);
        const pastGames = await PastGame.find({ _id: { $in: gameIds } }).lean();

        const userProgress = {};

        badges.forEach(badge => {
            const eligible = pastGames.filter(g => {
                const leagueMatch = !badge.leagueConstraints?.length ||
                    badge.leagueConstraints.some(l => [String(g.homeLeagueId), String(g.awayLeagueId)].includes(String(l)));
                const teamMatch = !badge.teamConstraints?.length ||
                    badge.teamConstraints.some(t => {
                        if (badge.homeTeamOnly) return String(g.HomeId) === String(t);
                        return [String(g.HomeId), String(g.AwayId)].includes(String(t));
                    });
                const confMatch = !badge.conferenceConstraints?.length ||
                    badge.conferenceConstraints.some(c => [String(g.homeConferenceId), String(g.awayConferenceId)].includes(String(c)));
                const startOk = !badge.startDate || g.StartDate >= badge.startDate;
                const endOk = !badge.endDate || g.StartDate <= badge.endDate;
                return leagueMatch && teamMatch && confMatch && startOk && endOk;
            });

            let progress = eligible.length;
            if (badge.oneTeamEach) {
                const teamSet = new Set();
                eligible.forEach(g => {
                    if (badge.teamConstraints && badge.teamConstraints.length) {
                        badge.teamConstraints.forEach(t => {
                            if (badge.homeTeamOnly) {
                                if (String(g.HomeId) === String(t)) teamSet.add(String(t));
                            } else if ([String(g.HomeId), String(g.AwayId)].includes(String(t))) {
                                teamSet.add(String(t));
                            }
                        });
                    } else {
                        teamSet.add(String(g.HomeId));
                        if (!badge.homeTeamOnly) teamSet.add(String(g.AwayId));
                    }
                });
                progress = teamSet.size;
            }
            userProgress[badge.badgeID] = progress;
        });

        res.render('profileBadges', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            activeTab: 'badges',
            eloGames,
            badges,
            userProgress,
            teamsData,
            conferences
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
                const rawScore = e.elo ? ((e.elo - 1000) / 1000) * 9 + 1 : 0;
                const rating = Math.max(1.0, Math.min(10.0, Math.round(rawScore * 10) / 10));
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

        console.log('[profileStats] Unique Team IDs:', uniqueTeamIds);

        // Build conference stats from precomputed map
        const mapPath = path.join(__dirname, '../conferenceTeamMap.json');
        const mapRaw = fs.readFileSync(mapPath, 'utf8');
        const conferenceTeamMap = JSON.parse(mapRaw);

        const conferenceStats = Object.entries(conferenceTeamMap).map(([name, teamIds]) => {
            const totalTeams = teamIds.length;
            const teamsUnlocked = [];
            const teamDots = [];
        
            teamIds.forEach(id => {
                const team = (profileUser.teamsList || []).find(t => String(t._id || t) === String(id));
                if (team) {
                    teamsUnlocked.push(team); // user has seen this team
                    teamDots.push({
                        unlocked: true,
                        logo: team.logos?.[0] || '/images/placeholder.jpg',
                        altColor: team.alternateColor || '#bbb'
                    });
                } else {
                    teamDots.push({ unlocked: false });
                }
            });
        
            const percentage = totalTeams ? Math.round((teamsUnlocked.length / totalTeams) * 100) : 0;
            return { name, percentage, totalTeams, teamDots };
        });

        const teamMap = {};
        for (const team of profileUser.teamsList || []) {
            const id = String(team._id || team);
            teamMap[id] = {
                logos: team.logos || [],
                alternateColor: team.alternateColor || '#bbb'
            };
        }

        // Count teams (with frequency)
        const teamFrequencyMap = {};
        for (const team of profileUser.teamsList || []) {
            const id = String(team._id || team);
            if (!teamFrequencyMap[id]) {
                teamFrequencyMap[id] = { team, count: 1 };
            } else {
                teamFrequencyMap[id].count++;
            }
        }
        const teamEntries = Object.values(teamFrequencyMap).sort((a, b) => b.count - a.count);

        // Count venues (with frequency)
        const venueFrequencyMap = {};
        for (const venue of profileUser.venuesList || []) {
            const id = String(venue._id || venue);
            if (!venueFrequencyMap[id]) {
                venueFrequencyMap[id] = { venue, count: 1 };
            } else {
                venueFrequencyMap[id].count++;
            }
        }
        const venueEntries = Object.values(venueFrequencyMap).sort((a, b) => b.count - a.count);

        // Count states (with frequency)
        const stateFrequencyMap = {};
        for (const venue of profileUser.venuesList || []) {
            let state = venue.state;
            if (!state && venue.coordinates && Array.isArray(venue.coordinates.coordinates)) {
                const [lon, lat] = venue.coordinates.coordinates;
                state = getStateFromCoordinates(lat, lon);
            }
            if (state) {
                stateFrequencyMap[state] = (stateFrequencyMap[state] || 0) + 1;
            }
        }
        const stateEntries = Object.entries(stateFrequencyMap).sort((a, b) => b[1] - a[1]);

        // Unique counts for left-side stats
        const teamsCount = teamEntries.length;
        const venuesCount = venueEntries.length;
        const statesCount = stateEntries.length;

        const eloGames = await enrichEloGames(profileUser.gameElo || []);
        res.render('profileStats', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            conferenceStats,
            viewer: req.user,
            activeTab: 'stats',
            gameEntries: enrichedEntries,
            topRatedGames,
            userTeamIds: uniqueTeamIds,
            teamsList: profileUser.teamsList || [],
            venuesList: profileUser.venuesList || [],
            teamMap,
            teamsCount,
            venuesCount,
            statesCount,
            conferenceTeamMap,
            teamEntries,
            venueEntries,
            stateEntries,
            eloGames
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
        const eloGames = await enrichEloGames(profileUser.gameElo || []);
        res.render('profileGames', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            activeTab: 'games',
            gameEntries: enrichedEntries,
            usePastGameLinks: true,
            eloGames
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
        const eloGames = await enrichEloGames(profileUser.gameElo || []);
        res.render('profileWaitlist', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            activeTab: 'waitlist',
            wishlistGames: profileUser.wishlist || [],

            usePastGameLinks: false,
            eloGames
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
        const profileUser = await User.findById(req.params.id).populate('followers');
        if (!profileUser) return res.redirect('/profile');
        const eloGames = await enrichEloGames(profileUser.gameElo || []);
        res.render('followList', {
            title: 'Followers',
            users: profileUser.followers,
            eloGames
        });
    } catch (err) {
        next(err);
    }
};

// View following list
exports.viewFollowing = async (req, res, next) => {
    try {
        const profileUser = await User.findById(req.params.id).populate('following');
        if (!profileUser) return res.redirect('/profile');
        const eloGames = await enrichEloGames(profileUser.gameElo || []);
        res.render('followList', {
            title: 'Following',
            users: profileUser.following,
            eloGames
        });
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

const { initializeEloFromRatings } = require('../lib/elo'); // or wherever it's defined

exports.addGame = [uploadDisk.single('photo'), async (req, res, next) => {
    try {
        const { gameId, rating, comment, compareGameId1, winner1, compareGameId2, winner2, compareGameId3, winner3 } = req.body;

        const sanitizedComment = sanitizeComment(comment || '');

        const user = await User.findById(req.user.id);
        if (!user) return res.redirect('/login');

        if (!user.gameEntries) user.gameEntries = [];

        const isInitial = (user.gameEntries || []).length < 5;
        let finalElo = isInitial ? ratingToElo(rating) : null;

        if (isInitial && (rating === undefined || rating === '')) {
            return res.status(400).json({ error: 'Rating required for initial games' });
        }

        const entry = {
            game: gameId,
            elo: finalElo,
            comment: sanitizedComment || null,
            image: req.file ? '/uploads/' + req.file.filename : null
        };

        const alreadyExists = user.gameEntries.some(e => String(e.game) === String(gameId));
        if (alreadyExists) {
            const enrichedEntries = await enrichGameEntries(user.gameEntries);
            const eloGames = await enrichEloGames(user.gameElo || []);
            return res.status(400).render('profileGames', {
                user,
                isCurrentUser: true,
                isFollowing: false,
                canMessage: false,
                viewer: req.user,
                activeTab: 'games',
                gameEntries: enrichedEntries,
                error: 'You’ve already entered a rating for this game.',
                usePastGameLinks: true,
                eloGames
            });
        }

        console.log(`Added game entry:`, entry);

        const newGameObjectId = new mongoose.Types.ObjectId(gameId);

        const finalizedGames = (user.gameElo || []).filter(g => g.finalized);
        let minElo = 1000;
        let maxElo = 2000;

        if(!isInitial){
            const comp1 = finalizedGames.find(g => String(g.game) === String(compareGameId1));
            if (comp1 && (winner1 === 'new' || winner1 === 'existing')) {
                await GameComparison.create({
                    userId: user._id,
                    gameA: newGameObjectId,
                    gameB: comp1.game,
                    winner: winner1 === 'new' ? newGameObjectId : comp1.game
                });
                if (winner1 === 'new') {
                    minElo = comp1.elo;
                } else {
                    maxElo = comp1.elo;
                }
            }

            const comp2 = finalizedGames.find(g => String(g.game) === String(compareGameId2));
            if (comp2 && (winner2 === 'new' || winner2 === 'existing')) {
                await GameComparison.create({
                    userId: user._id,
                    gameA: newGameObjectId,
                    gameB: comp2.game,
                    winner: winner2 === 'new' ? newGameObjectId : comp2.game
                });
                if (winner2 === 'new') {
                    minElo = comp2.elo;
                } else {
                    maxElo = comp2.elo;
                }
            }

            const comp3 = finalizedGames.find(g => String(g.game) === String(compareGameId3));
            if (comp3 && (winner3 === 'new' || winner3 === 'existing')) {
                await GameComparison.create({
                    userId: user._id,
                    gameA: newGameObjectId,
                    gameB: comp3.game,
                    winner: winner3 === 'new' ? newGameObjectId : comp3.game
                });
                if (winner3 === 'new') {
                    minElo = comp3.elo;
                } else {
                    maxElo = comp3.elo;
                }
            }

            if(isNaN(minElo) || isNaN(maxElo)){
                minElo = 1000;
                maxElo = 2000;
            }
            if(minElo > maxElo){
                const t = minElo;
                minElo = maxElo;
                maxElo = t;
            }

            const computedElo = Math.floor((minElo + maxElo) / 2);
            finalElo = computedElo;
        }

        if(finalElo === null) {
            if(isNaN(minElo) || isNaN(maxElo)){
                minElo = 1000;
                maxElo = 2000;
            }
            if(minElo > maxElo){
                const t = minElo;
                minElo = maxElo;
                maxElo = t;
            }
            finalElo = Math.floor((minElo + maxElo) / 2);
        }

        entry.elo = finalElo;

        const newEloEntry = {
            game: newGameObjectId,
            elo: finalElo,
            finalized: true,
            comparisonHistory: []
        };

        const pastGameDoc = await PastGame.findById(gameId);

        if (pastGameDoc) {
            let updated = false;
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

        const update = {
            $push: {
                gameEntries: entry,
                gameElo: newEloEntry
            },
            $addToSet: {
                teamsList: { $each: teamsToAdd.map(toObjectId) },
                venuesList: { $each: venuesToAdd.map(toObjectId) }
            }
        };

        await User.findByIdAndUpdate(user._id, update);
        console.log('[SAVE] Added game entry with elo:', finalElo);
        const enriched = await enrichGameEntries([entry]);
        if(req.headers.accept && req.headers.accept.includes('application/json')){
            return res.json({ success:true, entry: enriched[0] });
        }
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
        const newElo = ratingToElo(rating);

        const user = await User.findById(req.user.id);
        if(!user) return res.status(401).json({ error:'Unauthorized' });

        const entry = user.gameEntries.id(entryId);
        if(!entry) return res.status(404).json({ error:'Entry not found' });

        entry.elo = newElo;
        entry.comment = sanitizedComment || null;
        if(req.file){
            entry.image = '/uploads/' + req.file.filename;
        }

        const pastGameDoc = await PastGame.findById(entry.game);
        if(pastGameDoc){
            let updated = false;
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

        const eloEntry = user.gameElo.find(e => String(e.game) === String(entry.game));
        if(eloEntry){
            eloEntry.elo = newElo;
        }

        await user.save();

        const enriched = await enrichGameEntries([entry]);
        res.json({ success:true, entry: enriched[0] });
    } catch(err){
        next(err);
    }
}];

exports.deleteGameEntry = async (req, res, next) => {
    try {
        const entryId = req.params.id;

        const user = await User.findById(req.user.id);
        if(!user) return res.status(401).json({ error:'Unauthorized' });

        const entry = user.gameEntries.id(entryId);
        if(!entry) return res.status(404).json({ error:'Entry not found' });

        const pastGameDoc = await PastGame.findById(entry.game);

        const teamsToRemove = [];
        const venuesToRemove = [];

        if(pastGameDoc){
            if(pastGameDoc.HomeId){
                const homeTeam = await Team.findOne({ teamId: pastGameDoc.HomeId }).select('_id');
                if(homeTeam) teamsToRemove.push(String(homeTeam._id));
            }
            if(pastGameDoc.AwayId){
                const awayTeam = await Team.findOne({ teamId: pastGameDoc.AwayId }).select('_id');
                if(awayTeam) teamsToRemove.push(String(awayTeam._id));
            }
            if(pastGameDoc.VenueId){
                const venue = await Venue.findOne({ venueId: pastGameDoc.VenueId }).select('_id');
                if(venue) venuesToRemove.push(String(venue._id));
            }

            const ratingIdx = pastGameDoc.ratings.findIndex(r => String(r.userId) === String(user._id));
            if(ratingIdx >= 0) pastGameDoc.ratings.splice(ratingIdx,1);
            const commentIdx = pastGameDoc.comments.findIndex(c => String(c.userId) === String(user._id));
            if(commentIdx >= 0) pastGameDoc.comments.splice(commentIdx,1);
            await pastGameDoc.save();
        }

        entry.deleteOne();

        teamsToRemove.forEach(tid => {
            const idx = user.teamsList.findIndex(t => String(t) === tid);
            if(idx >= 0) user.teamsList.splice(idx,1);
        });

        venuesToRemove.forEach(vid => {
            const idx = user.venuesList.findIndex(v => String(v) === vid);
            if(idx >= 0) user.venuesList.splice(idx,1);
        });

        const idx = user.gameElo.findIndex(e => String(e.game) === String(entry.game));
        if(idx >= 0){
            user.gameElo.splice(idx,1);
        }

        await user.save();

        res.json({ success:true });
    } catch(err){
        next(err);
    }
};

