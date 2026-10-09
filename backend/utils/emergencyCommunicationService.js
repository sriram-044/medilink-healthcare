const twilio = require('twilio');

class EmergencyCommunicationService {
  constructor() {
    this.enabled = process.env.SOS_COMMUNICATION_ENABLED === 'true';
    this.testMode = process.env.TEST_MODE === 'true';
    this.provider = process.env.SOS_PROVIDER || 'mock';

    // Twilio credentials
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    this._client = null;

    if (this.enabled && !this.testMode && this.provider === 'twilio') {
      if (!this.twilioAccountSid || !this.twilioAuthToken || !this.twilioPhoneNumber) {
        console.warn('⚠️ [SOS Warning] SOS communication enabled but Twilio credentials are missing.');
      } else {
        try {
          this._client = twilio(this.twilioAccountSid, this.twilioAuthToken);
        } catch (error) {
          console.warn('⚠️ [SOS Warning] Failed to initialize Twilio client:', error.message);
        }
      }
    }
  }

  getDiagnosticStatus() {
    return {
      enabled: this.enabled,
      provider: this.testMode ? 'mock' : this.provider,
      testMode: this.testMode,
      credentialsConfigured: Boolean(this.twilioAccountSid && this.twilioAuthToken && this.twilioPhoneNumber)
    };
  }

  async dispatchSOS(patient, emergencyCase, contacts) {
    if (!this.enabled) {
      return { 
        success: true, 
        mocked: true, 
        reason: 'SOS communication is disabled',
        call: { status: 'not_configured' },
        sms: { status: 'not_configured' }
      };
    }

    // 1. Find the primary contact
    let primaryContact = null;
    if (contacts && contacts.length > 0) {
      primaryContact = contacts.find(c => Boolean(c.isPrimary) || String(c.priority).toLowerCase() === 'primary');
    }

    if (!primaryContact || !primaryContact.phone) {
      return { 
        success: false, 
        reason: 'Primary emergency contact is not configured.',
        call: { status: 'failed' },
        sms: { status: 'failed' }
      };
    }

    const targetPhone = primaryContact.phone;

    // The messages to send
    const smsMessage = `🚨 CARELINK SOS ALERT\n\nAn emergency SOS has been triggered.\n\nPlease check on the patient immediately.\n\nEmergency Case: ${emergencyCase.emergencyId}`;
    
    // TwiML for voice call
    const twimlMessage = `<Response><Say>CareLink emergency alert. An emergency SOS has been triggered. Please check immediately.</Say></Response>`;

    // 2. Handle Mock / Test Mode
    if (this.testMode || this.provider === 'mock') {
      console.log(`[SOS MOCK] Initiating call to ${targetPhone}`);
      console.log(`[SOS MOCK] Sending SMS to ${targetPhone} - Msg: ${smsMessage.replace(/\n/g, ' ')}`);
      
      return { 
        success: true, 
        mocked: true, 
        targetPhone, 
        call: { status: 'initiated' }, 
        sms: { status: 'sent' } 
      };
    }

    // 3. Handle Real Provider
    if (this.provider === 'twilio') {
      if (!this._client) {
        return {
          success: false,
          reason: 'Provider credentials missing or invalid.',
          call: { status: 'not_configured' },
          sms: { status: 'not_configured' }
        };
      }

      let callStatus = 'failed';
      let smsStatus = 'failed';
      let overallSuccess = true;
      let failureReason = '';

      // Send SMS
      try {
        const msgResult = await this._client.messages.create({
          body: smsMessage,
          from: this.twilioPhoneNumber,
          to: targetPhone
        });
        smsStatus = 'sent';
      } catch (err) {
        console.error('[SOS SMS Error]', err.message);
        overallSuccess = false;
        failureReason += `SMS Failed: ${err.message}. `;
      }

      // Initiate Call
      try {
        const callResult = await this._client.calls.create({
          twiml: twimlMessage,
          from: this.twilioPhoneNumber,
          to: targetPhone
        });
        callStatus = 'initiated';
      } catch (err) {
        console.error('[SOS Call Error]', err.message);
        overallSuccess = false;
        failureReason += `Call Failed: ${err.message}. `;
      }

      return {
        success: overallSuccess,
        mocked: false,
        targetPhone,
        call: { status: callStatus },
        sms: { status: smsStatus },
        reason: failureReason.trim() || undefined
      };
    }

    return { 
      success: false, 
      reason: 'Unknown SOS_PROVIDER',
      call: { status: 'not_configured' },
      sms: { status: 'not_configured' }
    };
  }
}

module.exports = new EmergencyCommunicationService();
