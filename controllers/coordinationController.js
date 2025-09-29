const mongoose = require('mongoose');
const Game = require('../models/Game');
const User = require('../models/users');
const GameCoordination = require('../models/GameCoordination');
const Notification = require('../models/Notification');
const GameChatMessage = require('../models/GameChatMessage');
const { getGameById } = require('../lib/gameUtils');

const PLACEHOLDER_LOGO = '/images/placeholder.jpg';

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

async function ensureCoordination(ownerId, gameId) {
    const existing = await GameCoordination.findOne({ ownerId, gameId });
    if (existing) return existing;
    return GameCoordination.create({ ownerId, gameId, invitedUsers: [] });
}

function mapInvite(invite) {
    const user = invite.userId;
    const userId = user && user._id ? user._id : invite.userId;
    return {
        _id: userId,
        username: user && user.username ? user.username : undefined,
        profileImageUrl: `/users/${userId}/profile-image`,
        response: invite.response || null
    };
}

function pickFirstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function extractTeamLogo(team) {
    if (!team) return PLACEHOLDER_LOGO;
    if (Array.isArray(team.logos) && team.logos.length) {
        return team.logos[0];
    }
    if (typeof team.logo === 'string' && team.logo) {
        return team.logo;
    }
    return PLACEHOLDER_LOGO;
}

async function buildInviteGameDetails(invite) {
    const canonicalGameId = Number(invite.gameId);
    if (Number.isFinite(canonicalGameId)) {
        const game = await getGameById(canonicalGameId);
        if (game) {
            const venueName = pickFirstString(
                game.venue && game.venue.name,
                game.venue && game.venue.fullName,
                game.venue,
                game.Venue
            );
            return {
                gameMongoId: invite.game ? String(invite.game._id || invite.game) : (game._id ? String(game._id) : null),
                permanentGameId: canonicalGameId,
                startDate: game.startDate ? new Date(game.startDate).toISOString() : null,
                venue: venueName,
                homeTeam: {
                    name: pickFirstString(
                        game.homeTeamName,
                        game.homeTeam && (game.homeTeam.teamName || game.homeTeam.school),
                        game.HomeTeam
                    ),
                    logo: extractTeamLogo(game.homeTeam)
                },
                awayTeam: {
                    name: pickFirstString(
                        game.awayTeamName,
                        game.awayTeam && (game.awayTeam.teamName || game.awayTeam.school),
                        game.AwayTeam
                    ),
                    logo: extractTeamLogo(game.awayTeam)
                }
            };
        }
    }

    if (invite.game) {
        const game = invite.game;
        return {
            gameMongoId: String(game._id || game),
            permanentGameId: Number.isFinite(canonicalGameId) ? canonicalGameId : (Number(game.gameId) || null),
            startDate: game.startDate ? new Date(game.startDate).toISOString() : null,
            venue: pickFirstString(
                game.venue && game.venue.name,
                game.venue && game.venue.fullName,
                game.venue
            ),
            homeTeam: {
                name: pickFirstString(game.homeTeamName, game.homeTeam && (game.homeTeam.teamName || game.homeTeam.school)),
                logo: extractTeamLogo(game.homeTeam)
            },
            awayTeam: {
                name: pickFirstString(game.awayTeamName, game.awayTeam && (game.awayTeam.teamName || game.awayTeam.school)),
                logo: extractTeamLogo(game.awayTeam)
            }
        };
    }

    if (invite.pastGame) {
        const game = invite.pastGame;
        return {
            gameMongoId: null,
            permanentGameId: Number.isFinite(canonicalGameId) ? canonicalGameId : (Number(game.gameId) || Number(game.Id) || null),
            startDate: game.StartDate ? new Date(game.StartDate).toISOString() : null,
            venue: pickFirstString(game.Venue),
            homeTeam: {
                name: pickFirstString(game.HomeTeam),
                logo: PLACEHOLDER_LOGO
            },
            awayTeam: {
                name: pickFirstString(game.AwayTeam),
                logo: PLACEHOLDER_LOGO
            }
        };
    }

    return null;
}

async function serializeInviteForModal(invite) {
    const details = await buildInviteGameDetails(invite);
    if (!details || !details.gameMongoId) {
        return null;
    }

    const inviter = invite.fromUser || {};
    const inviterId = inviter && inviter._id ? inviter._id : invite.fromUser;
    const inviterName = pickFirstString(inviter.displayName, inviter.username, 'Someone');

    return {
        id: String(invite._id),
        ownerId: inviterId ? String(inviterId) : null,
        ownerName: inviter && inviter.username ? inviter.username : inviterName,
        ownerDisplayName: inviterName,
        response: invite.response || null,
        gameId: details.gameMongoId,
        permanentGameId: details.permanentGameId,
        game: {
            startDate: details.startDate,
            venue: details.venue,
            homeTeam: details.homeTeam,
            awayTeam: details.awayTeam
        }
    };
}

