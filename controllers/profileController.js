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
const { fetchGamesByIds } = require('../lib/gameUtils');
const Venue = require('../models/Venue');
const Conference = require('../models/Conference');
const GameComparison = require('../models/gameComparison');
const Badge = require('../models/Badge');
const getStateFromCoordinates = require('../lib/stateLookup');
const { computeBadgeProgress } = require('../lib/badgeUtils');

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

function resolveEntryGameId(entry){
    if(!entry) return null;
    const source = entry.toObject ? entry.toObject() : entry;

    const normalize = value => {
        if(value === undefined || value === null || value === '') return null;
        const numeric = Number(value);
        if(Number.isFinite(numeric)) return numeric;
        return null;
    };

    const direct = normalize(source.gameId);
    if(direct != null) return direct;

    const rawGame = source.game;
    if(rawGame && typeof rawGame === 'object'){
        const byGameId = normalize(rawGame.gameId);
        if(byGameId != null) return byGameId;
        const byId = normalize(rawGame.Id);
        if(byId != null) return byId;
    } else {
        const fallback = normalize(rawGame);
        if(fallback != null) return fallback;
    }

    return null;
}

async function enrichGameEntries(entries){
    if(!entries || !entries.length) return [];
    const ids = entries
        .map(resolveEntryGameId)
        .filter((id, index, arr) => id != null && arr.indexOf(id) === index);
    const games = await fetchGamesByIds(ids);
    const gameMap = {};
    games.forEach(g => {
        const key = g && (g.gameId ?? g.Id ?? g._id);
        if(key != null){
            gameMap[String(key)] = g;
        }
    });
    return entries.map(e => {
        const entryObj = e.toObject ? e.toObject() : { ...e };
        const entryKey = resolveEntryGameId(entryObj);
        entryObj.game = entryKey != null ? gameMap[String(entryKey)] || null : null;
        return entryObj;
    });
}

// Returns an array of enriched game entry objects for a user.
async function mergeUserGames(user){
    const gameEntriesRaw = user.gameEntries || [];
    return gameEntriesRaw.length ? await enrichGameEntries(gameEntriesRaw) : [];
}

function applyPopulates(query, populatePaths = []) {
    if (!Array.isArray(populatePaths)) return query;
    return populatePaths.reduce((acc, pop) => acc.populate(pop), query);
}

async function findUserByIdentifier(identifier, populatePaths = []) {
    if (!identifier) return null;

    let query = applyPopulates(User.findOne({ venmo: identifier }), populatePaths);
    let user = await query.exec();
    if (user) return user;

    if (mongoose.Types.ObjectId.isValid(identifier)) {
        query = applyPopulates(User.findById(identifier), populatePaths);
        user = await query.exec();
        if (user) return user;
    }

    return null;
}

// Enriches an array of {game, elo} objects with full PastGame info
async function enrichEloGames(entries){
    if(!entries || !entries.length) return [];

    const normalized = entries.map(e => {
        const entryObj = e.toObject ? e.toObject() : { ...e };
        if (entryObj.gameId == null) {
            const rawGame = entryObj.game;
            let resolvedId = null;
            if (rawGame && typeof rawGame === 'object') {
                if (rawGame.gameId != null) resolvedId = rawGame.gameId;
                else if (rawGame.Id != null) resolvedId = rawGame.Id;
            } else if (rawGame != null) {
                resolvedId = rawGame;
            }
            const numericId = Number(resolvedId);
            entryObj.gameId = Number.isFinite(numericId) ? numericId : null;
        } else {
            const numericId = Number(entryObj.gameId);
            entryObj.gameId = Number.isFinite(numericId) ? numericId : null;
        }
        return entryObj;
    });

    const enriched = await enrichGameEntries(normalized);

    return enriched;
}

function ratingToElo(rating){
    const val = parseFloat(rating);
    if(isNaN(val)) return 1500;
    return Math.round(1000 + ((val - 1) / 9) * 1000);
}

function eloToRating(elo){
    if (typeof elo !== 'number' || Number.isNaN(elo)) return null;
    const rawScore = ((elo - 1000) / 1000) * 9 + 1;
    return Math.max(1.0, Math.min(10.0, Math.round(rawScore * 10) / 10));
}

const MIN_FAV_TEAM_RANK_ENTRIES = 3;

function resolveTeamSideFromGame(game, teamDoc) {
    if (!game || !teamDoc) return null;
    const targetObjectId = String(teamDoc._id);
    const targetNumericId = teamDoc.teamId != null ? Number(teamDoc.teamId) : null;

    const matchesCandidate = candidate => {
        if (!candidate) return false;
        const candidateObjId = candidate._id ? String(candidate._id) : (candidate.id ? String(candidate.id) : null);
        if (candidateObjId && candidateObjId === targetObjectId) return true;
        if (candidate === targetObjectId) return true;
        if (targetNumericId != null) {
            const candidateNumericId = candidate.teamId != null ? Number(candidate.teamId) : null;
            if (candidateNumericId != null && candidateNumericId === targetNumericId) return true;
        }
        return false;
    };

    if (matchesCandidate(game.homeTeam)) return 'home';
    if (matchesCandidate(game.awayTeam)) return 'away';

    if (targetNumericId != null) {
        if (Number(game.HomeId) === targetNumericId || Number(game.homeTeamId) === targetNumericId) return 'home';
        if (Number(game.AwayId) === targetNumericId || Number(game.awayTeamId) === targetNumericId) return 'away';
    }

    return null;
}

function gameIncludesTeam(game, teamDoc) {
    return resolveTeamSideFromGame(game, teamDoc) !== null;
}

function determineOutcome(game, teamDoc) {
    const side = resolveTeamSideFromGame(game, teamDoc);
    if (!side) return { hasScore: false, isWin: false, isLoss: false, isTie: false };

    const homePointsRaw = game?.homePoints ?? game?.HomePoints;
    const awayPointsRaw = game?.awayPoints ?? game?.AwayPoints;
    const homePoints = Number(homePointsRaw);
    const awayPoints = Number(awayPointsRaw);
    if (!Number.isFinite(homePoints) || !Number.isFinite(awayPoints)) {
        return { hasScore: false, isWin: false, isLoss: false, isTie: false };
    }

    if (homePoints === awayPoints) {
        return { hasScore: true, isWin: false, isLoss: false, isTie: true };
    }

    const teamScore = side === 'home' ? homePoints : awayPoints;
    const opponentScore = side === 'home' ? awayPoints : homePoints;
    const isWin = teamScore > opponentScore;
    return { hasScore: true, isWin, isLoss: !isWin, isTie: false };
}

