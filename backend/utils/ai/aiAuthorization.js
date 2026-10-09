/**
 * utils/ai/aiAuthorization.js — Role-Based AI Capability & Resource Authorization
 *
 * Enforces strict authorization BEFORE AI context building:
 * 1. Checks if the authenticated user's role is allowed to invoke the requested capability.
 * 2. Enforces cross-patient IDOR protection:
 *    - Patients can ONLY access their own health data.
 *    - Doctors can ONLY access patients assigned to them.
 *    - Departmental roles (Lab, Pharmacy, Insurance, Emergency) are restricted to their domains.
 */

const { ForbiddenError, BadRequestError } = require('../errors');
const User = require('../../models/User');

// Explicit capability permissions mapped by role
const ROLE_CAPABILITIES = {
  patient: [
    'medical_report',
    'vital_trends',
    'medications',
    'general_health',
    'test_results'
  ],
  doctor: [
    'patient_summary',
    'medical_report',
    'vital_trends',
    'clinical_documentation',
    'medications',
    'lab_analysis'
  ],
  lab: [
    'test_results',
    'abnormal_values',
    'report_drafting',
    'workload_summary'
  ],
  admin: [
    'operational_summary',
    'workload_analysis',
    'inventory_summary',
    'hospital_trends'
  ],
  hospital: [
    'operational_summary',
    'workload_analysis',
    'inventory_summary',
    'hospital_trends'
  ],
  pharmacy: [
    'prescription_summary',
    'medication_info',
    'inventory_summary'
  ],
  insurance: [
    'claim_summary',
    'document_extraction',
    'policy_explanation'
  ],
  emergency: [
    'emergency_case_summary',
    'critical_vitals',
    'patient_history',
    'dispatch_coordination'
  ]
};

/**
 * Validates if the given role is permitted to execute the specified capability.
 * @param {string} role
 * @param {string} capability
 * @returns {boolean}
 */
function isCapabilityAllowed(role, capability) {
  if (!role || !capability) return false;
  const normalizedRole = role.toLowerCase();
  const allowed = ROLE_CAPABILITIES[normalizedRole] || [];
  return allowed.includes(capability.toLowerCase());
}

/**
 * Returns the default capability for a given role.
 * @param {string} role
 * @returns {string}
 */
function getDefaultCapability(role) {
  const normalizedRole = (role || '').toLowerCase();
  const allowed = ROLE_CAPABILITIES[normalizedRole];
  if (allowed && allowed.length > 0) return allowed[0];
  return 'general_health';
}

/**
 * Authorizes access to the specific patient or operational resource.
 * Throws ForbiddenError if unauthorized.
 *
 * @param {object} user - Authenticated user from req.user
 * @param {string} capability - Requested AI capability
 * @param {string} [targetPatientId] - Optional patient ID parameter
 * @param {string} [resourceId] - Optional document/record ID parameter
 * @returns {Promise<{ authorizedPatientId: string|null, authorizedResourceId: string|null }>}
 */
async function authorizeResourceAccess(user, capability, targetPatientId, resourceId) {
  if (!user || !user.role) {
    throw new ForbiddenError('Authentication required to access CareLink AI.');
  }

  const role = user.role.toLowerCase();

  // 1. Verify capability permissions
  if (!isCapabilityAllowed(role, capability)) {
    throw new ForbiddenError(
      `Access denied: The '${role}' role is not authorized for capability '${capability}'.`
    );
  }

  let authorizedPatientId = null;
  const authorizedResourceId = resourceId || null;

  // 2. Patient-specific access controls (STRICT TENANCY)
  if (role === 'patient') {
    // If the patient explicitly supplied a patientId, it MUST be their own ID
    if (targetPatientId && targetPatientId.toString() !== user._id.toString()) {
      throw new ForbiddenError(
        'Access denied: You may only query CareLink AI for your own medical records.'
      );
    }
    // Always bind strictly to the authenticated user's ID
    authorizedPatientId = user._id.toString();
  }

  // 3. Doctor-specific access controls (PATIENT-DOCTOR RELATIONSHIP)
  else if (role === 'doctor') {
    if (targetPatientId) {
      // Verify doctor assignment to this patient
      const patient = await User.findById(targetPatientId).select('assignedDoctor role');
      if (!patient || patient.role !== 'patient') {
        throw new BadRequestError('Invalid or nonexistent patient identifier.');
      }

      const assignedDocId = patient.assignedDoctor ? patient.assignedDoctor.toString() : null;
      if (assignedDocId !== user._id.toString()) {
        throw new ForbiddenError(
          'Access denied: You are not the assigned physician for this patient.'
        );
      }
      authorizedPatientId = targetPatientId;
    }
  }

  // 4. Emergency staff access
  else if (role === 'emergency') {
    // Emergency staff can access target patient in active emergency response scenarios
    if (targetPatientId) {
      authorizedPatientId = targetPatientId;
    }
  }

  return {
    authorizedPatientId,
    authorizedResourceId
  };
}

module.exports = {
  ROLE_CAPABILITIES,
  isCapabilityAllowed,
  getDefaultCapability,
  authorizeResourceAccess
};
