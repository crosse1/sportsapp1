const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    favoriteTeams: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }], default: [] },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    newFollowers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],
    // Track game check-ins using the permanent gameId. Using strings allows us to
    // reference games after they migrate from the `Game` collection to
    // `PastGame` without losing the association.
    teamsList: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }], default: [] },
    venuesList: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Venue' }], default: [] },
    badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],
    points: { type: Number, default: 0 },
    gameEntries: [{
        gameId: String,
        elo: Number,
        comment: String,
        image: String,
        checkedIn: { type: Boolean, default: false },
        ratingPrompted: { type: Boolean, default: false }
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
    messageThreads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    gameElo: {
        type: [{
          game: { type: mongoose.Schema.Types.ObjectId, ref: 'PastGame' },
          elo: Number,
          comparisonHistory: [{
            againstGame: { type: mongoose.Schema.Types.ObjectId, ref: 'PastGame' },
            preferred: Boolean,
            timestamp: Date
          }],
          finalized: { type: Boolean, default: false },
          minElo: { type: Number, default: 1000 },
          maxElo: { type: Number, default: 2000 },
          updatedAt: { type: Date }
        }],
        default: []
      }
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

