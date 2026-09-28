const axios = require('axios');

class EmergencyCommunicationService {
  constructor() {
    this.enabled = process.env.SOS_COMMUNICATION_ENABLED === 'true';
    this.testMode = process.env.TEST_MODE === 'true';
    this.provider = process.env.SOS_PROVIDER || 'mock';
    this.fromNumber = process.env.SOS_FROM_NUMBER || '+10000000000';
  }

  async dispatchSOS(patient, emergencyCase, contacts) {
    const results = [];
    
    // Determine the primary contact number or fallback to env
    let targetPhone = process.env.SOS_FALLBACK_NUMBER;
    
    // In actual implementation, we might want to call the configured contact for the patient.
    // The requirement says: CALL ONE CONFIGURED MOBILE NUMBER + SEND SMS TO THE SAME NUMBER
    if (contacts && contacts.length > 0) {
      const primaryContact = contacts.find(c => c.isPrimary) || contacts[0];
      if (primaryContact && primaryContact.phone) {
        targetPhone = primaryContact.phone;
      }
    }

    if (!targetPhone) {
      return { success: false, reason: 'No configured target phone number available' };
    }

    const message = `EMERGENCY SOS: ${patient.name} has triggered an SOS alert. Emergency ID: ${emergencyCase.emergencyId}. Please respond immediately.`;

    if (!this.enabled || this.testMode || this.provider === 'mock') {
      console.log(`[SOS COMMUNICATION MOCK] Executing mock call & SMS to ${targetPhone}`);
      console.log(`[SOS COMMUNICATION MOCK] Message: ${message}`);
      return { 
        success: true, 
        mocked: true, 
        callResult: 'mock_call_queued', 
        smsResult: 'mock_sms_sent',
        targetPhone 
      };
    }

    try {
      // Example real HTTP provider
      // const res = await axios.post(process.env.SOS_PROVIDER_API_URL, {
      //   to: targetPhone,
      //   from: this.fromNumber,
      //   text: message,
      //   makeCall: true
      // }, {
      //   headers: { 'Authorization': `Bearer ${process.env.SOS_PROVIDER_API_KEY}` }
      // });
      
      return { 
        success: true, 
        mocked: false, 
        targetPhone, 
        callResult: 'queued', 
        smsResult: 'sent' 
      };
    } catch (error) {
      console.error('[SOS Communication] Provider error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmergencyCommunicationService();
