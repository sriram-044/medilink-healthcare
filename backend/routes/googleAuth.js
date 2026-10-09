const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');

// Step 1: Redirect user to Google
router.get('/google', (req, res, next) => {
  if (!passport._strategy('google')) {
    return res.status(503).json({ message: 'Google OAuth is not configured on this server.' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Step 2: Google redirects back here after auth
// SECURITY: JWT is set as an httpOnly cookie and NEVER placed in the URL.
router.get('/google/callback',
  (req, res, next) => {
    if (!passport._strategy('google')) {
      return res.redirect('/?error=google_not_configured');
    }
    passport.authenticate('google', { session: false, failureRedirect: '/?error=google_failed' })(req, res, next);
  },
  (req, res) => {
    const user = req.user;
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set the JWT in a secure httpOnly cookie — never exposed in the URL
    res.app.locals.setAuthCookie(res, token);

    // Redirect to auth-success page WITHOUT any token or user data in the URL
    res.redirect('/auth-success.html');
  }
);

module.exports = router;
