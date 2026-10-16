module.exports = {
  simulateStep: (currentVitals) => {
    return {
      heartRate: (currentVitals?.heartRate || 72) + (Math.floor(Math.random() * 5) - 2),
      spo2: Math.min(100, Math.max(90, (currentVitals?.spo2 || 98) + (Math.floor(Math.random() * 3) - 1))),
      bloodPressure: currentVitals?.bloodPressure || '120/80',
      temperature: currentVitals?.temperature || 98.6
    };
  }
};
