const express = require('express');
const router = express.Router();
const EmergencyCase = require('../models/EmergencyCase');
const Alert = require('../models/Alert');
const User = require('../models/User');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { triggerEmergencyWorkflow, emergencySosService } = require('../utils/emergencyEngine');
const notificationService = require('../utils/notificationService');
const { escapeRegex, buildDateQuery, isValidObjectId } = require('../utils/queryHelper');
const { parsePagination, formatPaginatedResponse } = require('../utils/paginationHelper');
const { BadRequestError } = require('../utils/errors');

// Pre-defined available emergency response teams in ecosystem
const EMERGENCY_TEAMS_ROSTER = [
  {
    teamId: 'TEAM-ALPHA',
    teamName: 'Rapid Response Unit 01 (Trauma)',
    leadResponder: 'Capt. Rajesh Varma (Paramedic)',
    contactPhone: '+91 98765 30001',
    vehicleType: 'Advanced Life Support (ALS) Ambulance',
    status: 'Available',
    baseLocation: 'Central Hospital Hub'
  },
  {
    teamId: 'TEAM-BRAVO',
    teamName: 'Cardiac Care Emergency Unit 02',
    leadResponder: 'Dr. Suresh Nair (Emergency Physician)',
    contactPhone: '+91 98765 30002',
    vehicleType: 'Mobile Intensive Care Unit (MICU)',
    status: 'Available',
    baseLocation: 'North District Trauma Center'
  },
  {
    teamId: 'TEAM-CHARLIE',
    teamName: 'Geriatric Rapid Assistance Unit 03',
    leadResponder: 'Nurse Anita Deshmukh (Emergency Care)',
    contactPhone: '+91 98765 30003',
    vehicleType: 'Basic Life Support (BLS) Ambulance',
    status: 'Available',
    baseLocation: 'Senior Living South Sector'
  },
  {
    teamId: 'TEAM-DELTA',
    teamName: 'Rapid Bike Responder Unit 04',
    leadResponder: 'Officer Amit Patel (First Responder)',
    contactPhone: '+91 98765 30004',
    vehicleType: 'First Responder Medical Bike',
    status: 'Available',
    baseLocation: 'City Center Express Post'
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SOS CREATION & CANCELLATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/emergency/sos — Patient activates manual or automatic SOS
 * Patient identity is strictly extracted from authentication JWT.
 */
router.post('/sos', auth, async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient account not found' });
    }

    const { emergencyType = 'MANUAL_SOS', location = null, recentHealthData = {} } = req.body;

    // Check for existing ACTIVE emergency case to prevent duplicate spam
    const existingActiveCase = await EmergencyCase.findOne({
      patientId,
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] }
    });

    if (existingActiveCase) {
      // Append a note/event to the existing active case instead of creating unlimited duplicates
      existingActiveCase.timeline.push({
        event: 'SOS_TRIGGERED',
        message: `Repeated SOS signal received from patient while case is already ${existingActiveCase.status}.`,
        timestamp: new Date(),
        performedBy: patient._id,
        performedByName: patient.name,
        performedByRole: 'patient'
      });
      await existingActiveCase.save();

      return res.status(200).json({
        message: 'You already have an active emergency case in progress.',
        isDuplicate: true,
        emergencyCase: existingActiveCase
      });
    }

    // Trigger full emergency decision workflow
    const result = await triggerEmergencyWorkflow({
      patient,
      doctorId: patient.assignedDoctor,
      type: emergencyType,
      score: 100,
      vitals: recentHealthData,
      reasons: ['Patient triggered emergency SOS via app'],
      fallDetected: emergencyType === 'FALL_ALERT',
      location,
      performedBy: patient._id
    });

    const isLocationShared = Boolean(result.emergencyCase.location?.isAvailable);

    res.status(201).json({
      message: isLocationShared
        ? '🚨 Emergency SOS broadcasted successfully. Location shared.'
        : '🚨 Emergency alert sent. Current location is unavailable.',
      emergencyCase: result.emergencyCase,
      alert: result.alert
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency/manual-sos — Explicit alias for Manual SOS Button
 */
router.post('/manual-sos', auth, async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { location = null, reason = 'Patient pressed SOS button', recentHealthData = {} } = req.body;

    const result = await emergencySosService.triggerManualSOS({
      patientId,
      location,
      reason,
      vitals: recentHealthData,
      performedBy: patientId
    });

    const isLocationShared = Boolean(result.emergencyCase?.location?.isAvailable);

    res.status(result.isDuplicate ? 200 : 201).json({
      message: result.isDuplicate
        ? 'You already have an active emergency case in progress.'
        : (isLocationShared ? '🚨 Emergency SOS broadcasted successfully. Location shared.' : '🚨 Emergency alert sent. Current location is unavailable.'),
      emergencyCase: result.emergencyCase,
      alert: result.alert,
      isDuplicate: result.isDuplicate || false
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency/automatic-sos — Automated SOS Detection from wearables, sensors, or AI monitors
 */
router.post('/automatic-sos', auth, async (req, res, next) => {
  try {
    const targetPatientId = (req.body.patientId && ['doctor', 'admin', 'emergency'].includes(req.user.role))
      ? req.body.patientId
      : req.user._id;

    const {
      detectionSource = 'wearable',
      vitals = {},
      fallDetected = false,
      score = 80,
      reasons = [],
      location = null,
      sensorData = null
    } = req.body;

    const result = await emergencySosService.triggerAutomaticSOS({
      patientId: targetPatientId,
      detectionSource,
      vitals,
      fallDetected: Boolean(fallDetected),
      score,
      reasons,
      location,
      sensorData
    });

    res.status(result.isDuplicate ? 200 : 201).json({
      message: result.isDuplicate
        ? 'Active emergency case already in progress. Signal logged to timeline.'
        : '🚨 Automatic SOS detection processed and escalated to Emergency Engine',
      emergencyCase: result.emergencyCase,
      alert: result.alert,
      isDuplicate: result.isDuplicate || false
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/emergency/user-data/:patientId? — Returns User Data Module payload (Patient Profile, Medical Info, Contacts, Location)
 */
router.get('/user-data/:patientId?', auth, async (req, res, next) => {
  try {
    const targetId = req.params.patientId || req.user._id;

    // Security check: Only self, assigned doctor, admin, or emergency staff can access
    const isSelf = targetId.toString() === req.user._id.toString();
    const isStaff = ['emergency', 'admin', 'doctor', 'hospital'].includes(req.user.role);
    if (!isSelf && !isStaff) {
      return res.status(403).json({ message: 'Unauthorized to view emergency user data' });
    }

    const userData = await emergencySosService.userData.aggregateUserData(targetId);
    res.json({
      success: true,
      patientProfile: userData.patientProfile,
      medicalInfo: userData.medicalInfo,
      emergencyContacts: userData.emergencyContacts,
      location: userData.location,
      data: userData
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/emergency/cases/:id/incident-log — Returns complete chronological incident timeline
 */
router.get('/cases/:id/incident-log', auth, async (req, res, next) => {
  try {
    const timeline = await emergencySosService.cases.getIncidentLog(req.params.id);
    res.json(timeline);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency/cases/:id/location — Live GPS coordinate telemetry updates en route
 */
router.post('/cases/:id/location', auth, async (req, res, next) => {
  try {
    const { latitude, longitude, accuracy, address } = req.body;
    const updatedCase = await emergencySosService.cases.updateLocation(
      req.params.id,
      { latitude, longitude, accuracy, address },
      req.user
    );
    res.json({
      message: 'Location updated in emergency incident log',
      location: updatedCase.location
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency/:id/cancel — Cancel SOS (if false alarm before advanced care)
 */
router.post('/:id/cancel', auth, async (req, res, next) => {
  try {
    const { reason = 'Patient confirmed false alarm' } = req.body;
    const emergencyCase = await EmergencyCase.findById(req.params.id);

    if (!emergencyCase) {
      return res.status(404).json({ message: 'Emergency case not found' });
    }

    // Security check: Only the patient who triggered it or an ER officer/admin can cancel
    const isOwner = emergencyCase.patientId.toString() === req.user._id.toString();
    const isStaff = ['emergency', 'admin', 'doctor'].includes(req.user.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ message: 'Unauthorized to cancel this emergency case' });
    }

    // If already under care or resolved, reject cancellation
    if (['UNDER_CARE', 'RESOLVED'].includes(emergencyCase.status)) {
      return res.status(400).json({
        message: `Cannot cancel case that is already ${emergencyCase.status}. Please resolve it through normal protocol.`
      });
    }

    emergencyCase.status = 'CANCELLED';
    emergencyCase.cancellationReason = reason;
    emergencyCase.resolvedAt = new Date();
    emergencyCase.resolvedBy = req.user._id;

    emergencyCase.timeline.push({
      event: 'SOS_CANCELLED',
      message: `Emergency alert was cancelled by ${req.user.role}: "${reason}".`,
      timestamp: new Date(),
      performedBy: req.user._id,
      performedByName: req.user.name || 'User',
      performedByRole: req.user.role
    });

    await emergencyCase.save();

    // Also update associated Alert if exists
    await Alert.updateMany(
      { emergencyCaseId: emergencyCase._id },
      { emergencyStatus: 'Resolved', resolved: true, resolvedAt: new Date(), resolvedBy: req.user._id }
    );

    // Broadcast cancellation update
    await notificationService.broadcastCancellationNotification(emergencyCase, req.user);

    res.json({
      message: 'Emergency SOS alert cancelled. All notified parties updated.',
      emergencyCase
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DASHBOARD & ACTIVE INCIDENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/emergency/dashboard-stats — Aggregated metrics computed from DB
 */
router.get('/dashboard-stats', auth, async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [active, pending, teamsAssigned, resolvedToday, totalCases] = await Promise.all([
      EmergencyCase.countDocuments({ status: { $in: ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] } }),
      EmergencyCase.countDocuments({ status: 'ACTIVE' }),
      EmergencyCase.countDocuments({ status: { $in: ['TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED'] } }),
      EmergencyCase.countDocuments({ status: 'RESOLVED', resolvedAt: { $gte: todayStart } }),
      EmergencyCase.countDocuments({})
    ]);

    const priorityCounts = {
      critical: await EmergencyCase.countDocuments({ priority: 'Critical', status: { $ne: 'RESOLVED' } }),
      high: await EmergencyCase.countDocuments({ priority: 'High Priority', status: { $ne: 'RESOLVED' } }),
      warning: await EmergencyCase.countDocuments({ priority: 'Warning', status: { $ne: 'RESOLVED' } }),
      normal: await EmergencyCase.countDocuments({ priority: 'Normal', status: { $ne: 'RESOLVED' } })
    };

    res.json({
      activeEmergencies: active,
      pendingResponse: pending,
      teamsAssigned,
      resolvedToday,
      totalCases,
      priorityCounts
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/emergency/communication-status — Provider diagnostic endpoint
 */
router.get('/communication-status', auth, role('admin', 'emergency'), (req, res) => {
  const emergencyCommunicationService = require('../utils/emergencyCommunicationService');
  res.json(emergencyCommunicationService.getDiagnosticStatus());
});

/**
 * GET /api/emergency/active — Active emergency incidents stream
 */
router.get('/active', auth, async (req, res, next) => {
  try {
    let query = { status: { $in: ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] } };

    // Doctors only see active emergencies for their assigned patients
    if (req.user.role === 'doctor') {
      query.assignedDoctor = req.user._id;
    } else if (req.user.role === 'patient') {
      query.patientId = req.user._id;
    }

    const cases = await EmergencyCase.find(query)
      .populate('patientId', 'name age gender bloodGroup phone roomLocation allergies allergiesDetail medicalConditionsDetail caregiverPhone emergencyContact')
      .populate('assignedDoctor', 'name specialization phone')
      .sort({ triggeredAt: -1 });

    res.json(cases);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/emergency/history — Patient emergency history
 */
router.get('/history', auth, async (req, res, next) => {
  try {
    let query = {};
    if (req.user.role === 'patient') {
      query.patientId = req.user._id;
    } else if (req.query.patientId) {
      query.patientId = req.query.patientId;
    } else {
      query.status = { $in: ['RESOLVED', 'CANCELLED'] };
    }

    const cases = await EmergencyCase.find(query)
      .populate('patientId', 'name age gender bloodGroup phone roomLocation')
      .populate('assignedDoctor', 'name specialization')
      .sort({ triggeredAt: -1 })
      .limit(50);

    res.json(cases);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. EMERGENCY CASES DIRECTORY & DETAILS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/emergency/cases — List emergency cases with filtering
 */
router.get('/cases', auth, async (req, res, next) => {
  try {
    const { status, priority, emergencyType, search, startDate, endDate } = req.query;
    let query = {};

    if (req.user.role === 'patient') {
      query.patientId = req.user._id;
    } else if (req.user.role === 'doctor') {
      query.assignedDoctor = req.user._id;
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (emergencyType) query.emergencyType = emergencyType;

    // Database-level date filtering
    const dateQuery = buildDateQuery(startDate, endDate, 'triggeredAt');
    if (dateQuery) {
      Object.assign(query, dateQuery);
    }

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = [
        { emergencyId: { $regex: safe, $options: 'i' } },
        { patientName: { $regex: safe, $options: 'i' } }
      ];
    }

    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    const [total, cases] = await Promise.all([
      EmergencyCase.countDocuments(query),
      EmergencyCase.find(query)
        .populate('patientId', 'name age gender bloodGroup phone roomLocation')
        .populate('assignedDoctor', 'name specialization')
        .sort({ triggeredAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(cases, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/emergency/cases/:id — Get single case details (with role-based privacy masking)
 */
router.get('/cases/:id', auth, async (req, res, next) => {
  try {
    const emergencyCase = await EmergencyCase.findById(req.params.id)
      .populate('patientId', 'name age gender bloodGroup phone roomLocation allergies allergiesDetail medicalConditionsDetail medicalHistory caregiverPhone emergencyContact emergencyContacts')
      .populate('assignedDoctor', 'name specialization phone email')
      .populate('resolvedBy', 'name role');

    if (!emergencyCase) {
      return res.status(404).json({ message: 'Emergency case not found' });
    }

    // Role-based privacy protection
    const isPatientSelf = emergencyCase.patientId?._id?.toString() === req.user._id.toString();
    const isAssignedDoctor = emergencyCase.assignedDoctor?._id?.toString() === req.user._id.toString();
    const isStaff = ['emergency', 'admin', 'hospital', 'doctor'].includes(req.user.role);

    if (!isPatientSelf && !isAssignedDoctor && !isStaff) {
      return res.status(403).json({ message: 'Unauthorized to view this emergency case' });
    }

    res.json(emergencyCase);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. STATUS UPDATES, ACKNOWLEDGEMENT, & TEAM DISPATCH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PUT /api/emergency/cases/:id/status — Advance emergency case status in workflow
 */
router.put('/cases/:id/status', auth, role('emergency', 'admin', 'doctor', 'hospital'), async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE', 'RESOLVED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}` });
    }

    const emergencyCase = await EmergencyCase.findById(req.params.id);
    if (!emergencyCase) {
      return res.status(404).json({ message: 'Emergency case not found' });
    }

    const previousStatus = emergencyCase.status;
    emergencyCase.status = status;

    let eventType = 'NOTE_ADDED';
    if (status === 'ACKNOWLEDGED') eventType = 'CASE_ACKNOWLEDGED';
    if (status === 'TEAM_ASSIGNED') eventType = 'TEAM_ASSIGNED';
    if (status === 'EN_ROUTE') eventType = 'TEAM_EN_ROUTE';
    if (status === 'ARRIVED') eventType = 'TEAM_ARRIVED';
    if (status === 'UNDER_CARE') eventType = 'UNDER_CARE';
    if (status === 'RESOLVED') {
      eventType = 'CASE_RESOLVED';
      emergencyCase.resolvedAt = new Date();
      emergencyCase.resolvedBy = req.user._id;
    }

    emergencyCase.timeline.push({
      event: eventType,
      message: notes || `Case status updated from ${previousStatus} to ${status} by ${req.user.name || req.user.role}.`,
      timestamp: new Date(),
      performedBy: req.user._id,
      performedByName: req.user.name || 'Staff Responder',
      performedByRole: req.user.role
    });

    if (notes) {
      emergencyCase.notes.push({
        text: notes,
        author: req.user.name || 'Emergency Responder',
        authorRole: req.user.role
      });
    }

    await emergencyCase.save();

    // Synchronize Alert document
    if (status === 'RESOLVED') {
      await Alert.updateMany(
        { emergencyCaseId: emergencyCase._id },
        { emergencyStatus: 'Resolved', resolved: true, resolvedAt: new Date(), resolvedBy: req.user._id }
      );
    } else {
      await Alert.updateMany(
        { emergencyCaseId: emergencyCase._id },
        { emergencyStatus: status === 'EN_ROUTE' ? 'Dispatched' : status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Pending' }
      );
    }

    res.json({
      message: `Emergency case status successfully updated to ${status}`,
      emergencyCase
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency/cases/:id/acknowledge — Acknowledge emergency case
 */
router.post('/cases/:id/acknowledge', auth, role('emergency', 'doctor', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const emergencyCase = await EmergencyCase.findById(req.params.id);
    if (!emergencyCase) {
      return res.status(404).json({ message: 'Emergency case not found' });
    }

    emergencyCase.status = 'ACKNOWLEDGED';
    emergencyCase.timeline.push({
      event: 'CASE_ACKNOWLEDGED',
      message: `Emergency case acknowledged by ${req.user.role}: ${req.user.name || 'Responder'}. Reviewing vital signs and location.`,
      timestamp: new Date(),
      performedBy: req.user._id,
      performedByName: req.user.name || 'Responder',
      performedByRole: req.user.role
    });

    await emergencyCase.save();

    res.json({
      message: `Emergency case ${emergencyCase.emergencyId} acknowledged`,
      emergencyCase
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency/cases/:id/assign-team — Assign emergency response team
 */
router.post('/cases/:id/assign-team', auth, role('emergency', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { teamId, teamName, leadResponder, contactPhone, vehicleType } = req.body;

    const emergencyCase = await EmergencyCase.findById(req.params.id);
    if (!emergencyCase) {
      return res.status(404).json({ message: 'Emergency case not found' });
    }

    const team = {
      teamId: teamId || 'TEAM-ALPHA',
      teamName: teamName || 'Rapid Response Unit 01',
      leadResponder: leadResponder || 'Paramedic Unit',
      contactPhone: contactPhone || '+91 98765 30000',
      vehicleType: vehicleType || 'ALS Ambulance',
      assignedAt: new Date()
    };

    emergencyCase.assignedEmergencyTeam = team;
    emergencyCase.status = 'TEAM_ASSIGNED';

    emergencyCase.timeline.push({
      event: 'TEAM_ASSIGNED',
      message: `Emergency Team assigned: ${team.teamName} (${team.vehicleType}). Lead: ${team.leadResponder}. Contact: ${team.contactPhone}.`,
      timestamp: new Date(),
      performedBy: req.user._id,
      performedByName: req.user.name || 'Dispatch Coordinator',
      performedByRole: req.user.role
    });

    await notificationService.sendEmergencyTeamNotification(emergencyCase, team);
    await emergencyCase.save();

    res.json({
      message: `Team ${team.teamName} successfully assigned to case ${emergencyCase.emergencyId}`,
      emergencyCase
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency/cases/:id/notes — Add note to timeline
 */
router.post('/cases/:id/notes', auth, async (req, res, next) => {
  try {
    const text = req.body.text || req.body.note || req.body.notes;
    if (!text) return res.status(400).json({ message: 'Note text is required' });

    const emergencyCase = await EmergencyCase.findById(req.params.id);
    if (!emergencyCase) return res.status(404).json({ message: 'Emergency case not found' });

    emergencyCase.notes.push({
      text,
      author: req.user.name || req.user.role,
      authorRole: req.user.role
    });

    emergencyCase.timeline.push({
      event: 'NOTE_ADDED',
      message: text,
      timestamp: new Date(),
      performedBy: req.user._id,
      performedByName: req.user.name || req.user.role,
      performedByRole: req.user.role
    });

    await emergencyCase.save();
    res.json({ message: 'Note added to emergency timeline', emergencyCase });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. EMERGENCY CONTACTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/emergency/contacts — Retrieve patient's emergency contacts
 */
router.get('/contacts', auth, async (req, res, next) => {
  try {
    const targetUserId = (req.query.patientId && ['doctor', 'admin', 'emergency'].includes(req.user.role))
      ? req.query.patientId
      : req.user._id;

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user.emergencyContacts || []);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency/contacts — Add a new emergency contact
 */
router.post('/contacts', auth, async (req, res, next) => {
  try {
    const { name, relationship = 'Family', phone, email = '', priority = 'Secondary', isPrimary = false } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: 'Contact name and phone number are required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.emergencyContacts) user.emergencyContacts = [];

    // If marked as primary, unmark others
    if (isPrimary || priority === 'Primary') {
      user.emergencyContacts.forEach(c => { c.isPrimary = false; });
      user.emergencyContact = phone; // sync string field
    }

    user.emergencyContacts.push({
      name,
      relationship,
      phone,
      email,
      priority: isPrimary ? 'Primary' : priority,
      isPrimary: Boolean(isPrimary || priority === 'Primary')
    });

    await user.save();

    res.status(201).json({
      message: 'Emergency contact added successfully',
      emergencyContacts: user.emergencyContacts
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/emergency/contacts/:id — Edit an emergency contact
 */
router.put('/contacts/:id', auth, async (req, res, next) => {
  try {
    const { name, relationship, phone, email, priority, isPrimary } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const contact = user.emergencyContacts.id(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Emergency contact not found' });

    if (name) contact.name = name;
    if (relationship) contact.relationship = relationship;
    if (phone) contact.phone = phone;
    if (email !== undefined) contact.email = email;
    if (priority) contact.priority = priority;

    if (isPrimary || priority === 'Primary') {
      user.emergencyContacts.forEach(c => { c.isPrimary = false; });
      contact.isPrimary = true;
      contact.priority = 'Primary';
      user.emergencyContact = contact.phone;
    }

    await user.save();
    res.json({ message: 'Emergency contact updated', emergencyContacts: user.emergencyContacts });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/emergency/contacts/:id — Delete an emergency contact
 */
router.delete('/contacts/:id', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.emergencyContacts.pull(req.params.id);
    await user.save();

    res.json({ message: 'Emergency contact removed', emergencyContacts: user.emergencyContacts });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/emergency/contacts/:id/primary — Set primary emergency contact
 */
router.put('/contacts/:id/primary', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const contact = user.emergencyContacts.id(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });

    user.emergencyContacts.forEach(c => {
      c.isPrimary = false;
      if (c.priority === 'Primary') c.priority = 'Secondary';
    });

    contact.isPrimary = true;
    contact.priority = 'Primary';
    user.emergencyContact = contact.phone;

    await user.save();
    res.json({ message: `${contact.name} set as primary emergency contact`, emergencyContacts: user.emergencyContacts });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. EMERGENCY TEAMS ROSTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/emergency/teams — List available response units
 */
router.get('/teams', auth, async (req, res, next) => {
  res.json(EMERGENCY_TEAMS_ROSTER);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. LEGACY ROUTES FOR BACKWARD COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/emergency/alerts — view active critical emergency alerts
router.get('/alerts', auth, role('emergency', 'admin', 'doctor', 'hospital'), async (req, res, next) => {
  try {
    const alerts = await Alert.find({ type: { $in: ['Critical', 'SOS'] } })
      .populate('patientId', 'name email age bloodGroup phone roomLocation caregiverPhone emergencyContact medicalHistory allergies')
      .sort({ createdAt: -1 });
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

// PUT /api/emergency/dispatch/:id — dispatch ambulance or update status
router.put('/dispatch/:id', auth, role('emergency', 'admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { emergencyStatus: status, resolved: status === 'Resolved' },
      { new: true }
    );
    res.json({ message: `Ambulance dispatch status updated to ${status}`, alert });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
