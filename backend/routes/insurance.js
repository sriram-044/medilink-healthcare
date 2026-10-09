const express = require('express');
const router = express.Router();
const InsuranceClaim = require('../models/InsuranceClaim');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { escapeRegex, buildDateQuery, isValidObjectId } = require('../utils/queryHelper');
const { parsePagination, formatPaginatedResponse } = require('../utils/paginationHelper');
const { BadRequestError, NotFoundError } = require('../utils/errors');

// GET /api/insurance/claims — list all insurance claims
router.get('/claims', auth, role('insurance', 'admin', 'patient', 'doctor'), async (req, res, next) => {
  try {
    const { status, search, startDate, endDate, patientId } = req.query;
    let query = {};

    // Patient can only ever see their own claims
    if (req.user.role === 'patient') {
      query.patientId = req.user._id;
    } else if (patientId && isValidObjectId(patientId)) {
      query.patientId = patientId;
    }

    if (status) query.status = status;

    const dateQuery = buildDateQuery(startDate, endDate, 'claimDate');
    if (dateQuery) Object.assign(query, dateQuery);

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = [
        { claimId: { $regex: safe, $options: 'i' } },
        { policyNumber: { $regex: safe, $options: 'i' } },
        { hospitalName: { $regex: safe, $options: 'i' } },
        { treatmentDescription: { $regex: safe, $options: 'i' } }
      ];
    }

    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    const [total, claims] = await Promise.all([
      InsuranceClaim.countDocuments(query),
      InsuranceClaim.find(query)
        .populate('patientId', 'name email age bloodGroup phone')
        .sort({ claimDate: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(claims, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// POST /api/insurance/claims — submit claim
router.post('/claims', auth, async (req, res, next) => {
  try {
    const { hospitalName, claimAmount, policyNumber, treatmentDescription } = req.body;
    const claimId = 'CLM' + Math.floor(100000 + Math.random() * 900000);

    const claim = new InsuranceClaim({
      claimId,
      patientId: req.user._id,
      hospitalName,
      claimAmount,
      policyNumber,
      treatmentDescription,
      status: 'Pending'
    });

    await claim.save();
    res.status(201).json({ message: 'Insurance claim submitted successfully', claim });
  } catch (err) {
    next(err);
  }
});

// PUT /api/insurance/claims/:id/review — approve/reject claim
router.put('/claims/:id/review', auth, role('insurance', 'admin'), async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;
    const claim = await InsuranceClaim.findByIdAndUpdate(
      req.params.id,
      {
        status,
        rejectionReason,
        reviewedAt: new Date(),
        reviewedBy: req.user._id
      },
      { new: true }
    );
    if (!claim) return next(new NotFoundError('Claim not found'));
    res.json({ message: `Claim status updated to ${status}`, claim });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
