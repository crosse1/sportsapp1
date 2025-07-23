const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        maxlength: 20,
        match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.']
    },
    email: String,
    phoneNumber: String,
    password: String,
    favoriteTeams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    newFollowers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],
    gamesList: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }], default: [] },
    teamsList: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }], default: [] },
    venuesList: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Venue' }], default: [] },
    gameEntries: [{
        game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
        rating: Number,
        comment: String,
        image: String
    }],
    profileImage: {
        data: Buffer,
        contentType: String
    },
    followersCount: {
        type: Number,
        default: 0
    },
    followingCount: {
        type: Number,
        default: 0
    },
    location: {
        latitude: Number,
        longitude: Number,
        updatedAt: Date
    },
    messageThreads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }]
});

// Automatically hash a password before saving
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        try {
            const salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, salt);
        } catch (err) {
            return next(err);
        }
    }
    next();
});

userSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.password);
};


module.exports = mongoose.model('User', userSchema);

