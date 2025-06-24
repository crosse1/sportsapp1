const mongoose = require('mongoose');

userSchema = mongoose.Schema({
    name: String,
    email: String,
    phoneNumber: Number
});

module.exports = mongoose.model("User", userSchema);

