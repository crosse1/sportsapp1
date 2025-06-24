
const jwt = require('../lib/simpleJWT');



const User = require('../models/users');

exports.getSignUp = (req, res) => {
    res.render('contact');
};

exports.getLogin = (req, res) => {
    res.render('login', { layout: false });
};

exports.saveUser = async (req, res, next) => {
    const { name, email, phoneNumber, password } = req.body;
    try {
        const newUser = new User({ name, email, phoneNumber, password });
        await newUser.save();
        const token = jwt.sign({ id: newUser._id, name: newUser.name, email: newUser.email, phoneNumber: newUser.phoneNumber }, 'secret');
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
        const token = jwt.sign({ id: user._id, name: user.name, email: user.email, phoneNumber: user.phoneNumber }, 'secret');
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/welcome');
    } catch (error) {
        next(error);
    }
};



exports.getProfile = (req, res) => {
    const user = req.user;
    if (!user) return res.redirect('/login');
    res.render('thanks', { name: user.name, email: user.email, phoneNumber: user.phoneNumber });
};

exports.getAllUsers = async (req, res, next) => {
    try{
        const users = await User.find();
        res.render("users", {users});
    } catch (error) {
        next(error);
    }
    
};
