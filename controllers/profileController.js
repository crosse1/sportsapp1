const User = require('../models/users');

exports.getSignIn= (req, res) => {
    res.render('contact');
};

exports.saveUser = async (req, res, next) => {
    const { name, email, phoneNumber } = req.body;
    try {
        const newUser = new User({
            name, email, phoneNumber
        });
        await newUser.save();
        
        
        res.redirect(`/thanks?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phoneNumber=${encodeURIComponent(phoneNumber)}`);
    } catch (error) {
        next(error);
    }
};



exports.getProfile = (req, res) => {
    const { name, email, phoneNumber } = req.query;

    if (!name || !email || !phoneNumber) {
        return res.redirect('/contact');
    }

    res.render('thanks', { name, email, phoneNumber });
};

exports.getAllUsers = async (req, res, next) => {
    try{
        const users = await User.find();
        res.render("users", {users});
    } catch (error) {
        next(error);
    }
    
};
