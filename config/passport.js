const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (clientID && clientSecret && !clientID.includes('your_google_client_id')) {
  passport.use(new GoogleStrategy({
    clientID,
    clientSecret,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback'
  },
async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;
    const avatar = profile.photos[0]?.value || null;

    // 1. Check if user exists by googleId
    let user = await User.findOne({ googleId: profile.id });
    if (user) {
      user.lastLogin = new Date();
      await user.save();
      return done(null, user);
    }

    // 2. Check if user exists by email (link accounts)
    user = await User.findOne({ email });
    if (user) {
      user.googleId = profile.id;
      user.avatar = avatar;
      user.lastLogin = new Date();
      await user.save();
      return done(null, user);
    }

    // 3. Create new user (default role: patient)
    user = new User({
      name: profile.displayName,
      email,
      googleId: profile.id,
      avatar,
      role: 'patient',
      isActive: true,
      lastLogin: new Date()
    });
    await user.save();
    return done(null, user);

  } catch (err) {
    return done(err, null);
  }
}));
} else if (process.env.NODE_ENV !== 'production') {
  console.log('ℹ️ Google OAuth strategy not initialized (credentials not provided in environment).');
}

// Required even with session:false — prevents passport runtime errors
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-password');
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
