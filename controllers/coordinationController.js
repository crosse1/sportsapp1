const mongoose = require('mongoose');
const Game = require('../models/Game');
const User = require('../models/users');
const GameCoordination = require('../models/GameCoordination');
const Notification = require('../models/Notification');
const GameChatMessage = require('../models/GameChatMessage');

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

        res.json({ success: true, response: normalized });
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