exports.getCoordination = async (req, res, next) => {
    try {
        const { gameId } = req.params;
        const ownerId = req.query.owner;
        if (!isValidObjectId(gameId) || !isValidObjectId(ownerId)) {
            return res.status(400).json({ error: 'Invalid identifiers' });
        }

        const game = await Game.findById(gameId).select('_id');
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const isOwner = String(req.user.id) === String(ownerId);
        let coordination = await GameCoordination.findOne({ ownerId, gameId })
            .populate('invitedUsers.userId', 'username');

        if (!coordination && isOwner) {
            coordination = await ensureCoordination(ownerId, gameId);
            coordination = await coordination.populate('invitedUsers.userId', 'username');
        }

        if (!coordination) {
            return res.json({
                invitedUsers: [],
                isOwner: false,
                canInvite: false,
                canRespond: false,
                currentUserResponse: null,
                chatEnabled: false,
                canSendChat: false
            });
        }

        const invite = coordination.findInviteForUser(req.user.id);
        const canRespond = !!invite;
        const currentUserResponse = invite ? invite.response : null;
        const chatEnabled = isOwner || (invite && invite.response === 'yes');
        const canSendChat = chatEnabled && (isOwner || (invite && invite.response === 'yes'));

        const populatedInvites = coordination.invitedUsers.map(mapInvite);

        res.json({
            invitedUsers: populatedInvites,
            isOwner,
            canInvite: isOwner,
            canRespond,
            currentUserResponse,
            chatEnabled,
            canSendChat
        });
    } catch (err) {
        next(err);
    }
};

