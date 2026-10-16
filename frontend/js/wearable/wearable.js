/**
 * CareLink — Wearable Telemetry & ECG Wave Simulator
 * Simulates real-time Apple Watch Series 9 & Dexcom G7 biometrics stream
 */
class WearableSimulator {
  constructor() {
    this.canvas = document.getElementById("liveECGCanvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.ecgX = 0;
    this.animId = null;
    this.autoStreamTimer = null;
    this.isAutoStreaming = false;
    this.currentHeartRate = 78;
    this.rhythmType = "Normal Sinus Rhythm";
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.startECGAnimation();
  }

  setupEventListeners() {
    // Slider Bindings
    const bindSlider = (id, valId, suffix, callback) => {
      const slider = document.getElementById(id);
      const valDisplay = document.getElementById(valId);
      if (slider) {
        slider.addEventListener("input", (e) => {
          const val = e.target.value;
          if (valDisplay) valDisplay.innerText = `${val}${suffix}`;
          if (callback) callback(Number(val));
        });
      }
    };

    bindSlider("simHR", "simHRVal", " bpm", (val) => {
      this.currentHeartRate = val;
      this.updateECGRhythm(val);
    });
    bindSlider("simSpO2", "simSpO2Val", " %");
    bindSlider("simSysBP", "simSysVal", "");
    bindSlider("simDiaBP", "simDiaVal", "");
    bindSlider("simGlucose", "simGlucoseVal", " mg/dL");

    // Unified Action Triggers
    document.getElementById("btnPushReading")?.addEventListener("click", () => this.pushCurrentReading());
    document.getElementById("btnAutoStreamToggle")?.addEventListener("click", () => {
      if (typeof window.toggleLiveMonitoring === "function") {
        window.toggleLiveMonitoring();
      } else {
        this.toggleAutoStream();
      }
    });
    document.getElementById("btnSpikeTachycardia")?.addEventListener("click", () => {
      if (typeof window.simulateEmergencyEvent === "function") {
        window.simulateEmergencyEvent();
      } else {
        this.triggerCrisisSpike("TACHYCARDIA");
      }
    });
    document.getElementById("btnSpikeHTN")?.addEventListener("click", () => this.triggerCrisisSpike("HYPERTENSION"));

    // Drawer Toggles
    const btnToggle = document.getElementById("btnToggleWearable");
    const drawer = document.getElementById("wearableSimulatorDrawer");
    const btnClose = document.getElementById("btnCloseDrawer");

    btnToggle?.addEventListener("click", () => {
      if (drawer) {
        drawer.classList.toggle("hidden");
        if (!drawer.classList.contains("hidden")) {
          this.startECGAnimation();
        }
      }
    });

    btnClose?.addEventListener("click", () => {
      drawer?.classList.add("hidden");
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer && !drawer.classList.contains("hidden")) {
        drawer.classList.add("hidden");
      }
    });
  }

  updateECGRhythm(hr) {
    const label = document.getElementById("ecgRhythmLabel");
    if (!label) return;

    if (hr > 120) {
      this.rhythmType = "Sinus Tachycardia";
      label.innerText = "Tachycardia";
      label.style.color = "var(--danger)";
    } else if (hr < 50) {
      this.rhythmType = "Sinus Bradycardia";
      label.innerText = "Bradycardia";
      label.style.color = "var(--warning)";
    } else {
      this.rhythmType = "Normal Sinus Rhythm";
      label.innerText = "Normal Sinus";
      label.style.color = "var(--primary)";
    }
  }

  startECGAnimation() {
    if (!this.canvas) return;
    if (!this.ctx) this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) return;

    if (this.animId) {
      cancelAnimationFrame(this.animId);
    }

    const width = this.canvas.width || 340;
    const height = this.canvas.height || 90;
    const midY = height / 2;