function formatGameForClient(entry, teamDoc) {
    if (!entry) return null;
    const baseEntry = entry.toObject ? entry.toObject() : { ...entry };
    const game = baseEntry.game || {};
    const startDate = game.startDate || game.StartDate || null;
    const timestamp = startDate ? new Date(startDate).getTime() : 0;
    const rating = typeof baseEntry.elo === 'number' ? eloToRating(baseEntry.elo) : (typeof baseEntry.rating === 'number' ? Number(baseEntry.rating) : null);
    const awayTeamName = game.awayTeamName || game.AwayTeam || (game.awayTeam && (game.awayTeam.teamName || game.awayTeam.school)) || '';
    const homeTeamName = game.homeTeamName || game.HomeTeam || (game.homeTeam && (game.homeTeam.teamName || game.homeTeam.school)) || '';
    const awayLogo = game.awayTeam?.logos?.[0] || '/images/placeholder.jpg';
    const homeLogo = game.homeTeam?.logos?.[0] || '/images/placeholder.jpg';
    const canonicalId = resolveEntryGameId(baseEntry);
    const gameObjectId = game && game._id ? String(game._id) : null;
    const entryObjectId = baseEntry._id ? String(baseEntry._id) : null;
    const canonicalKey = canonicalId != null ? String(canonicalId) : null;
    const hasFinalScore = determineOutcome(game, teamDoc).hasScore;
    const isPastGame = Boolean(game.StartDate || hasFinalScore || game.completed);
    let link = '#';
    if (isPastGame) {
        if (gameObjectId) link = `/pastGames/${gameObjectId}`;
        else if (canonicalId != null) link = `/pastGames/${canonicalId}`;
    } else if (gameObjectId) {
        link = `/games/${gameObjectId}`;
    } else if (canonicalId != null) {
        link = `/games/${canonicalId}`;
    }

    const fallbackKey = startDate ? `entry-${new Date(startDate).getTime()}` : null;
    const uniqueId = entryObjectId || gameObjectId || canonicalKey || fallbackKey || `entry-${Math.random().toString(36).slice(2)}`;

    return {
        id: uniqueId,
        gameId: canonicalId != null ? Number(canonicalId) : null,
        startDate,
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        rating: rating != null ? Number(rating) : null,
        awayTeamName,
        homeTeamName,
        awayLogo,
        homeLogo,
        link,
        checkedIn: Boolean(baseEntry.checkedIn)
    };
}

function extractVenueKey(game) {
    if (!game) return null;
    if (game.venue && typeof game.venue === 'object') {
        const venue = game.venue;
        const id = venue._id ? String(venue._id) : (venue.venueId != null ? `venue-${venue.venueId}` : (venue.name || null));
        if (!id) return null;
        return {
            key: id,
            venue: {
                name: venue.name || game.Venue || 'Unknown Venue',
                imgUrl: venue.imgUrl || null
            }
        };
    }
    const name = game.Venue || (typeof game.venue === 'string' ? game.venue : null);
    if (!name) return null;
    return {
        key: `venue-${name.toLowerCase()}`,
        venue: {
            name,
            imgUrl: null
        }
    };
}

function ordinalSuffix(n) {
    if (!Number.isFinite(n) || n <= 0) return null;
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function attachGamesToEntries(entries, gameMap) {
    return (entries || []).map(entry => {
        const obj = entry && entry.toObject ? entry.toObject() : { ...entry };
        const key = resolveEntryGameId(obj);
        if (key != null) {
            const mapped = gameMap[String(key)] || null;
            if (mapped) obj.game = mapped;
        }
        return obj;
    });
}

exports.getSignUp = async (req, res, next) => {
    try {
        res.render('contact', { layout: false, formData: {} });
    } catch (err) {
        next(err);
    }
};

exports.getLogin = (req, res) => {
    res.render('login', { layout: false });
};

exports.saveUser = [uploadMemory.single('profileImage'), async (req, res, next) => {
    const { username, email, phoneNumber, password, passwordConfirm } = req.body;
    const trimmedUsername = username ? username.trim() : '';
    const trimmedEmail = email ? email.trim() : '';
    const rawPhone = phoneNumber ? phoneNumber.trim() : '';
    const formData = {
        username: trimmedUsername,
        email: trimmedEmail,
        phoneNumber: rawPhone
    };
    try {
        if (password !== passwordConfirm) {
            return res.status(400).render('contact', { layout: false, error: 'Passwords do not match.', formData });
        }

        const digitsOnlyPhone = rawPhone.replace(/\D/g, '');
        const normalizedPhone = digitsOnlyPhone ? `+${digitsOnlyPhone}` : '';
        const phonePattern = /^\+\d{6,15}$/;
        if (!phonePattern.test(normalizedPhone)) {
            return res.status(400).render('contact', { layout: false, error: 'Please provide a valid phone number.', formData });
        }

        formData.phoneNumber = normalizedPhone;

        if (!req.file) {
            return res.status(400).render('contact', { layout: false, error: 'Profile picture is required.', formData });
        }
        const newUser = new User({
            username: trimmedUsername,
            email: trimmedEmail,
            phoneNumber: normalizedPhone,
            password,
            favoriteTeams: [],
            profileImage:{ data:req.file.buffer, contentType:req.file.mimetype }
        });
        await newUser.save();
        const token = jwt.sign({ id: newUser._id, username: newUser.username, email: newUser.email, phoneNumber: newUser.phoneNumber }, 'secret');
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/select-teams');
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).render('contact', { layout: false, error: error.message, formData });
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
        const profileSlug = user.venmo || user.username || user._id;
        res.redirect(`/profile/${profileSlug}/stats`);
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




exports.selectFavoriteTeams = async (req, res, next) => {
    try {
        const teams = await Team.find({ leagueId: { $in: [1,8] } });
        res.render('selectTeams', { layout: false, teams });
    } catch (err) {
        next(err);
    }
};

exports.saveFavoriteTeams = async (req, res, next) => {
    try {
        const fav = req.body.favoriteTeams || [];
        const favArray = Array.isArray(fav) ? fav : [fav];
        if(favArray.length === 0){
            return res.status(400).json({ error: 'Select at least one team' });
        }
        req.user.favoriteTeams = favArray;
        await req.user.save();
        res.json({ success: true });
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
            });
            
        if (!user) return res.redirect('/login');

        const wishlistGames = user.wishlist || [];

        const enrichedEntries = await mergeUserGames(user);

        res.render('profile', {
            user,
            isCurrentUser: true,
            isFollowing: false,
            canMessage: false,
            viewer: req.user,
            wishlistGames,
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

exports.searchFollowers = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json([]);

    const q = req.query.q ? req.query.q.trim() : '';

    // load viewer with populated followers
    const viewer = await User.findById(req.user.id).populate('followers', 'username');
    if (!viewer || !viewer.followers) {
      return res.json([]);
    }

    // case-insensitive filter
    const regex = new RegExp(q, 'i');
    const matches = viewer.followers.filter(f => regex.test(f.username));

    // format for Select2
    const results = matches.map(f => ({
      id: String(f._id),
      text: f.username
    }));

    res.json(results);
  } catch (err) {
    console.error('[searchFollowers ERROR]', err);
    res.status(500).json([]);
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
        const identifier = req.params.user || req.params.identifier || req.params.id || req.params.venmo || (req.user && req.user.id);
        const profileUser = await findUserByIdentifier(identifier, ['favoriteTeams']);
        if (!profileUser) {
            const fallbackSlug = req.user ? (req.user.venmo || req.user.id) : '';
            return res.redirect(fallbackSlug ? `/profile/${fallbackSlug}/badges` : '/profile');
        }
        console.log('✅ user.favoriteTeams:', profileUser.favoriteTeams);
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

        // Gather all checked-in games from the user's gameEntries
        const gameIds = (profileUser.gameEntries || []).filter(e => e.checkedIn).map(e => e.gameId);
        const games = await fetchGamesByIds(gameIds);

        const userProgress = {};
        badges.forEach(badge => {
            userProgress[badge.badgeID] = computeBadgeProgress(badge, games);
        });

        const favoriteTeamIds = (profileUser.favoriteTeams || [])
            .map(team => {
                if (team && team._id) return team._id.toString();
                if (team) return String(team);
                return null;
            })
            .filter(Boolean);

        const shuffleInPlace = arr => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        };

        const completedBadges = [];
        const inProgressBadges = [];
        const favoriteUnstartedBadges = [];
        const otherBadges = [];

        badges.forEach(badge => {
            const progress = userProgress[badge.badgeID] || 0;
            const requirement = Number(badge.reqGames) || 0;

            if (progress >= requirement) {
                completedBadges.push(badge);
                return;
            }

            if (progress > 0 && progress < requirement) {
                inProgressBadges.push(badge);
                return;
            }

            const teamConstraints = (badge.teamConstraints || [])
                .map(t => {
                    if (!t) return null;
                    if (typeof t === 'string') return t;
                    if (t.toString) return t.toString();
                    return null;
                })
                .filter(Boolean);
            const matchesFavorite = teamConstraints.length && teamConstraints.some(tc => favoriteTeamIds.includes(tc));

            if (matchesFavorite) {
                favoriteUnstartedBadges.push(badge);
            } else {
                otherBadges.push(badge);
            }
        });

        completedBadges.sort((a, b) => (b.pointValue || 0) - (a.pointValue || 0));
        inProgressBadges.sort((a, b) => {
            const progressA = userProgress[a.badgeID] || 0;
            const progressB = userProgress[b.badgeID] || 0;
            const reqA = Number(a.reqGames) || 0;
            const reqB = Number(b.reqGames) || 0;
            const percentA = reqA ? progressA / reqA : 0;
            const percentB = reqB ? progressB / reqB : 0;
            return percentB - percentA;
        });

        shuffleInPlace(favoriteUnstartedBadges);
        shuffleInPlace(otherBadges);

        const sortedBadges = [
            ...completedBadges,
            ...inProgressBadges,
            ...favoriteUnstartedBadges,
            ...otherBadges
        ];

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
            conferences,
            completedBadges,
            inProgressBadges,
            favoriteUnstartedBadges,
            otherBadges,
            sortedBadges
        });
    } catch (err) {
        next(err);
    }
};

