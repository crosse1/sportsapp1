const Message = require('../models/Message');
const User = require('../models/users');

async function isMutualFollow(userAId, userBId){
    const [a,b] = await Promise.all([
        User.findById(userAId),
        User.findById(userBId)
    ]);
    if(!a || !b) return false;
    const aFollows = a.following.some(f => String(f) === String(userBId));
    const bFollows = b.following.some(f => String(f) === String(userAId));
    return aFollows && bFollows;
}

exports.listThreads = async (req, res, next) => {
    try {
        const threads = await Message.find({ participants: req.user.id })
            .sort({ lastUpdated: -1 })
            .populate('participants messages.sender');
        res.render('messages', { threads });
    } catch (err) {
        next(err);
    }
};

exports.viewThread = async (req, res, next) => {
    try {
        const thread = await Message.findById(req.params.id)
            .populate('participants messages.sender');
        if (!thread || !thread.participants.some(p => String(p._id||p) === req.user.id)) {
            return res.redirect('/messages');
        }
        thread.unreadBy = thread.unreadBy.filter(u => String(u) !== req.user.id);
        await thread.save();
        res.render('thread', { thread });
    } catch (err) {
        next(err);
    }
};

exports.renderModal = async (req, res, next) => {
    try {
        const threads = await Message.find({ participants: req.user.id })
            .sort({ lastUpdated: -1 })
            .populate('participants messages.sender');
        let currentThread = null;
        if(req.query.thread){
            currentThread = threads.find(t => String(t._id) === String(req.query.thread));
            if(currentThread){
                currentThread.unreadBy = currentThread.unreadBy.filter(u => String(u) !== req.user.id);
                await currentThread.save();
            }
        }
        res.render('messagesModal', { layout:false, threads, currentThread });
    } catch (err) {
        next(err);
    }
};

exports.startThread = async (req, res, next) => {
    try {
        const otherId = req.params.id;
        if (otherId === req.user.id) return res.redirect('/profile');
        const allowed = await isMutualFollow(req.user.id, otherId);
        if(!allowed){
            const msg = { error: 'You can only message users who follow you back.' };
            if(req.headers.accept && req.headers.accept.includes('application/json')) return res.status(403).json(msg);
            return res.status(403).send(msg.error);
        }
        let thread = await Message.findOne({
            participants: { $all: [req.user.id, otherId] },
            'participants.2': { $exists: false }
        });
        if (!thread) {
            thread = new Message({ participants: [req.user.id, otherId], messages: [], unreadBy: [] });
            await thread.save();
            await User.updateMany({ _id: { $in: [req.user.id, otherId] } }, { $push: { messageThreads: thread._id } });
        }
        if(req.headers.accept && req.headers.accept.includes('application/json')){
            return res.json({ threadId: thread._id });
        }
        res.redirect(`/messages/${thread._id}`);
    } catch (err) {
        next(err);
    }
};

exports.getOrCreateThread = async (req, res, next) => {
    try {
        const otherId = req.params.userId;
        if (otherId === req.user.id) {
            return res.status(400).json({ error: 'Cannot message yourself.' });
        }
        const allowed = await isMutualFollow(req.user.id, otherId);
        if (!allowed) {
            return res.status(403).json({ error: 'You can only message users who follow you back.' });
        }
        let thread = await Message.findOne({
            participants: { $all: [req.user.id, otherId] },
            'participants.2': { $exists: false }
        });
        if (!thread) {
            thread = new Message({ participants: [req.user.id, otherId], messages: [], unreadBy: [] });
            await thread.save();
            await User.updateMany({ _id: { $in: [req.user.id, otherId] } }, { $push: { messageThreads: thread._id } });
        }
        res.json({ threadId: thread._id });
    } catch (err) {
        next(err);
    }
};

exports.sendMessage = async (req, res, next) => {
    try {
        const thread = await Message.findById(req.params.id);
        if (!thread || !thread.participants.some(p => String(p) === req.user.id)) {
            return res.redirect('/messages');
        }
        const other = thread.participants.find(p => String(p) !== req.user.id);
        const allowed = await isMutualFollow(req.user.id, other);
        if(!allowed){
            const msg = { error: 'You can only message users who follow you back.' };
            if(req.headers.accept && req.headers.accept.includes('application/json')) return res.status(403).json(msg);
            return res.status(403).send(msg.error);
        }
        const content = req.body.content;
        if (content && content.trim().length) {
            thread.messages.push({ sender: req.user.id, content: content.trim() });
            thread.lastUpdated = new Date();
            thread.unreadBy = thread.participants.filter(p => String(p) !== req.user.id);
            await thread.save();
        }
        if(req.headers.accept && req.headers.accept.includes('application/json')){
            return res.json({ success: true });
        }
        res.redirect(`/messages/${thread._id}`);
    } catch (err) {
        next(err);
    }
};

exports.renderInboxModal = async (req, res, next) => {
    try {
        const threads = await Message.find({ participants: req.user.id })
            .sort({ lastUpdated: -1 })
            .populate('participants messages.sender');
        let currentThread = null;
        if(req.query.thread){
            currentThread = threads.find(t => String(t._id) === String(req.query.thread));
            if(currentThread){
                currentThread.unreadBy = currentThread.unreadBy.filter(u => String(u) !== req.user.id);
                await currentThread.save();
            }
        }
        const followers = await User.find({ _id: { $in: req.user.newFollowers || [] } })
            .select('username profileImage');
        res.render('inboxModal', { layout:false, threads, currentThread, followers });
    } catch (err) {
        next(err);
    }
};