    const draw = () => {
      // Fade previous trace slightly for phosphor persistence effect
      this.ctx.fillStyle = "rgba(2, 6, 23, 0.15)";
      this.ctx.fillRect(0, 0, width, height);

      // Grid background lines
      this.ctx.strokeStyle = "rgba(0, 212, 170, 0.07)";
      this.ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, height);
        this.ctx.stroke();
      }
      for (let y = 0; y < height; y += 15) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(width, y);
        this.ctx.stroke();
      }

      // ECG wave frequency scaling based on HR
      const speed = Math.max(1.5, (this.currentHeartRate / 60) * 2.2);
      this.ecgX = (this.ecgX + speed) % width;

      // P-Q-R-S-T parametric representation
      const period = width / Math.max(1, (this.currentHeartRate / 60) * 1.6);
      const phase = (this.ecgX % period) / period;

      let waveOffset = 0;
      if (phase > 0.14 && phase < 0.22) {
        // P-wave
        waveOffset = -6 * Math.sin(((phase - 0.14) / 0.08) * Math.PI);
      } else if (phase > 0.28 && phase < 0.31) {
        // Q-dip
        waveOffset = 5;
      } else if (phase >= 0.31 && phase <= 0.37) {
        // R-spike
        waveOffset = -34 * Math.sin(((phase - 0.31) / 0.06) * Math.PI);
      } else if (phase > 0.37 && phase < 0.40) {
        // S-dip
        waveOffset = 11;
      } else if (phase > 0.52 && phase < 0.66) {
        // T-wave
        waveOffset = -8 * Math.sin(((phase - 0.52) / 0.14) * Math.PI);
      }

      const y = midY + waveOffset + (Math.random() * 1.2 - 0.6);

      // Render glowing lead dot
      const isCritical = this.currentHeartRate > 120 || this.currentHeartRate < 50;
      const glowColor = isCritical ? "#ff4757" : "#00d4aa";

      this.ctx.fillStyle = glowColor;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = glowColor;
      this.ctx.beginPath();
      this.ctx.arc(this.ecgX, y, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      this.animId = requestAnimationFrame(draw);
    };

    draw();
  }

  getResolvedPatientId() {
    if (typeof selectedPatientId !== "undefined" && selectedPatientId) {
      return selectedPatientId;
    }
    if (typeof allPatients !== "undefined" && Array.isArray(allPatients) && allPatients.length > 0) {
      return allPatients[0]._id;
    }
    if (typeof currentUser !== "undefined" && currentUser?._id) {
      return currentUser._id;
    }
    const user = typeof getUser === "function" ? getUser() : null;
    return user?._id || "usr_pat_01";
  }

  async pushCurrentReading() {
    const hr = Number(document.getElementById("simHR")?.value || 78);
    const spo2 = Number(document.getElementById("simSpO2")?.value || 98);
    const sysBP = Number(document.getElementById("simSysBP")?.value || 122);
    const diaBP = Number(document.getElementById("simDiaBP")?.value || 80);
    const glucose = Number(document.getElementById("simGlucose")?.value || 115);

    const patientId = this.getResolvedPatientId();
    const isCriticalFall = hr > 140 && spo2 < 86;

    const payload = {
      patientId,
      heartRate: hr,
      spo2: spo2,
      systolicBP: sysBP,
      diastolicBP: diaBP,
      glucoseLevel: glucose,
      temperature: hr > 130 ? 100.8 : 98.6,
      fallDetected: isCriticalFall,
      source: "Apple Watch Series 9 & Dexcom G7",
      location: "Room 104, Sunrise Senior Home"
    };

    try {
      const res = await apiRequest("/vitals", { method: "POST", body: payload });
      if (res && res.ok) {
        const ai = res.data?.ai;
        const msg = ai 
          ? `Synced! AI Score: ${ai.score}/100 — ${ai.status}`
          : "Wearable telemetry synced successfully";
        
        if (typeof showToast === "function") {
          showToast(msg, ai?.status === "Critical" ? "error" : "success");
        }

        // Trigger Patient Confirmation Safety Modal if in Patient Portal and Critical readings detected
        if (ai?.status === "Critical" || isCriticalFall) {
          if (typeof showHealthWarningModal === "function") {
            showHealthWarningModal({
              type: isCriticalFall ? 'FALL_ALERT' : 'POSSIBLE_HEALTH_EMERGENCY',
              title: isCriticalFall ? 'Possible Fall Detected' : 'Possible Health Emergency Detected',
              message: isCriticalFall 
                ? 'A hard fall event was detected by your wearable sensor. Are you okay?' 
                : 'Unusual health readings detected (Heart Rate: ' + hr + ' bpm, SpO2: ' + spo2 + '%). Please check how you are feeling.',
              details: ai?.reasons?.length ? ai.reasons.join(' • ') : 'Critical biometric thresholds exceeded.'
            });
          }
        }

        // Refresh views depending on portal
        if (typeof loadDashboard === "function") loadDashboard();
        if (typeof loadOverview === "function") loadOverview();
        if (typeof loadPatientVitals === "function") loadPatientVitals();
        if (typeof loadVitalsMonitor === "function") loadVitalsMonitor();
      } else {
        if (typeof showToast === "function") {
          showToast(res?.message || "Ingestion failed", "error");
        }
      }
    } catch (err) {
      if (typeof showToast === "function") {
        showToast(`Ingestion failed: ${err.message}`, "error");
      }
    }
  }

  toggleAutoStream() {
    this.isAutoStreaming = !this.isAutoStreaming;
    const btnAuto = document.getElementById("btnAutoStreamToggle");
    const autoText = document.getElementById("autoStreamText");

    if (this.isAutoStreaming) {
      if (btnAuto) {
        btnAuto.style.background = "var(--primary)";
        btnAuto.style.color = "#080c14";
        btnAuto.style.borderColor = "var(--primary)";
      }
      if (autoText) autoText.innerText = "Streaming Active...";
      if (typeof showToast === "function") {
        showToast("Continuous Wearable Auto-Stream started (every 3s)", "info");
      }

      this.autoStreamTimer = setInterval(() => {
        // Natural physiological variance
        const hr = Math.min(160, Math.max(50, this.currentHeartRate + Math.floor(Math.random() * 5 - 2)));
        const simHR = document.getElementById("simHR");
        const simHRVal = document.getElementById("simHRVal");
        if (simHR && simHRVal) {
          simHR.value = hr;
          simHRVal.innerText = `${hr} bpm`;
          this.currentHeartRate = hr;
          this.updateECGRhythm(hr);
        }

        const simSpO2 = document.getElementById("simSpO2");
        const simSpO2Val = document.getElementById("simSpO2Val");
        if (simSpO2 && simSpO2Val) {
          const spo2 = Math.min(100, Math.max(88, Number(simSpO2.value) + (Math.random() > 0.5 ? 1 : -1)));
          simSpO2.value = spo2;
          simSpO2Val.innerText = `${spo2} %`;
        }

        this.pushCurrentReading();
      }, 3000);
    } else {
      if (this.autoStreamTimer) clearInterval(this.autoStreamTimer);
      if (btnAuto) {
        btnAuto.style.background = "#162033";
        btnAuto.style.color = "var(--text-primary)";
        btnAuto.style.borderColor = "rgba(255, 255, 255, 0.08)";
      }
      if (autoText) autoText.innerText = "Start Auto Stream";
      if (typeof showToast === "function") {
        showToast("Wearable telemetry stream paused", "info");
      }
    }
  }

  triggerCrisisSpike(type) {
    const isTachy = type === "TACHYCARDIA";
    const hr = isTachy ? 152 : 106;
    const spo2 = isTachy ? 84 : 94;
    const sys = isTachy ? 148 : 198;
    const dia = isTachy ? 96 : 122;
    const glucose = isTachy ? 140 : 165;

    const simHR = document.getElementById("simHR");
    const simHRVal = document.getElementById("simHRVal");
    const simSpO2 = document.getElementById("simSpO2");
    const simSpO2Val = document.getElementById("simSpO2Val");
    const simSysBP = document.getElementById("simSysBP");
    const simSysVal = document.getElementById("simSysVal");
    const simDiaBP = document.getElementById("simDiaBP");
    const simDiaVal = document.getElementById("simDiaVal");
    const simGlucose = document.getElementById("simGlucose");
    const simGlucoseVal = document.getElementById("simGlucoseVal");

    if (simHR && simHRVal) {
      simHR.value = hr;
      simHRVal.innerText = `${hr} bpm`;
      this.currentHeartRate = hr;
      this.updateECGRhythm(hr);
    }
    if (simSpO2 && simSpO2Val) {
      simSpO2.value = spo2;
      simSpO2Val.innerText = `${spo2} %`;
    }
    if (simSysBP && simSysVal) {
      simSysBP.value = sys;
      simSysVal.innerText = `${sys}`;
    }
    if (simDiaBP && simDiaVal) {
      simDiaBP.value = dia;
      simDiaVal.innerText = `${dia}`;
    }
    if (simGlucose && simGlucoseVal) {
      simGlucose.value = glucose;
      simGlucoseVal.innerText = `${glucose} mg/dL`;
    }

    this.pushCurrentReading();

    if (typeof showToast === "function") {
      showToast(
        isTachy 
          ? "🚨 CRITICAL TACHYCARDIA & HYPOXIA INJECTED! Emergency SOS escalation active."
          : "⚠️ HYPERTENSIVE CRISIS INJECTED! Elevated BP alert dispatched.",
        "error"
      );
    }
  }
}

// Auto-initialize when DOM is ready
let wearableSimulatorInstance = null;
document.addEventListener("DOMContentLoaded", () => {
  wearableSimulatorInstance = new WearableSimulator();
});