exports.profileStats = async (req, res, next) => {
    try {
        const identifier = req.params.user || req.params.identifier || req.params.id || req.params.venmo || (req.user && req.user.id);
        console.log('[profileStats] Requested identifier:', identifier);

        // Get populated lists for UI rendering
        const profileUser = await findUserByIdentifier(identifier, ['favoriteTeams', 'teamsList', 'venuesList']);

        if (!profileUser) {
            console.warn('[profileStats] No user found, redirecting to self');
            const fallbackSlug = req.user ? (req.user.venmo || req.user.id) : '';
            return res.redirect(fallbackSlug ? `/profile/${fallbackSlug}/stats` : '/profile');
        }

        console.log('✅ user.favoriteTeams:', profileUser.favoriteTeams);

        console.log(`[profileStats] Loaded user: ${profileUser.username} (${profileUser._id})`);
        console.log(`[profileStats] Populated teamsList count: ${profileUser.teamsList?.length}`);
        console.log(`[profileStats] Populated venuesList count: ${profileUser.venuesList?.length}`);

        // Get raw, unpopulated list of IDs
        const rawUser = await User.findById(profileUser._id).lean();
        const rawTeamIds = rawUser.teamsList || [];
        const rawVenueIds = rawUser.venuesList || [];

        console.log('[profileStats] Raw teamsList length (with duplicates):', rawTeamIds.length);
        console.log('[profileStats] Raw venuesList length (with duplicates):', rawVenueIds.length);

        const isCurrentUser = req.user && req.user.id.toString() === profileUser._id.toString();

        let isFollowing = false, canMessage = false;
        if (req.user && !isCurrentUser) {
            const viewer = await User.findById(req.user.id);
            isFollowing = viewer.following.some(f => String(f) === String(profileUser._id));
            const followsBack = profileUser.following.some(f => String(f) === String(viewer._id));
            canMessage = isFollowing && followsBack;
            console.log(`[profileStats] Viewer follows user: ${isFollowing}, Follows back: ${followsBack}`);
        }

        const enrichedEntries = await mergeUserGames(profileUser);
        console.log(`[profileStats] Enriched gameEntries count: ${enrichedEntries.length}`);

        const topRatedGames = enrichedEntries
            .filter(e => e.game && e.game._id)
            .map(e => {
                const game = e.game;
                const rawScore = e.elo ? ((e.elo - 1000) / 1000) * 9 + 1 : 0;
                const rating = Math.max(1.0, Math.min(10.0, Math.round(rawScore * 10) / 10));
                const gameDate = game.startDate || game.StartDate || null;
                const awayLogo = (game.awayTeam?.logos?.[0]) || '/images/placeholder.jpg';
                const homeLogo = (game.homeTeam?.logos?.[0]) || '/images/placeholder.jpg';
                return { _id: game._id, gameDate, awayTeamLogoUrl: awayLogo, homeTeamLogoUrl: homeLogo, rating };
            })
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 3);

        console.log('[profileStats] Top 3 rated games:', topRatedGames.map(g => g._id));

        const uniqueTeamIds = [...new Set((profileUser.teamsList || []).map(t => String(t._id || t)))];
        console.log('[profileStats] Unique team IDs:', uniqueTeamIds);

        // Load conference team map
        const mapPath = path.join(__dirname, '../conferenceTeamMap.json');
        const mapRaw = fs.readFileSync(mapPath, 'utf8');
        const conferenceTeamMap = JSON.parse(mapRaw);
        console.log('[profileStats] Loaded conferenceTeamMap with', Object.keys(conferenceTeamMap).length, 'conferences');

        const conferenceStats = Object.entries(conferenceTeamMap).map(([name, teamIds]) => {
            const teamsUnlocked = [];
            const teamDots = [];

            teamIds.forEach(id => {
                const team = (profileUser.teamsList || []).find(t => String(t._id || t) === String(id));
                if (team) {
                    teamsUnlocked.push(team);
                    teamDots.push({
                        unlocked: true,
                        logo: team.logos?.[0] || '/images/placeholder.jpg',
                        altColor: team.alternateColor || '#bbb'
                    });
                } else {
                    teamDots.push({ unlocked: false });
                }
            });

            const percentage = Math.round((teamsUnlocked.length / teamIds.length) * 100);
            return { name, percentage, totalTeams: teamIds.length, teamDots };
        });

        console.log('[profileStats] Built conferenceStats:', conferenceStats.filter(c => c.percentage > 0).map(c => c.name));

        const teamMap = {};
        for (const team of profileUser.teamsList || []) {
            const id = String(team._id || team);
            teamMap[id] = {
                logos: team.logos || [],
                alternateColor: team.alternateColor || '#bbb'
            };
        }

        // Frequency: Teams
        const teamFrequencyMap = {};
        for (const id of rawTeamIds) {
            const idStr = String(id);
            if (!teamFrequencyMap[idStr]) {
                teamFrequencyMap[idStr] = { team: null, count: 1 };
            } else {
                teamFrequencyMap[idStr].count++;
            }
        }
        for (const team of profileUser.teamsList || []) {
            const id = String(team._id || team);
            if (teamFrequencyMap[id]) {
                teamFrequencyMap[id].team = team;
            }
        }
        const teamEntries = Object.values(teamFrequencyMap).filter(e => e.team).sort((a, b) => b.count - a.count);
        console.log('[profileStats] Top team frequency:', teamEntries.slice(0, 3).map(e => ({
            name: e.team.school,
            count: e.count
        })));

        // Frequency: Venues
        const venueFrequencyMap = {};
        for (const id of rawVenueIds) {
            const idStr = String(id);
            if (!venueFrequencyMap[idStr]) {
                venueFrequencyMap[idStr] = { venue: null, count: 1 };
            } else {
                venueFrequencyMap[idStr].count++;
            }
        }
        for (const venue of profileUser.venuesList || []) {
            const id = String(venue._id || venue);
            if (venueFrequencyMap[id]) {
                venueFrequencyMap[id].venue = venue;
            }
        }
        const venueEntries = Object.values(venueFrequencyMap).filter(e => e.venue).sort((a, b) => b.count - a.count);
        console.log('[profileStats] Top venue frequency:', venueEntries.slice(0, 3).map(e => ({
            name: e.venue.name,
            count: e.count
        })));

        // Frequency: States
        const stateFrequencyMap = {};
        for (const venue of profileUser.venuesList || []) {
            let state = venue.state;
            if (!state && venue.coordinates?.coordinates?.length === 2) {
                const [lon, lat] = venue.coordinates.coordinates;
                state = getStateFromCoordinates(lat, lon);
            }
            if (state) {
                stateFrequencyMap[state] = (stateFrequencyMap[state] || 0) + 1;
            }
        }
        const stateEntries = Object.entries(stateFrequencyMap).sort((a, b) => b[1] - a[1]);
        console.log('[profileStats] Top state frequency:', stateEntries.slice(0, 3));

        // Unique counts
        const teamsCount = teamEntries.length;
        const venuesCount = venueEntries.length;
        const statesCount = stateEntries.length;

        console.log(`[profileStats] Unique counts — Teams: ${teamsCount}, Venues: ${venuesCount}, States: ${statesCount}`);

        const eloGames = await enrichEloGames(profileUser.gameElo || []);
        console.log(`[profileStats] Loaded eloGames: ${eloGames.length}`);

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




exports.favoriteTeamStats = async (req, res, next) => {
    try {
        const identifier = req.params.user || req.params.identifier || (req.user && req.user.id);
        const teamParam = req.params.team;

        const profileUser = await findUserByIdentifier(identifier, ['favoriteTeams']);
        if (!profileUser) {
            const fallbackSlug = req.user ? (req.user.venmo || req.user.id) : '';
            return res.redirect(fallbackSlug ? `/profile/${fallbackSlug}/stats` : '/profile');
        }

        if (!teamParam) {
            const slug = profileUser.venmo || profileUser._id;
            return res.redirect(`/profile/${slug}/stats`);
        }

        let team = null;
        if (mongoose.Types.ObjectId.isValid(teamParam)) {
            team = await Team.findById(teamParam).lean();
        }
        if (!team) {
            const numericTeamId = Number(teamParam);
            if (Number.isFinite(numericTeamId)) {
                team = await Team.findOne({ teamId: numericTeamId }).lean();
            }
        }

        if (!team) {
            const slug = profileUser.venmo || profileUser._id;
            if (req.flash) req.flash('error', 'Team not found');
            return res.redirect(`/profile/${slug}/stats`);
        }

        const isCurrentUser = req.user && String(req.user.id) === String(profileUser._id);
        let isFollowing = false;
        let canMessage = false;
        if (req.user && !isCurrentUser) {
            const viewerDoc = await User.findById(req.user.id).select('following');
            if (viewerDoc) {
                isFollowing = viewerDoc.following.some(f => String(f) === String(profileUser._id));
                const followsBack = (profileUser.following || []).some(f => String(f) === String(viewerDoc._id));
                canMessage = isFollowing && followsBack;
            }
        }

        const enrichedEntries = await mergeUserGames(profileUser);
        const gamesWithTeam = enrichedEntries.filter(entry => gameIncludesTeam(entry.game, team));
        const gamesForClient = gamesWithTeam.map(entry => formatGameForClient(entry, team)).filter(Boolean);
        const checkedInGames = gamesWithTeam.filter(entry => entry.checkedIn);
        const checkedInForClient = checkedInGames.map(entry => formatGameForClient(entry, team)).filter(Boolean);

        const venuesMap = new Map();
        for (const entry of gamesWithTeam) {
            const meta = extractVenueKey(entry.game);
            if (!meta) continue;
            const venueName = (meta.venue && meta.venue.name) || 'Unknown Venue';
            const venueImg = meta.venue && meta.venue.imgUrl ? meta.venue.imgUrl : null;
            if (venuesMap.has(meta.key)) {
                const existing = venuesMap.get(meta.key);
                existing.count += 1;
                if (!existing.venue.imgUrl && venueImg) existing.venue.imgUrl = venueImg;
            } else {
                venuesMap.set(meta.key, {
                    count: 1,
                    venue: {
                        name: venueName,
                        imgUrl: venueImg
                    }
                });
            }
        }

        const venuesData = Array.from(venuesMap.values()).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            const nameA = (a.venue.name || '').toLowerCase();
            const nameB = (b.venue.name || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });

        let wins = 0, losses = 0, ties = 0;
        for (const entry of gamesWithTeam) {
            const outcome = determineOutcome(entry.game, team);
            if (!outcome.hasScore) continue;
            if (outcome.isTie) ties += 1;
            else if (outcome.isWin) wins += 1;
            else if (outcome.isLoss) losses += 1;
        }
        const decisions = wins + losses;
        const winPct = decisions > 0 ? wins / decisions : 0;

        const usersWithTeam = await User.find({ favoriteTeams: team._id })
            .select('username venmo gameEntries')
            .lean();

        const communityUsers = [...usersWithTeam];
        if (!communityUsers.some(u => String(u._id) === String(profileUser._id))) {
            communityUsers.push(profileUser.toObject());
        }

        const gameIds = new Set();
        communityUsers.forEach(u => {
            (u.gameEntries || []).forEach(entry => {
                const id = resolveEntryGameId(entry);
                if (id != null) {
                    const numeric = Number(id);
                    if (Number.isFinite(numeric)) gameIds.add(numeric);
                }
            });
        });

        const fetchedGames = await fetchGamesByIds(Array.from(gameIds));
        const gameMap = {};
        fetchedGames.forEach(g => {
            if (!g) return;
            const key = g.gameId ?? g.Id ?? g._id;
            if (key != null) gameMap[String(key)] = g;
        });

        const userStats = communityUsers.map(u => {
            const enriched = attachGamesToEntries(u.gameEntries || [], gameMap);
            const relevant = enriched.filter(entry => gameIncludesTeam(entry.game, team));
            let userWins = 0, userLosses = 0, userTies = 0;
            relevant.forEach(entry => {
                const result = determineOutcome(entry.game, team);
                if (!result.hasScore) return;
                if (result.isTie) userTies += 1;
                else if (result.isWin) userWins += 1;
                else if (result.isLoss) userLosses += 1;
            });
            const userDecisions = userWins + userLosses;
            const pct = userDecisions > 0 ? userWins / userDecisions : 0;
            return {
                userId: String(u._id),
                username: u.username,
                identifier: u.venmo || u._id,
                totalEntries: relevant.length,
                wins: userWins,
                losses: userLosses,
                ties: userTies,
                decisions: userDecisions,
                winPct: pct
            };
        });

        const eligibleForRank = userStats
            .filter(s => s.totalEntries >= MIN_FAV_TEAM_RANK_ENTRIES && s.decisions > 0)
            .sort((a, b) => {
                if (b.winPct !== a.winPct) return b.winPct - a.winPct;
                if (b.decisions !== a.decisions) return b.decisions - a.decisions;
                if (b.totalEntries !== a.totalEntries) return b.totalEntries - a.totalEntries;
                return a.username.localeCompare(b.username);
            });

        const rankIndex = eligibleForRank.findIndex(s => s.userId === String(profileUser._id));
        const recordSummary = {
            wins,
            losses,
            ties,
            totalEntries: gamesWithTeam.length,
            decisions,
            winPct,
            rank: rankIndex >= 0 ? rankIndex + 1 : null,
            ordinalRank: rankIndex >= 0 ? ordinalSuffix(rankIndex + 1) : null,
            totalRanked: eligibleForRank.length,
            minEntries: MIN_FAV_TEAM_RANK_ENTRIES
        };

        const leaderboard = [...userStats]
            .sort((a, b) => {
                if (b.totalEntries !== a.totalEntries) return b.totalEntries - a.totalEntries;
                if (b.decisions !== a.decisions) return b.decisions - a.decisions;
                if (b.winPct !== a.winPct) return b.winPct - a.winPct;
                return a.username.localeCompare(b.username);
            })
            .map((stat, index) => ({
                rank: index + 1,
                username: stat.username,
                identifier: stat.identifier,
                gameCount: stat.totalEntries,
                isCurrent: stat.userId === String(profileUser._id)
            }));

        res.render('favTeamStats', {
            user: profileUser,
            isCurrentUser,
            isFollowing,
            canMessage,
            viewer: req.user,
            activeTab: 'stats',
            team,
            games: gamesForClient,
            checkedInGames: checkedInForClient,
            venuesData,
            recordSummary,
            leaderboard,
            communityCount: userStats.length,
            minEntriesForRank: MIN_FAV_TEAM_RANK_ENTRIES
        });

    } catch (err) {
        console.error('[favoriteTeamStats] Error occurred:', err);
        next(err);
    }
};




