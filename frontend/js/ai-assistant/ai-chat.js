/**
 * frontend/components/carelink-ai/ai-chat.js — Reusable CareLink AI Assistant Component
 *
 * Implements a shared AI interaction widget usable across all 8 CareLink portals.
 * Communicates strictly via POST /api/ai/chat with credentials and correlation tracking.
 */

(function () {
  class CareLinkAIChat {
    constructor(options = {}) {
      this.role = (options.role || 'patient').toLowerCase();
      this.portalName = options.portalName || 'CareLink Portal';
      this.containerId = options.containerId || null;
      this.config = window.CareLinkAIConfig || {
        endpoint: '/api/ai/chat',
        disclaimer: 'CareLink AI provides AI-generated information and does not replace qualified medical professionals.',
        roleProfiles: {}
      };

      this.profile = this.config.roleProfiles[this.role] || {
        name: 'CareLink AI Assistant',
        roleLabel: 'Clinical Intelligence',
        icon: '🤖',
        defaultContext: 'general_health',
        suggestions: ['How can CareLink AI assist me today?']
      };

      this.isOpen = false;
      this.isLoading = false;
      this.messages = [];

      this.initDOM();
    }

    initDOM() {
      // 1. Create launcher button
      this.launcher = document.createElement('button');
      this.launcher.className = 'carelink-ai-launcher';
      this.launcher.setAttribute('aria-label', `Open ${this.profile.name}`);
      this.launcher.innerHTML = `<span>${this.profile.icon}</span> <span>${this.profile.name}</span>`;
      this.launcher.addEventListener('click', () => this.toggleWindow());

      // 2. Create modal container
      this.window = document.createElement('div');
      this.window.className = 'carelink-ai-window';
      this.window.innerHTML = `
        <div class="carelink-ai-header">
          <div class="carelink-ai-title-wrap">
            <span class="carelink-ai-icon">${this.profile.icon}</span>
            <div>
              <h3 class="carelink-ai-title">${this.profile.name}</h3>
              <span class="carelink-ai-badge">${this.profile.roleLabel}</span>
            </div>
          </div>
          <button class="carelink-ai-close" aria-label="Close chat">&times;</button>
        </div>
        <div class="carelink-ai-disclaimer-banner">
          <span>ℹ️</span> <span>${this.config.disclaimer}</span>
        </div>
        <div class="carelink-ai-messages" id="carelink-ai-msg-list">
          <div class="carelink-ai-msg ai">
            Hello! I am your <strong>${this.profile.name}</strong>. How can I assist you with your authorized health and clinical data today?
            <div class="carelink-ai-chips" id="carelink-ai-chips"></div>
          </div>
        </div>
        <form class="carelink-ai-input-form" id="carelink-ai-form">
          <input type="text" class="carelink-ai-input" id="carelink-ai-input" placeholder="Type your question..." autocomplete="off" required />
          <button type="submit" class="carelink-ai-send-btn" id="carelink-ai-send">Send</button>
        </form>
      `;

      // 3. Attach listeners
      this.window.querySelector('.carelink-ai-close').addEventListener('click', () => this.toggleWindow(false));

      const form = this.window.querySelector('#carelink-ai-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = this.window.querySelector('#carelink-ai-input');
        const text = input.value.trim();
        if (text && !this.isLoading) {
          input.value = '';
          this.sendMessage(text);
        }
      });

      // 4. Render suggestion chips
      const chipsContainer = this.window.querySelector('#carelink-ai-chips');
      (this.profile.suggestions || []).forEach(promptText => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'carelink-ai-chip';
        chip.textContent = promptText;
        chip.addEventListener('click', () => {
          this.sendMessage(promptText);
        });
        chipsContainer.appendChild(chip);
      });

      // 5. Mount to body
      document.body.appendChild(this.launcher);
      document.body.appendChild(this.window);
    }

    toggleWindow(forceState) {
      this.isOpen = typeof forceState === 'boolean' ? forceState : !this.isOpen;
      if (this.isOpen) {
        this.window.classList.add('open');
        this.window.querySelector('#carelink-ai-input').focus();
      } else {
        this.window.classList.remove('open');
      }
    }

    async sendMessage(text) {
      if (this.isLoading) return;
      this.isLoading = true;

      // Append user message
      this.appendMessage('user', text);

      // Append loading indicator
      const loadingEl = document.createElement('div');
      loadingEl.className = 'carelink-ai-loading';
      loadingEl.innerHTML = `<div class="carelink-ai-spinner"></div> <span>CareLink AI is processing securely...</span>`;
      const msgList = this.window.querySelector('#carelink-ai-msg-list');
      msgList.appendChild(loadingEl);
      msgList.scrollTop = msgList.scrollHeight;

      const sendBtn = this.window.querySelector('#carelink-ai-send');
      sendBtn.disabled = true;

      try {
        const res = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            message: text,
            contextType: this.profile.defaultContext
          })
        });

        const json = await res.json();
        loadingEl.remove();

        if (res.ok && json.success) {
          this.appendMessage('ai', json.data.answer, json.requestId);
        } else {
          const errMsg = json.error?.message || json.message || 'AI request could not be processed.';
          this.appendMessage('ai', `⚠️ ${errMsg}`, json.error?.requestId || json.requestId);
        }
      } catch (err) {
        loadingEl.remove();
        this.appendMessage('ai', '⚠️ Network error communicating with CareLink AI service. Please try again.');
      } finally {
        this.isLoading = false;
        sendBtn.disabled = false;
        msgList.scrollTop = msgList.scrollHeight;
      }
    }

    appendMessage(sender, text, requestId = null) {
      const msgList = this.window.querySelector('#carelink-ai-msg-list');
      const msgEl = document.createElement('div');
      msgEl.className = `carelink-ai-msg ${sender}`;

      // Convert line breaks safely
      const cleanText = document.createTextNode(text);
      const container = document.createElement('div');
      container.appendChild(cleanText);
      msgEl.innerHTML = container.innerHTML.replace(/\n/g, '<br/>');

      if (requestId && sender === 'ai') {
        const reqEl = document.createElement('span');
        reqEl.className = 'carelink-ai-reqid';
        reqEl.textContent = `Request ID: ${requestId}`;
        msgEl.appendChild(reqEl);
      }

      msgList.appendChild(msgEl);
      msgList.scrollTop = msgList.scrollHeight;
    }
  }

  // Global initializer
  window.CareLinkAI = {
    init: function (options) {
      return new CareLinkAIChat(options);
    }
  };

  // Auto-initialize when loaded on any of the 7 authenticated portals
  document.addEventListener('DOMContentLoaded', () => {
    const path = (window.location.pathname || '').toLowerCase();
    let detectedRole = null;
    if (path.includes('patient')) detectedRole = 'patient';
    else if (path.includes('doctor')) detectedRole = 'doctor';
    else if (path.includes('lab')) detectedRole = 'lab';
    else if (path.includes('admin')) detectedRole = 'admin';
    else if (path.includes('pharmacy')) detectedRole = 'pharmacy';
    else if (path.includes('insurance')) detectedRole = 'insurance';
    else if (path.includes('emergency')) detectedRole = 'emergency';

    if (detectedRole && !window._careLinkAIInstance) {
      window._careLinkAIInstance = window.CareLinkAI.init({ role: detectedRole });
    }
  });
})();
