const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const VitalSigns = require('../models/VitalSigns');
const auth = require('../middleware/auth');
const { analyzeVitals, analyzeTrend } = require('../utils/aiEngine');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { processAiChat } = require('../utils/ai/aiService');
const { getSafeConfigSummary } = require('../utils/ai/aiConfig');

// Dedicated Per-User Rate Limiter for AI Chat
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  handler: (req, res, _next, options) => {
    res.status(options.statusCode || 429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many AI requests. Please slow down.',
        requestId: req.id
      },
      message: 'Too many AI requests. Please slow down.'
    });
  }
});

/**
 * GET /api/ai/status
 * Exposes safe, non-sensitive runtime AI configuration metadata.
 * Sourced solely from safe configuration summaries; never exposes secrets.
 */
router.get('/status', auth, (req, res) => {
  const safeConfig = getSafeConfigSummary();
  res.json({
    success: true,
    ai: {
      enabled: safeConfig.enabled,
      provider: safeConfig.provider,
      model: safeConfig.model
    },
    requestId: req.id
  });
});

/**
 * POST /api/ai/chat
 * Unified, role-aware AI chat endpoint for all CareLink portals.
 * Enforces authentication, capability permissions, and cross-patient isolation.
 */
router.post('/chat', auth, aiLimiter, async (req, res, next) => {
  try {
    const { message, contextType, patientId, resourceId, simulateError, simulateTimeout } = req.body || {};

    const result = await processAiChat({
      user: req.user,
      message,
      contextType,
      targetPatientId: patientId,
      resourceId,
      requestId: req.id,
      options: { simulateError, simulateTimeout }
    });

    res.json({
      success: true,
      data: result,
      requestId: req.id
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/analyze/:patientId — analyze latest vitals
router.get('/analyze/:patientId', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.patientId) {
      return next(new ForbiddenError('Access denied'));
    }
    const latest = await VitalSigns.findOne({ patientId: req.params.patientId })
      .sort({ recordedAt: -1 });

    if (!latest) {
      return next(new NotFoundError('No vitals found for this patient'));
    }

    const ai = analyzeVitals(latest.heartRate, latest.spo2, latest.temperature, latest.stepCount);
    res.json({
      patientId: req.params.patientId,
      vitals: {
        heartRate: latest.heartRate,
        spo2: latest.spo2,
        temperature: latest.temperature
      },
      ai,
      recordedAt: latest.recordedAt
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/history/:patientId — 7-day score history
router.get('/history/:patientId', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.patientId) {
      return next(new ForbiddenError('Access denied'));
    }
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const history = await VitalSigns.find({
      patientId: req.params.patientId,
      recordedAt: { $gte: sevenDaysAgo }
    }).sort({ recordedAt: 1 });

    const scoreHistory = history.map(v => v.aiScore);
    const trend = analyzeTrend(scoreHistory);

    res.json({
      history: history.map(v => ({
        date: v.recordedAt,
        score: v.aiScore,
        status: v.aiStatus,
        heartRate: v.heartRate,
        spo2: v.spo2,
        temperature: v.temperature
      })),
      trend,
      scoreHistory
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
