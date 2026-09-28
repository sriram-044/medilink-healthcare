const express = require('express');
const router = express.Router();
const { Medication } = require('../models/Medication');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { escapeRegex, buildDateQuery, isValidObjectId } = require('../utils/queryHelper');
const { parsePagination, formatPaginatedResponse } = require('../utils/paginationHelper');
const { BadRequestError, NotFoundError } = require('../utils/errors');

// GET /api/pharmacy/prescriptions — view all prescriptions
router.get('/prescriptions', auth, role('pharmacy', 'admin', 'doctor'), async (req, res, next) => {
  try {
    const { patientId, doctorId, isActive, search, startDate, endDate } = req.query;
    const query = {};

    if (patientId && isValidObjectId(patientId)) query.patientId = patientId;
    if (doctorId && isValidObjectId(doctorId)) query.doctorId = doctorId;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const dateQuery = buildDateQuery(startDate, endDate, 'createdAt');
    if (dateQuery) Object.assign(query, dateQuery);

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { instructions: { $regex: safe, $options: 'i' } }
      ];
    }

    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    const [total, prescriptions] = await Promise.all([
      Medication.countDocuments(query),
      Medication.find(query)
        .populate('patientId', 'name email age bloodGroup phone roomLocation')
        .populate('doctorId', 'name specialization')
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(prescriptions, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// PUT /api/pharmacy/dispense/:id — dispense prescription
router.put('/dispense/:id', auth, role('pharmacy', 'admin'), async (req, res, next) => {
  try {
    const med = await Medication.findByIdAndUpdate(
      req.params.id,
      { takenToday: true, updatedAt: new Date() },
      { new: true }
    );
    if (!med) return next(new NotFoundError('Prescription not found'));
    res.json({ message: 'Medication dispensed successfully', med });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
