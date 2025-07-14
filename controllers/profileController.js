
const jwt = require('../lib/simpleJWT');



const User = require('../models/users');

exports.getSignUp = (req, res) => {
    res.render('contact', { layout: false });
};

exports.getLogin = (req, res) => {
    res.render('login', { layout: false });
};

exports.saveUser = async (req, res, next) => {
    const { name, email, phoneNumber, password, profileImage } = req.body;
    try {
        const newUser = new User({ name, email, phoneNumber, password, profileImage });
        await newUser.save();
        const token = jwt.sign({ id: newUser._id, name: newUser.name, email: newUser.email, phoneNumber: newUser.phoneNumber, profileImage: newUser.profileImage }, 'secret');
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/welcome');
    } catch (error) {
        next(error);
    }
};

exports.loginUser = async (req, res, next) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.redirect('/login');
        const match = await user.comparePassword(password);
        if (!match) return res.redirect('/login');
        const token = jwt.sign({ id: user._id, name: user.name, email: user.email, phoneNumber: user.phoneNumber, profileImage: user.profileImage }, 'secret');
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/welcome');
    } catch (error) {
        next(error);
    }
};



exports.getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.redirect('/login');
        res.render('profile', { user });
    } catch (err) {
        next(err);
    }
};

exports.getEditProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.redirect('/login');
        res.render('editProfile', { user });
    } catch (err) {
        next(err);
    }
};

exports.updateProfile = async (req, res, next) => {
    try {
        const { name, email, phoneNumber, profileImage } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.redirect('/login');
        user.name = name;
        user.email = email;
        user.phoneNumber = phoneNumber;
        if (profileImage) user.profileImage = profileImage;
        await user.save();
        const token = jwt.sign({ id: user._id, name: user.name, email: user.email, phoneNumber: user.phoneNumber, profileImage: user.profileImage }, 'secret');
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/profile');
    } catch (err) {
        next(err);
    }
};

exports.getAllUsers = async (req, res, next) => {
    try{
        const users = await User.find();
        res.render("users", {users});
    } catch (error) {
        next(error);
    }
    
};
