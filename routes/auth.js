const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { BadRequestError } = require('../utils/errors');

// ─── Validation rules ─────────────────────────────────────────────────────
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['patient', 'doctor', 'admin', 'lab']).withMessage('Invalid role')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required')
];

// ─── POST /api/auth/register ───────────────────────────────────────────────
router.post('/register', registerValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new BadRequestError(errors.array()[0].msg));
  }

  try {
    const { name, email, password, role, phone, age, gender, bloodGroup, specialization, department } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return next(new BadRequestError('Email already registered'));

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      name, email, password: hashedPassword, role,
      phone, age, gender, bloodGroup, specialization, department
    });
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Set secure httpOnly cookie — JWT is never returned to JavaScript
    res.app.locals.setAuthCookie(res, token);

    res.status(201).json({
      message: 'Registration successful',
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────
router.post('/login', loginValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new BadRequestError(errors.array()[0].msg));
  }

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return next(new BadRequestError('Invalid email or password'));

    // Google-only accounts have no password
    if (!user.password) {
      return next(new BadRequestError('This account uses Google sign-in. Please use Google login.'));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return next(new BadRequestError('Invalid email or password'));

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Set secure httpOnly cookie — JWT is never returned to JavaScript
    res.app.locals.setAuthCookie(res, token);

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedDoctor: user.assignedDoctor
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────
// Returns authenticated user's safe profile. Never returns a JWT.
// The browser sends the httpOnly cookie automatically when credentials: 'include' is used.
router.get('/me', require('../middleware/auth'), (req, res) => {
  const u = req.user;
  res.json({
    authenticated: true,
    user: {
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatar: u.avatar || null,
      assignedDoctor: u.assignedDoctor || null,
      specialization: u.specialization || null,
      department: u.department || null,
      phone: u.phone || null,
      age: u.age || null,
      gender: u.gender || null,
      bloodGroup: u.bloodGroup || null,
      isActive: u.isActive,
      lastLogin: u.lastLogin || null
    }
  });
});

// ─── POST /api/auth/logout ─────────────────────────────────────────────────
// Clears the authentication cookie server-side. Client-side state must also be cleared.
router.post('/logout', (_req, res) => {
  res.app.locals.clearAuthCookie(res);
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
