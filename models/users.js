const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

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
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    uploadedPic: String,
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

// Delete uploaded profile picture file when user is removed
userSchema.pre('remove', function(next) {
    if (this.uploadedPic) {
        const picPath = path.join(__dirname, '../public/uploads/profilePics', this.uploadedPic);
        fs.unlink(picPath, () => next());
    } else {
        next();
    }
});

module.exports = mongoose.model('User', userSchema);

