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
    phoneNumber: Number,
    password: String,
    favoriteTeams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true }],
    profileImage: {
        type: String,
        default: function() {
            return (this.favoriteTeams && this.favoriteTeams[0] && this.favoriteTeams[0].logo) ? this.favoriteTeams[0].logo : undefined;
        }
    },
    followersCount: {
        type: Number,
        default: 0
    },
    followingCount: {
        type: Number,
        default: 0
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

    if (!this.profileImage && this.favoriteTeams && this.favoriteTeams.length > 0) {
        try {
            const Team = mongoose.model('Team');
            const team = await Team.findById(this.favoriteTeams[0]);
            if (team && team.logos && team.logos.length > 0) {
                this.profileImage = team.logos[0];
            }
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