exports.inviteUser = async (req, res, next) => {
    try {
        const { gameId } = req.params;
        const { userId, ownerId } = req.body;

        if (!isValidObjectId(gameId) || !isValidObjectId(userId) || !isValidObjectId(ownerId)) {
            return res.status(400).json({ error: 'Invalid identifiers' });
        }

        if (String(ownerId) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the waitlist owner can invite users' });
        }

        if (String(userId) === String(ownerId)) {
            return res.status(400).json({ error: 'You cannot invite yourself' });
        }

        const [game, targetUser] = await Promise.all([
            Game.findById(gameId).select('awayTeamName homeTeamName startDate'),
            User.findById(userId).select('username')
        ]);

        if (!game || !targetUser) {
            return res.status(404).json({ error: 'Game or user not found' });
        }

        const coordination = await ensureCoordination(ownerId, gameId);
        const alreadyInvited = coordination.findInviteForUser(userId);
        if (alreadyInvited) {
            return res.status(409).json({ error: 'User already invited' });
        }

        coordination.invitedUsers.push({ userId, response: null });
        await coordination.save();

        const inviteRecord = {
            fromUser: ownerId,
            game: gameId,
            invitedAt: new Date(),
            response: null,
            modalQueued: true
        };
        if (Number.isFinite(Number(game.gameId))) {
            inviteRecord.gameId = Number(game.gameId);
        }

        const inviteQuery = { _id: userId, 'invites.fromUser': ownerId, 'invites.game': gameId };
        const inviteSet = {
            'invites.$.invitedAt': inviteRecord.invitedAt,
            'invites.$.response': null,
            'invites.$.modalQueued': true
        };
        if (inviteRecord.gameId != null) {
            inviteSet['invites.$.gameId'] = inviteRecord.gameId;
        }

        const updateExistingInvite = await User.updateOne(
            inviteQuery,
            {
                $set: inviteSet,
                $unset: { 'invites.$.respondedAt': '' }
            }
        );

        const matchedCount = updateExistingInvite && typeof updateExistingInvite.matchedCount === 'number'
            ? updateExistingInvite.matchedCount
            : (updateExistingInvite && typeof updateExistingInvite.n === 'number' ? updateExistingInvite.n : 0);

        if (!matchedCount) {
            await User.updateOne(
                { _id: userId },
                {
                    $push: {
                        invites: inviteRecord
                    }
                }
            );
        }

        const inviterName = req.user.username || (await User.findById(req.user.id).select('username'))?.username || 'Someone';
        const message = `${inviterName} invited you to ${game.awayTeamName} @ ${game.homeTeamName}`;

        await Notification.findOneAndUpdate(
            {
                recipientId: userId,
                senderId: ownerId,
                gameId,
                type: 'game-invite'
            },
            {
                recipientId: userId,
                senderId: ownerId,
                gameId,
                type: 'game-invite',
                message,
                status: 'pending',
                response: null
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({
            invitedUser: {
                _id: userId,
                username: targetUser.username,
                profileImageUrl: `/users/${userId}/profile-image`,
                response: null
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.respondToInvite = async (req, res, next) => {
    try {
        const { gameId } = req.params;
        const { response, ownerId } = req.body;
        const normalized = (response || '').toLowerCase();
        if (!['yes', 'no', 'maybe'].includes(normalized)) {
            return res.status(400).json({ error: 'Invalid response' });
        }
        if (!isValidObjectId(gameId)) {
            return res.status(400).json({ error: 'Invalid game id' });
        }

        const query = { gameId };
        if (ownerId && isValidObjectId(ownerId)) {
            query.ownerId = ownerId;
        }
        query['invitedUsers.userId'] = req.user.id;

        const update = await GameCoordination.findOneAndUpdate(
            query,
            { $set: { 'invitedUsers.$.response': normalized } },
            { new: true }
        );

        if (!update) {
            return res.status(404).json({ error: 'Invitation not found' });
        }

        await Notification.updateMany(
            {
                recipientId: req.user.id,
                gameId,
                ...(ownerId && isValidObjectId(ownerId) ? { senderId: ownerId } : {})
            },
            {
                status: 'read',
                response: normalized
            }
        );

        const effectiveOwnerId = ownerId && isValidObjectId(ownerId) ? ownerId : (update ? update.ownerId : null);
        const inviteMatch = { _id: req.user.id, 'invites.game': gameId };
        if (effectiveOwnerId) {
            inviteMatch['invites.fromUser'] = effectiveOwnerId;
        }
        await User.updateOne(
            inviteMatch,
            {
                $set: {
                    'invites.$.response': normalized,
                    'invites.$.respondedAt': new Date(),
                    'invites.$.modalQueued': false
                }
            }
        );

        res.json({ success: true, response: normalized });
    } catch (err) {
        next(err);
    }
};

exports.getQueuedInvites = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id)
            .select('invites')
            .populate({
                path: 'invites.fromUser',
                select: 'username displayName'
            })
            .populate({
                path: 'invites.game',
                populate: [
                    { path: 'homeTeam', select: 'teamName school logos logo' },
                    { path: 'awayTeam', select: 'teamName school logos logo' }
                ]
            })
            .populate('invites.pastGame')
            .lean();

        if (!user) {
            return res.status(404).json({ invites: [] });
        }

        const queuedInvites = (user.invites || []).filter(invite => invite.modalQueued);
        if (!queuedInvites.length) {
            return res.json({ invites: [] });
        }

        const serialized = (await Promise.all(queuedInvites.map(serializeInviteForModal))).filter(Boolean);

        const queuedIds = queuedInvites.map(invite => invite._id).filter(Boolean);
        if (queuedIds.length) {
            await User.updateOne(
                { _id: req.user.id },
                {
                    $set: { 'invites.$[invite].modalQueued': false }
                },
                {
                    arrayFilters: [
                        { 'invite._id': { $in: queuedIds } }
                    ]
                }
            );
        }

        res.json({ invites: serialized });
    } catch (err) {
        next(err);
    }
};

async function getCoordinationForChat(req, ownerId, gameId) {
    if (!isValidObjectId(ownerId) || !isValidObjectId(gameId)) {
        return null;
    }
    return GameCoordination.findOne({ ownerId, gameId });
}

function canAccessChat(userId, coordination, ownerId) {
    if (!coordination) return false;
    if (String(userId) === String(ownerId)) return true;
    const invite = coordination.findInviteForUser(userId);
    return invite && invite.response === 'yes';
}

exports.getChatMessages = async (req, res, next) => {
    try {
        const { gameId } = req.params;
        const ownerId = req.query.owner;
        if (!isValidObjectId(gameId) || !isValidObjectId(ownerId)) {
            return res.status(400).json({ error: 'Invalid identifiers' });
        }

        const coordination = await getCoordinationForChat(req, ownerId, gameId);
        if (!coordination) {
            return res.status(404).json({ error: 'Coordination not found' });
        }

        if (!canAccessChat(req.user.id, coordination, ownerId)) {
            return res.status(403).json({ error: 'Not authorized for chat' });
        }

        const messages = await GameChatMessage.find({ coordinationId: coordination._id })
            .sort({ timestamp: 1 })
            .limit(200)
            .populate('senderId', 'username');

        res.json({
            messages: messages.map(msg => ({
                _id: msg._id,
                message: msg.message,
                timestamp: msg.timestamp,
                sender: msg.senderId ? {
                    _id: msg.senderId._id,
                    username: msg.senderId.username
                } : null
            }))
        });
    } catch (err) {
        next(err);
    }
};

exports.postChatMessage = async (req, res, next) => {
    try {
        const { gameId } = req.params;
        const ownerId = req.body.ownerId;
        const message = (req.body.message || '').trim();
        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }
        if (!isValidObjectId(gameId) || !isValidObjectId(ownerId)) {
            return res.status(400).json({ error: 'Invalid identifiers' });
        }

        const coordination = await getCoordinationForChat(req, ownerId, gameId);
        if (!coordination) {
            return res.status(404).json({ error: 'Coordination not found' });
        }

        if (!canAccessChat(req.user.id, coordination, ownerId)) {
            return res.status(403).json({ error: 'Not authorized for chat' });
        }

        const newMessage = await GameChatMessage.create({
            coordinationId: coordination._id,
            gameId,
            senderId: req.user.id,
            message
        });

        const sender = await User.findById(req.user.id).select('username');

        res.status(201).json({
            _id: newMessage._id,
            message: newMessage.message,
            timestamp: newMessage.timestamp,
            sender: {
                _id: req.user.id,
                username: sender ? sender.username : 'You'
            }
        });
    } catch (err) {
        next(err);
    }
};