exports.profileGames = async (req, res, next) => {
    try {
        const identifier = req.params.user || req.params.identifier || req.params.id || req.params.venmo || (req.user && req.user.id);
        const profileUser = await findUserByIdentifier(identifier, ['favoriteTeams']);
        if (!profileUser) {
            const fallbackSlug = req.user ? (req.user.venmo || req.user.id) : '';
            return res.redirect(fallbackSlug ? `/profile/${fallbackSlug}/games` : '/profile');
        }
        console.log('✅ user.favoriteTeams:', profileUser.favoriteTeams);
        let enrichedEntries = await mergeUserGames(profileUser);
        enrichedEntries.sort((a, b) => {
            const da = a.game && (a.game.startDate || a.game.StartDate);
            const db = b.game && (b.game.startDate || b.game.StartDate);
            return new Date(db) - new Date(da);
        });
        const viewerId = req.user ? req.user.id : null;
        const viewerData = viewerId ? await User.findById(viewerId).select('following').lean() : null;
        const followingIds = viewerData?.following ? viewerData.following.map(id => String(id)) : [];
        const isCurrentUser = viewerId && viewerId.toString() === profileUser._id.toString();
        let isFollowing = false;
        let canMessage = false;
        if (viewerId && !isCurrentUser) {
            isFollowing = followingIds.includes(String(profileUser._id));
            const followsBack = (profileUser.following || []).some(f => String(f) === String(viewerId));
            canMessage = isFollowing && followsBack;
        }
        let followedUsersByGame = {};
        if (followingIds.length) {
            const followedUsers = await User.find({ _id: { $in: followingIds } })
                .select('username profileImage gameEntries')
                .lean();
            followedUsersByGame = followedUsers.reduce((acc, followedUser) => {
                const profileImg = `/users/${followedUser._id}/profile-image`;
                const entries = followedUser.gameEntries || [];
                entries.forEach(entry => {
                    const potentialIds = new Set();
                    if (entry?.gameId != null) potentialIds.add(String(entry.gameId));
                    if (entry?.pastGameId != null) potentialIds.add(String(entry.pastGameId));
                    if (entry?.pastgameId != null) potentialIds.add(String(entry.pastgameId));
                    if (entry?.game && typeof entry.game === 'object') {
                        if (entry.game.gameId != null) potentialIds.add(String(entry.game.gameId));
                        if (entry.game.Id != null) potentialIds.add(String(entry.game.Id));
                        if (entry.game._id != null) potentialIds.add(String(entry.game._id));
                    }
                    potentialIds.forEach(id => {
                        if (!id) return;
                        if (!acc[id]) acc[id] = [];
                        const alreadyIncluded = acc[id].some(u => u.username === followedUser.username);
                        if (!alreadyIncluded) {
                            acc[id].push({
                                username: followedUser.username,
                                profileImg,
                                checkedIn: !!entry.checkedIn
                            });
                        }
                    });
                });
                return acc;
            }, {});
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
            eloGames,
            followedUsersByGame
        });
    } catch (err) {
        next(err);
    }
};

