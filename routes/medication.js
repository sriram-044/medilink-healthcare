const express = require('express');
const router = express.Router();
const { Medication, DietPlan } = require('../models/Medication');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

// GET /api/medication/diet/:patientId — get diet plan  (MUST be before /:patientId)
router.get('/diet/:patientId', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.patientId) {
      return next(new ForbiddenError('Access denied'));
    }
    const diet = await DietPlan.findOne({ patientId: req.params.patientId })
      .sort({ createdAt: -1 });
    res.json(diet);
  } catch (err) {
    next(err);
  }
});

// GET /api/medication/:patientId — get medications
router.get('/:patientId', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.patientId) {
      return next(new ForbiddenError('Access denied'));
    }
    const meds = await Medication.find({ patientId: req.params.patientId, isActive: true })
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 });
    res.json(meds);
  } catch (err) {
    next(err);
  }
});

// POST /api/medication — doctor adds medication
router.post('/', auth, role('doctor', 'admin'), async (req, res, next) => {
  try {
    const { patientId, name, dosage, frequency, instructions, startDate, endDate } = req.body;
    const med = new Medication({
      patientId, doctorId: req.user._id,
      name, dosage, frequency, instructions,
      startDate, endDate
    });
    await med.save();
    res.status(201).json({ message: 'Medication added', med });
  } catch (err) {
    next(err);
  }
});

// PUT /api/medication/:id/taken — patient marks as taken
router.put('/:id/taken', auth, role('patient'), async (req, res, next) => {
  try {
    const med = await Medication.findOne({ _id: req.params.id, patientId: req.user._id });
    if (!med) return next(new NotFoundError('Medication not found'));
    med.takenToday = true;
    med.takenDates.push(new Date());
    await med.save();
    res.json({ message: 'Marked as taken', med });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/medication/:id — doctor removes medication
router.delete('/:id', auth, role('doctor', 'admin'), async (req, res, next) => {
  try {
    const med = await Medication.findByIdAndUpdate(req.params.id, { isActive: false });
    if (!med) return next(new NotFoundError('Medication not found'));
    res.json({ message: 'Medication removed' });
  } catch (err) {
    next(err);
  }
});

// POST /api/medication/diet — doctor adds diet plan  (MUST be before /:patientId would catch 'diet')
router.post('/diet', auth, role('doctor'), async (req, res, next) => {
  try {
    const { patientId, plan, calories, notes } = req.body;
    const diet = new DietPlan({ patientId, doctorId: req.user._id, plan, calories, notes });
    await diet.save();
    res.status(201).json({ message: 'Diet plan added', diet });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
