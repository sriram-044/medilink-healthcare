/**
 * frontend/components/carelink-ai/ai-config.js — Frontend AI Component Configuration
 *
 * Configures role-tailored suggestions, endpoints, and informational disclaimers
 * across the 8 CareLink portals.
 */

const CareLinkAIConfig = {
  endpoint: '/api/ai/chat',
  disclaimer: 'CareLink AI provides AI-generated information and does not replace qualified medical professionals.',
  roleProfiles: {
    patient: {
      name: 'Ask CareLink AI',
      roleLabel: 'Patient Health Assistant',
      icon: '🤖',
      defaultContext: 'medical_report',
      suggestions: [
        'Explain my latest blood test report',
        'Summarize my recent vital sign trends',
        'What are my active medications?'
      ]
    },
    doctor: {
      name: 'Clinical AI Assistant',
      roleLabel: 'Physician Decision Support',
      icon: '👨‍⚕️',
      defaultContext: 'patient_summary',
      suggestions: [
        'Summarize patient clinical history',
        'Analyze vital telemetry trends',
        'Review recent lab panel findings'
      ]
    },
    lab: {
      name: 'Laboratory AI Assistant',
      roleLabel: 'Specimen & Worklist Intelligence',
      icon: '🧪',
      defaultContext: 'test_results',
      suggestions: [
        'Summarize pending laboratory test requests',
        'Check abnormal parameter distributions',
        'Draft standard diagnostic report summary'
      ]
    },
    admin: {
      name: 'Hospital Operations AI',
      roleLabel: 'Executive Facility Analytics',
      icon: '🏥',
      defaultContext: 'operational_summary',
      suggestions: [
        'Summarize hospital operational metrics',
        'Review emergency incident volume',
        'Report throughput and active patient counts'
      ]
    },
    hospital: {
      name: 'Hospital Operations AI',
      roleLabel: 'Executive Facility Analytics',
      icon: '🏥',
      defaultContext: 'operational_summary',
      suggestions: [
        'Summarize hospital operational metrics',
        'Review emergency incident volume',
        'Report throughput and active patient counts'
      ]
    },
    pharmacy: {
      name: 'Pharmacy AI Assistant',
      roleLabel: 'Medication & Dispensing Support',
      icon: '💊',
      defaultContext: 'prescription_summary',
      suggestions: [
        'Review active prescription list',
        'Summarize drug dosage schedules',
        'Check patient allergy contraindications'
      ]
    },
    insurance: {
      name: 'Insurance Adjudication AI',
      roleLabel: 'Claims & Policy Analysis',
      icon: '🛡️',
      defaultContext: 'claim_summary',
      suggestions: [
        'Summarize pending insurance claims',
        'Review documentation completeness',
        'Check treatment categorization'
      ]
    },
    emergency: {
      name: 'Emergency Response AI',
      roleLabel: 'Trauma & Dispatch Intelligence',
      icon: '🚨',
      defaultContext: 'emergency_case_summary',
      suggestions: [
        'Summarize active SOS emergency cases',
        'Check critical patient vital trends',
        'Review response team dispatch status'
      ]
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CareLinkAIConfig;
}