exports.profileGameShowcase = async (req, res, next) => {
    try {
        const identifier = req.params.user || req.params.identifier;
        const { gameEntry } = req.params;
        if (!identifier || !gameEntry) {
            return res.status(404).render('gameEntryShowcase', {
                user: null,
                entry: null,
                profileImageUrl: null,
                gameDetails: null,
                normalizedEloRating: null,
                homeVenueImage: null

            });
        }

        let targetUser = await findUserByIdentifier(identifier);

        if (!targetUser) {
            return res.status(404).render('gameEntryShowcase', {
                user: null,
                entry: null,
                profileImageUrl: null,

                gameDetails: null,
                normalizedEloRating: null,
                homeVenueImage: null

            });
        }

        const enrichedEntries = await mergeUserGames(targetUser);
        const entry = enrichedEntries.find(e => {
            const entryId = e._id ? String(e._id) : null;
            const entryGameId = e.gameId ? String(e.gameId) : null;
            return entryId === gameEntry || entryGameId === gameEntry;
        }) || null;

        const profileImageUrl = (targetUser.profileImage && targetUser.profileImage.data)
            ? `/users/${targetUser._id}/profile-image`
            : null;

        if (!entry) {
            return res.status(404).render('gameEntryShowcase', {
                user: targetUser,
                entry: null,
                profileImageUrl,

                gameDetails: null,
                normalizedEloRating: null,
                homeVenueImage: null

            });
        }

        const homeVenueImage = (entry.game && (
            (entry.game.homeVenue && entry.game.homeVenue.imgUrl) ||
            (entry.game.venue && entry.game.venue.imgUrl) ||
            entry.game.venueImgUrl ||
            entry.game.imgUrl ||
            entry.game.VenueImgUrl
        )) || null;

        res.render('gameEntryShowcase', {
            user: targetUser,
            entry,
            profileImageUrl,

            gameDetails: entry.game || null,
            normalizedEloRating: eloToRating(entry.elo),
            homeVenueImage

        });
    } catch (err) {
        next(err);
    }
};

