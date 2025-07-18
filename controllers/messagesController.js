const Message = require('../models/Message');
const User = require('../models/users');

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

exports.startThread = async (req, res, next) => {
    try {
        const otherId = req.params.id;
        if (otherId === req.user.id) return res.redirect('/profile');
        let thread = await Message.findOne({
            participants: { $all: [req.user.id, otherId] },
            'participants.2': { $exists: false }
        });
        if (!thread) {
            thread = new Message({ participants: [req.user.id, otherId], messages: [], unreadBy: [] });
            await thread.save();
            await User.updateMany({ _id: { $in: [req.user.id, otherId] } }, { $push: { messageThreads: thread._id } });
        }
        res.redirect(`/messages/${thread._id}`);
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
        const content = req.body.content;
        if (content && content.trim().length) {
            thread.messages.push({ sender: req.user.id, content: content.trim() });
            thread.lastUpdated = new Date();
            thread.unreadBy = thread.participants.filter(p => String(p) !== req.user.id);
            await thread.save();
        }
        res.redirect(`/messages/${thread._id}`);
    } catch (err) {
        next(err);
    }
};
