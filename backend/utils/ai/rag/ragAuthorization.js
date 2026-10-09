/**
 * utils/ai/rag/ragAuthorization.js — RAG-layer Authorization Guard
 *
 * This module is the FIRST thing called by ragService before any retrieval.
 * It receives the already-authenticated, already-RBAC-checked user context
 * from aiService/aiAuthorization, and builds an authorization context
 * that the retriever uses as strict query filters.
 *
 * SECURITY PRINCIPLES:
 * - Never trust patientId/doctorId values from the frontend as authorization.
 * - All retrieval filters are computed from server-side user identity.
 * - The LLM never decides what records are accessible.
 * - The retriever never retrieves records outside the authorization context.
 */

'use strict';

const User = require('../../../models/User');

/**
 * Builds a retrieval authorization context from the authenticated user.
 *
 * @param {object} user - Authenticated user (req.user) — NEVER from request body
 * @param {string} capability - The RBAC-validated capability
 * @param {string|null} authorizedPatientId - Already-authorized patient ID from aiAuthorization
 * @returns {Promise<RagAuthContext>}
 *
 * @typedef {object} RagAuthContext
 * @property {string}      userId              - Authenticated user's MongoDB _id (string)
 * @property {string}      role                - Authenticated user role
 * @property {string}      capability          - Validated AI capability
 * @property {string|null} patientId           - Authorized patient ID for retrieval (or null)
 * @property {string[]|null} assignedPatientIds - For doctors: list of assigned patient IDs
 * @property {boolean}     isAdmin             - Whether user has admin-level operational scope
 * @property {boolean}     isLabStaff          - Whether user can access lab workload
 * @property {boolean}     isPharmacy          - Whether user has pharmacy scope
 * @property {boolean}     isInsurance         - Whether user has insurance scope
 * @property {boolean}     isEmergency         - Whether user has emergency scope
 */
async function buildRagAuthContext(user, capability, authorizedPatientId) {
  if (!user || !user._id || !user.role) {
    throw new Error('RAG_AUTH: authenticated user context is required');
  }

  const userId = user._id.toString();
  const role   = (user.role || '').toLowerCase();

  const ctx = {
    userId,
    role,
    capability,
    patientId:          null,
    assignedPatientIds: null,
    isAdmin:            false,
    isLabStaff:         false,
    isPharmacy:         false,
    isInsurance:        false,
    isEmergency:        false
  };

  switch (role) {
    case 'patient': {
      // Patient can ONLY access their OWN records.
      // authorizedPatientId is always the patient's own _id (enforced by aiAuthorization).
      ctx.patientId = userId;
      break;
    }

    case 'doctor': {
      // Doctor can access data for their ASSIGNED patients only.
      // authorizedPatientId (if set) has already been verified by aiAuthorization.
      if (authorizedPatientId) {
        ctx.patientId = authorizedPatientId.toString();
      } else {
        // No specific patient scoped → load the full assigned list for general queries
        const doctorRecord = await User
          .findById(userId)
          .select('assignedPatients')
          .lean();
        ctx.assignedPatientIds = (doctorRecord?.assignedPatients || [])
          .map(id => id.toString());
      }
      break;
    }

    case 'lab': {
      ctx.isLabStaff = true;
      // If a patient was explicitly scoped (e.g. doctor flagged) honour it
      if (authorizedPatientId) {
        ctx.patientId = authorizedPatientId.toString();
      }
      break;
    }

    case 'pharmacy': {
      ctx.isPharmacy = true;
      if (authorizedPatientId) {
        ctx.patientId = authorizedPatientId.toString();
      }
      break;
    }

    case 'insurance': {
      ctx.isInsurance = true;
      if (authorizedPatientId) {
        ctx.patientId = authorizedPatientId.toString();
      }
      break;
    }

    case 'emergency': {
      ctx.isEmergency = true;
      if (authorizedPatientId) {
        ctx.patientId = authorizedPatientId.toString();
      }
      break;
    }

    case 'admin':
    case 'hospital': {
      ctx.isAdmin = true;
      break;
    }

    default:
      break;
  }

  return ctx;
}

module.exports = { buildRagAuthContext };