exports.profileWaitlist = async (req, res, next) => {
    try {
        const identifier = req.params.user || req.params.identifier || req.params.id || req.params.venmo || (req.user && req.user.id);
        const profileUser = await findUserByIdentifier(identifier, [
            'favoriteTeams',
            { path: 'wishlist', populate: ['homeTeam', 'awayTeam'] }
        ]);
        if (!profileUser) {
            const fallbackSlug = req.user ? (req.user.venmo || req.user.id) : '';
            return res.redirect(fallbackSlug ? `/profile/${fallbackSlug}/waitlist` : '/profile');
        }
        console.log('✅ user.favoriteTeams:', profileUser.favoriteTeams);
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


        const viewer = await User.findById(req.user.id).select('following').lean();

        const users = await User.find({
            username: { $regex: q, $options: 'i' },
            _id: { $ne: req.user.id }
        }).select('username').lean();

        const followingSet = new Set((viewer?.following || []).map(id => String(id)));

        res.json(users.map(u => ({
            _id: u._id,
            username: u.username,
            isFollowing: followingSet.has(String(u._id))
        })));

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
            });
        if (!user) return res.redirect('/profile');

        if(req.user){
            await User.findByIdAndUpdate(req.user.id, { $pull: { newFollowers: user._id } });
            if(req.user.newFollowers){
                req.user.newFollowers = req.user.newFollowers.filter(f => String(f) !== String(user._id));
            }
        }

        const wishlistGames = user.wishlist || [];
        let enrichedEntries = await mergeUserGames(user);
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

        const normalizeIds = value => {
            if (value == null) return [];
            if (Array.isArray(value)) return value;
            return [value];
        };

        const rawIds = normalizeIds(gameId)
            .map(val => {
                const num = Number(val);
                return Number.isFinite(num) ? num : null;
            })
            .filter(id => id != null);

        const orderedUniqueIds = [];
        const seenIds = new Set();
        for (const id of rawIds) {
            const key = String(id);
            if (seenIds.has(key)) continue;
            seenIds.add(key);
            orderedUniqueIds.push(id);
        }

        if (orderedUniqueIds.length > 1) {
            const existingSet = new Set((user.gameEntries || []).map(e => String(e.gameId)));
            const idsToAdd = orderedUniqueIds.filter(id => !existingSet.has(String(id)));

            if (!idsToAdd.length) {
                if (req.headers.accept && req.headers.accept.includes('application/json')) {
                    return res.status(400).json({ error: 'All selected games are already on your list.' });
                }
                const enrichedEntries = await enrichGameEntries(user.gameEntries || []);
                const eloGames = await enrichEloGames(user.gameElo || []);
                return res.status(400).render('profileGames', {
                    user,
                    isCurrentUser: true,
                    isFollowing: false,
                    canMessage: false,
                    viewer: req.user,
                    activeTab: 'games',
                    gameEntries: enrichedEntries,
                    error: 'All selected games are already on your list.',
                    usePastGameLinks: true,
                    eloGames
                });
            }

            const pastGameDocs = await PastGame.find({
                $or: [
                    { gameId: { $in: idsToAdd } },
                    { Id: { $in: idsToAdd } }
                ]
            }).lean();

            const pastGameMap = new Map();
            for (const doc of pastGameDocs) {
                if (!doc) continue;
                if (doc.gameId != null) pastGameMap.set(String(doc.gameId), doc);
                if (doc.Id != null) pastGameMap.set(String(doc.Id), doc);
            }

            const entriesToCreate = [];
            const referencedDocs = [];

            for (const id of idsToAdd) {
                const lookup = pastGameMap.get(String(id));
                if (!lookup) continue;
                const canonicalId = Number(lookup.gameId ?? lookup.Id);
                if (!Number.isFinite(canonicalId)) continue;
                entriesToCreate.push({
                    gameId: String(canonicalId),
                    checkedIn: false,
                    elo: null,
                    rating: null,
                    comment: null,
                    image: null,
                    ratingPrompted: false
                });
                referencedDocs.push(lookup);
            }

            if (!entriesToCreate.length) {
                if (req.headers.accept && req.headers.accept.includes('application/json')) {
                    return res.status(404).json({ error: 'No selected games could be found.' });
                }
                const enrichedEntries = await enrichGameEntries(user.gameEntries || []);
                const eloGames = await enrichEloGames(user.gameElo || []);
                return res.status(404).render('profileGames', {
                    user,
                    isCurrentUser: true,
                    isFollowing: false,
                    canMessage: false,
                    viewer: req.user,
                    activeTab: 'games',
                    gameEntries: enrichedEntries,
                    error: 'We couldn\'t locate the games you selected.',
                    usePastGameLinks: true,
                    eloGames
                });
            }

            const teamIdsNeeded = new Set();
            const venueIdsNeeded = new Set();
            for (const doc of referencedDocs) {
                if (doc.HomeId != null) teamIdsNeeded.add(Number(doc.HomeId));
                if (doc.AwayId != null) teamIdsNeeded.add(Number(doc.AwayId));
                if (doc.VenueId != null) venueIdsNeeded.add(Number(doc.VenueId));
            }

            const teamDocs = teamIdsNeeded.size
                ? await Team.find({ teamId: { $in: Array.from(teamIdsNeeded) } }).select('_id teamId').lean()
                : [];
            const venueDocs = venueIdsNeeded.size
                ? await Venue.find({ venueId: { $in: Array.from(venueIdsNeeded) } }).select('_id venueId').lean()
                : [];

            const teamMap = new Map(teamDocs.map(doc => [String(doc.teamId), doc._id]));
            const venueMap = new Map(venueDocs.map(doc => [String(doc.venueId), doc._id]));

            const teamsToAdd = new Set();
            const venuesToAdd = new Set();

            for (const doc of referencedDocs) {
                if (doc.HomeId != null) {
                    const mapped = teamMap.get(String(doc.HomeId));
                    if (mapped) teamsToAdd.add(String(mapped));
                }
                if (doc.AwayId != null) {
                    const mapped = teamMap.get(String(doc.AwayId));
                    if (mapped) teamsToAdd.add(String(mapped));
                }
                if (doc.VenueId != null) {
                    const mapped = venueMap.get(String(doc.VenueId));
                    if (mapped) venuesToAdd.add(String(mapped));
                }
            }

            const update = {
                $push: {
                    gameEntries: { $each: entriesToCreate }
                }
            };

            if (teamsToAdd.size) {
                update.$addToSet = update.$addToSet || {};
                update.$addToSet.teamsList = { $each: Array.from(teamsToAdd).map(toObjectId) };
            }

            if (venuesToAdd.size) {
                update.$addToSet = update.$addToSet || {};
                update.$addToSet.venuesList = { $each: Array.from(venuesToAdd).map(toObjectId) };
            }

            await User.findByIdAndUpdate(user._id, update);

            const enriched = await enrichGameEntries(entriesToCreate);

            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.json({ success: true, entries: enriched });
            }

            return res.redirect('/profileGames/' + user._id);
        }

        const ratedEntryCount = (user.gameEntries || []).reduce((sum, entry) => {
            return sum + (entry && entry.elo != null ? 1 : 0);
        }, 0);
        const isInitial = ratedEntryCount < 5;
        const ratingProvided = rating !== undefined && rating !== '';
        let finalElo = isInitial && ratingProvided ? ratingToElo(rating) : null;

        const numericGameId = Number(gameId);
        const pastGameDoc = await PastGame.findOne({ gameId: numericGameId });
        if(!pastGameDoc) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const canonicalGameId = Number(pastGameDoc.gameId ?? pastGameDoc.Id);
        if(!Number.isFinite(canonicalGameId)){
            return res.status(400).json({ error: 'Game identifier invalid' });
        }

        const entry = {
            gameId: String(canonicalGameId),
            elo: finalElo,
            rating: null,
            comment: sanitizedComment || null,
            image: req.file ? '/uploads/' + req.file.filename : null
        };

        const alreadyExists = user.gameEntries.some(e => String(e.gameId) === String(canonicalGameId));
        if (alreadyExists) {
            const enrichedEntries = await mergeUserGames(user);
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

        const newGameObjectId = pastGameDoc._id;

        const finalizedGames = (user.gameElo || []).filter(g => g.finalized);
        const missingGameRefs = finalizedGames
            .filter(g => g.gameId == null && g.game)
            .map(g => g.game);
        if(missingGameRefs.length){
            const pastGameDocs = await PastGame.find({ _id: { $in: missingGameRefs } })
                .select('_id gameId Id')
                .lean();
            const pastGameMap = {};
            pastGameDocs.forEach(doc => {
                pastGameMap[String(doc._id)] = doc;
            });
            finalizedGames.forEach(g => {
                if(g.gameId == null){
                    const pg = pastGameMap[String(g.game)];
                    if(pg){
                        const derivedId = Number(pg.gameId ?? pg.Id);
                        if(Number.isFinite(derivedId)){
                            g.gameId = derivedId;
                        }
                    }
                }
            });
        }
        let minElo = 1000;
        let maxElo = 2000;

        const parseGameId = value => {
            if (value === undefined || value === null || value === '') return null;
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        };
        const entryGameId = canonicalGameId;
        const findComparisonEntry = id => {
            const numericId = parseGameId(id);
            if (numericId == null) return null;
            return finalizedGames.find(g => parseGameId(g.gameId) === numericId);
        };

        if(!isInitial){
            const comp1 = findComparisonEntry(compareGameId1);
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

            const comp2 = findComparisonEntry(compareGameId2);
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

            const comp3 = findComparisonEntry(compareGameId3);
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

        if(finalElo === null && (!isInitial || ratingProvided)) {
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

        if(isInitial){
            const parsed = parseFloat(rating);
            entry.rating = Number.isFinite(parsed) ? parsed : null;
        } else {
            const comparisons = [
                parseGameId(compareGameId1) != null && (winner1 === 'new' || winner1 === 'existing')
                    ? { compareGameId: parseGameId(compareGameId1), winner: winner1 }
                    : null,
                parseGameId(compareGameId2) != null && (winner2 === 'new' || winner2 === 'existing')
                    ? { compareGameId: parseGameId(compareGameId2), winner: winner2 }
                    : null,
                parseGameId(compareGameId3) != null && (winner3 === 'new' || winner3 === 'existing')
                    ? { compareGameId: parseGameId(compareGameId3), winner: winner3 }
                    : null
            ].filter(Boolean);
            entry.rating = comparisons.length ? comparisons : null;
        }

        entry.elo = finalElo;
        if (entry.elo != null) {
            entry.ratingPrompted = true;
        }

        const newEloEntry = {
            game: newGameObjectId,
            gameId: entryGameId,
            elo: finalElo,
            finalized: true,
            comparisonHistory: []
        };

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
    gameElo: newEloEntry,
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



exports.rateExistingGame = [uploadDisk.single('photo'), async (req, res, next) => {
    try {
        const entryId = req.params.id;
        const {
            rating,
            comment,
            compareGameId1,
            winner1,
            compareGameId2,
            winner2,
            compareGameId3,
            winner3
        } = req.body;

        const sanitizedComment = sanitizeComment(comment || '');

        const user = await User.findById(req.user.id);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const entry = user.gameEntries.id(entryId);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });

        const entryGameIdNumeric = resolveEntryGameId(entry);
        if (entryGameIdNumeric == null) {
            return res.status(400).json({ error: 'Game identifier missing' });
        }

        const ratedCount = (user.gameEntries || []).reduce((sum, current) => {
            if (String(current._id) === String(entryId)) return sum;
            return current.elo != null ? sum + 1 : sum;
        }, 0);

        let finalElo = null;
        let ratingPayload = null;
        let minElo = 1000;
        let maxElo = 2000;

        const parseGameId = value => {
            if (value === undefined || value === null || value === '') return null;
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        };

        const comparisonsRaw = [
            { id: compareGameId1, winner: winner1 },
            { id: compareGameId2, winner: winner2 },
            { id: compareGameId3, winner: winner3 }
        ];

        const pastGameDoc = await (async () => {
            let doc = await PastGame.findOne({ gameId: entryGameIdNumeric });
            if (!doc) {
                doc = await PastGame.findOne({ Id: entryGameIdNumeric });
            }
            return doc;
        })();

        const userEloEntries = user.gameElo || [];
        const finalizedGames = userEloEntries.filter(g => g.finalized);

        if (finalizedGames.length) {
            const missingGameRefs = finalizedGames
                .filter(g => g.gameId == null && g.game)
                .map(g => g.game);
            if (missingGameRefs.length) {
                const pastGameDocs = await PastGame.find({ _id: { $in: missingGameRefs } })
                    .select('_id gameId Id')
                    .lean();
                const pastGameMap = {};
                pastGameDocs.forEach(doc => { pastGameMap[String(doc._id)] = doc; });
                finalizedGames.forEach(g => {
                    if (g.gameId == null) {
                        const pg = pastGameMap[String(g.game)];
                        if (pg) {
                            const derivedId = Number(pg.gameId ?? pg.Id);
                            if (Number.isFinite(derivedId)) {
                                g.gameId = derivedId;
                            }
                        }
                    }
                });
            }
        }

        const existingEloRecord = userEloEntries.find(e => {
            const numeric = parseGameId(e.gameId);
            if (numeric != null && numeric === entryGameIdNumeric) return true;
            if (!pastGameDoc) return false;
            return e.game && String(e.game) === String(pastGameDoc._id);
        });

        if (existingEloRecord) {
            if (Number.isFinite(existingEloRecord.minElo)) minElo = existingEloRecord.minElo;
            if (Number.isFinite(existingEloRecord.maxElo)) maxElo = existingEloRecord.maxElo;
        }

        if (ratedCount < 5) {
            const parsedRating = parseFloat(rating);
            if (Number.isNaN(parsedRating)) {
                return res.status(400).json({ error: 'Rating required for manual scoring' });
            }
            ratingPayload = Number(parsedRating.toFixed(1));
            finalElo = ratingToElo(parsedRating);
        } else {
            const validComparisons = comparisonsRaw
                .map(item => {
                    const numericId = parseGameId(item.id);
                    if (numericId == null) return null;
                    if (item.winner !== 'new' && item.winner !== 'existing') return null;
                    return { compareGameId: numericId, winner: item.winner };
                })
                .filter(Boolean);

            ratingPayload = validComparisons.length ? validComparisons : null;

            const findComparisonEntry = id => finalizedGames.find(g => parseGameId(g.gameId) === id);

            const comparisonDocs = [];
            validComparisons.forEach(({ compareGameId, winner }) => {
                const comparisonEntry = findComparisonEntry(compareGameId);
                if (!comparisonEntry || !Number.isFinite(comparisonEntry.elo)) return;
                if (winner === 'new') {
                    minElo = comparisonEntry.elo;
                } else if (winner === 'existing') {
                    maxElo = comparisonEntry.elo;
                }
                if (pastGameDoc && comparisonEntry.game) {
                    comparisonDocs.push({
                        userId: user._id,
                        gameA: pastGameDoc._id,
                        gameB: comparisonEntry.game,
                        winner: winner === 'new' ? pastGameDoc._id : comparisonEntry.game
                    });
                }
            });

            if (comparisonDocs.length) {
                await GameComparison.insertMany(comparisonDocs);
            }

            if (Number.isNaN(minElo) || Number.isNaN(maxElo)) {
                minElo = 1000;
                maxElo = 2000;
            }
            if (minElo > maxElo) {
                const tmp = minElo;
                minElo = maxElo;
                maxElo = tmp;
            }

            if (validComparisons.length) {
                finalElo = Math.floor((minElo + maxElo) / 2);
            } else if (existingEloRecord && Number.isFinite(existingEloRecord.elo)) {
                finalElo = existingEloRecord.elo;
            } else if (entry.elo != null) {
                finalElo = entry.elo;
            } else {
                finalElo = 1500;
            }
        }

        if (Number.isNaN(minElo) || Number.isNaN(maxElo)) {
            minElo = 1000;
            maxElo = 2000;
        }
        if (minElo > maxElo) {
            const tmp = minElo;
            minElo = maxElo;
            maxElo = tmp;
        }

        entry.elo = finalElo;
        entry.rating = ratingPayload;
        entry.comment = sanitizedComment || null;
        entry.ratingPrompted = true;
        if (req.file) {
            entry.image = '/uploads/' + req.file.filename;
        }

        if (pastGameDoc) {
            let updated = false;
            const commentObj = pastGameDoc.comments.find(c => String(c.userId) === String(user._id));
            if (commentObj) {
                commentObj.comment = sanitizedComment;
                updated = true;
            } else if (sanitizedComment) {
                pastGameDoc.comments.push({ userId: user._id, comment: sanitizedComment });
                updated = true;
            }
            if (updated) {
                await pastGameDoc.save();
            }
        }

        let targetEloEntry = existingEloRecord;
        if (!targetEloEntry) {
            targetEloEntry = {
                game: pastGameDoc ? pastGameDoc._id : null,
                gameId: entryGameIdNumeric,
                elo: finalElo,
                finalized: true,
                comparisonHistory: [],
                minElo,
                maxElo,
                updatedAt: new Date()
            };
            user.gameElo.push(targetEloEntry);
        } else {
            targetEloEntry.elo = finalElo;
            targetEloEntry.finalized = true;
            targetEloEntry.minElo = minElo;
            targetEloEntry.maxElo = maxElo;
            targetEloEntry.updatedAt = new Date();
            targetEloEntry.gameId = entryGameIdNumeric;
            if (pastGameDoc) {
                targetEloEntry.game = pastGameDoc._id;
            }
        }

        await user.save();

        const enriched = await enrichGameEntries([entry]);

        res.json({
            success: true,
            entry: enriched[0],
            finalElo,
            rating: ratingPayload
        });
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
        entry.ratingPrompted = true;
        if(req.file){
            entry.image = '/uploads/' + req.file.filename;
        }

        const entryGameIdNumeric = Number(entry.gameId);
        const pastGameDoc = await PastGame.findOne({ gameId: entryGameIdNumeric });
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

        const targetGameId = pastGameDoc && Number.isFinite(pastGameDoc.gameId)
            ? pastGameDoc.gameId
            : entryGameIdNumeric;
        const eloEntry = user.gameElo.find(e => {
            if (e.gameId == null) return false;
            const numericId = Number(e.gameId);
            return Number.isFinite(numericId) && Number.isFinite(targetGameId) && numericId === targetGameId;
        });
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

        const entryGameIdNumeric = Number(entry.gameId);
        const pastGameDoc = await PastGame.findOne({ gameId: entryGameIdNumeric });

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

        const targetGameId = pastGameDoc && Number.isFinite(pastGameDoc.gameId)
            ? pastGameDoc.gameId
            : entryGameIdNumeric;
        const idx = user.gameElo.findIndex(e => {
            if (e.gameId == null) return false;
            const numericId = Number(e.gameId);
            return Number.isFinite(numericId) && Number.isFinite(targetGameId) && numericId === targetGameId;
        });
        if(idx >= 0){
            user.gameElo.splice(idx,1);
        }

        await user.save();

        res.json({ success:true });
    } catch(err){
        next(err);
    }
};

