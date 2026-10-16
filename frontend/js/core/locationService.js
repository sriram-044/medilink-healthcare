/**
 * CareLink AI — GPS & Location Services (locationService.js)
 *
 * Provides browser Geolocation integration, OpenStreetMap (Leaflet) rendering,
 * nearby hospital discovery, manual location fallback, and coordinate formatting.
 */

(function (window) {
  'use strict';

  const mapInstances = {};

  const CareLinkLocation = {
    // Current in-memory session location state
    currentLocation: null,

    /**
     * Check if Geolocation API is available in current browser/context
     */
    isSupported() {
      return 'geolocation' in navigator;
    },

    /**
     * Format decimal degrees into human-readable geographic string
     * e.g., 13.08270, 80.27070 -> "13.08270° N, 80.27070° E"
     */
    formatCoordinates(lat, lng) {
      if (lat === null || lat === undefined || lng === null || lng === undefined) {
        return 'Coordinates unavailable';
      }
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (isNaN(latNum) || isNaN(lngNum)) return 'Coordinates unavailable';

      const latDir = latNum >= 0 ? 'N' : 'S';
      const lngDir = lngNum >= 0 ? 'E' : 'W';
      return `${Math.abs(latNum).toFixed(5)}° ${latDir}, ${Math.abs(lngNum).toFixed(5)}° ${lngDir}`;
    },

    /**
     * Generate an external navigation link to Google Maps or OpenStreetMap
     */
    getDirectionsUrl(lat, lng) {
      if (!lat || !lng) return '#';
      return `https://www.google.com/maps/dir/?api=1&destination=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
    },

    getOsmUrl(lat, lng) {
      if (!lat || !lng) return '#';
      return `https://www.openstreetmap.org/?mlat=${Number(lat).toFixed(6)}&mlon=${Number(lng).toFixed(6)}#map=16/${Number(lat).toFixed(6)}/${Number(lng).toFixed(6)}`;
    },

    /**
     * Request browser GPS position with high accuracy and graceful error handling
     */
    async getCurrentLocation(options = {}) {
      const {
        enableHighAccuracy = true,
        timeout = 9000,
        maximumAge = 5000
      } = options;

      return new Promise((resolve) => {
        if (!this.isSupported()) {
          return resolve({
            success: false,
            code: 'UNSUPPORTED',
            message: 'Geolocation is not supported by your browser.'
          });
        }

        const geoTimer = setTimeout(() => {
          resolve({
            success: false,
            code: 'TIMEOUT',
            message: 'Location request timed out. Please check your connection or enter your location manually.'
          });
        }, timeout + 500);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(geoTimer);
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracyMeters = Math.round(pos.coords.accuracy || 10);
            const capturedAt = new Date(pos.timestamp || Date.now());

            const locationData = {
              success: true,
              latitude: lat,
              longitude: lng,
              accuracyMeters,
              capturedAt,
              address: `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
              source: 'gps',
              consentStatus: 'granted',
              isAvailable: true
            };

            this.currentLocation = locationData;
            resolve(locationData);
          },
          (err) => {
            clearTimeout(geoTimer);
            let message = 'Unable to retrieve location.';
            let code = 'UNKNOWN';

            switch (err.code) {
              case err.PERMISSION_DENIED:
                code = 'PERMISSION_DENIED';
                message = 'Location access was denied. Please allow location permissions in your browser or enter your address manually.';
                break;
              case err.POSITION_UNAVAILABLE:
                code = 'POSITION_UNAVAILABLE';
                message = 'Location information is unavailable on your device. Please verify GPS or Location Services are active.';
                break;
              case err.TIMEOUT:
                code = 'TIMEOUT';
                message = 'Location acquisition timed out. Please try again or use manual location entry.';
                break;
            }

            resolve({ success: false, code, message });
          },
          { enableHighAccuracy, timeout, maximumAge }
        );
      });
    },

    /**
     * Initialize or update an interactive OpenStreetMap Leaflet map
     */
    renderMap(containerId, lat, lng, options = {}) {
      const container = document.getElementById(containerId);
      if (!container) return null;

      // Handle Leaflet unavailability gracefully
      if (typeof window.L === 'undefined') {
        container.innerHTML = `
          <div style="padding:24px; text-align:center; color:var(--text-muted); font-size:13px;">
            <div>🗺️ Map Preview</div>
            <div style="font-weight:700; color:var(--primary); margin:6px 0;">${this.formatCoordinates(lat, lng)}</div>
            <a href="${this.getDirectionsUrl(lat, lng)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary" style="display:inline-flex; align-items:center; gap:6px; margin-top:8px;">
              Open in Google Maps ↗
            </a>
          </div>`;
        return null;
      }

      const latitude = Number(lat);
      const longitude = Number(lng);
      if (isNaN(latitude) || isNaN(longitude)) return null;

      // Clean up previous map instance if bound to container
      if (mapInstances[containerId]) {
        try {
          mapInstances[containerId].remove();
        } catch (_) {}
        delete mapInstances[containerId];
      }

      container.innerHTML = '';

      const zoom = options.zoom || 15;
      const title = options.title || 'Location Pin';
      const accuracy = options.accuracyMeters || null;

      try {
        const map = window.L.map(containerId, {
          center: [latitude, longitude],
          zoom,
          zoomControl: true,
          attributionControl: true
        });

        // Add OpenStreetMap Standard Tile Layer
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
        }).addTo(map);

        // Custom pulsing marker icon
        const iconHtml = `
          <div style="position:relative; width:28px; height:28px;">
            <div style="position:absolute; width:28px; height:28px; border-radius:50%; background:${options.markerColor || '#00d4aa'}; opacity:0.3; animation:pulse 1.8s infinite;"></div>
            <div style="position:absolute; top:4px; left:4px; width:20px; height:20px; border-radius:50%; background:${options.markerColor || '#00d4aa'}; border:2px solid #ffffff; box-shadow:0 0 10px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff;">
              ${options.markerIcon || '📍'}
            </div>
          </div>`;

        const customIcon = window.L.divIcon({
          html: iconHtml,
          className: 'carelink-custom-map-pin',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const marker = window.L.marker([latitude, longitude], { icon: customIcon }).addTo(map);

        // Optional accuracy radius circle
        if (accuracy && accuracy > 10) {
          window.L.circle([latitude, longitude], {
            radius: Math.min(accuracy, 200),
            color: options.markerColor || '#00d4aa',
            fillColor: options.markerColor || '#00d4aa',
            fillOpacity: 0.12,
            weight: 1
          }).addTo(map);
        }

        const popupContent = `
          <div style="font-family:Inter,sans-serif; font-size:12px; line-height:1.4; min-width:180px;">
            <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">${title}</div>
            <div style="color:#475569; font-size:11px; margin-bottom:4px;">${this.formatCoordinates(latitude, longitude)}</div>
            ${accuracy ? `<div style="color:#0284c7; font-size:10.5px; margin-bottom:6px;">Accuracy: ±${accuracy}m</div>` : ''}
            <div style="display:flex; gap:6px; margin-top:8px;">
              <a href="${this.getDirectionsUrl(latitude, longitude)}" target="_blank" rel="noopener" style="background:#00d4aa; color:#080c14; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:10.5px; font-weight:700; display:inline-block;">
                Directions ↗
              </a>
              <a href="${this.getOsmUrl(latitude, longitude)}" target="_blank" rel="noopener" style="background:#f1f5f9; color:#334155; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:10.5px; font-weight:600; display:inline-block;">
                OSM ↗
              </a>
            </div>
          </div>`;

        marker.bindPopup(popupContent);
        if (options.openPopup !== false) {
          marker.openPopup();
        }

        // Additional hospital markers if supplied
        if (Array.isArray(options.hospitals)) {
          options.hospitals.forEach(h => {
            if (h.latitude && h.longitude) {
              const hIconHtml = `
                <div style="width:22px; height:22px; border-radius:50%; background:#ef4444; border:2px solid #fff; box-shadow:0 0 8px rgba(239,68,68,0.5); display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff;">
                  🏥
                </div>`;
              const hIcon = window.L.divIcon({
                html: hIconHtml,
                className: 'carelink-hosp-pin',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
              });

              const hMarker = window.L.marker([h.latitude, h.longitude], { icon: hIcon }).addTo(map);
              hMarker.bindPopup(`
                <div style="font-family:Inter,sans-serif; font-size:12px; line-height:1.4;">
                  <strong style="color:#0f172a;">${h.name}</strong>
                  <div style="color:#64748b; font-size:11px;">${h.distanceKm} km away • ${h.estimatedTravelMinutes} mins</div>
                  <div style="color:#059669; font-size:10.5px; font-weight:600; margin:4px 0;">${h.traumaLevel}</div>
                  <a href="${h.directionsUrl}" target="_blank" rel="noopener" style="color:#00d4aa; font-size:11px; font-weight:700; text-decoration:none;">
                    Navigate ↗
                  </a>
                </div>
              `);
            }
          });
        }

        mapInstances[containerId] = map;

        // Invalidate size on next tick to prevent grey tiles if container was hidden
        setTimeout(() => {
          try { map.invalidateSize(); } catch (_) {}
        }, 150);

        return map;
      } catch (err) {
        console.error('[MAP RENDER ERROR]', err);
        return null;
      }
    },

    /**
     * Search nearby hospitals from backend API using coordinates & search radius
     */
    async fetchNearbyHospitals(lat, lng, radiusKm = 10, type = 'all') {
      try {
        const query = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          radius: String(radiusKm),
          type
        });

        const res = await fetch(`/api/hospitals/nearby?${query.toString()}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });

        const data = await res.json();
        return {
          ok: res.ok,
          status: res.status,
          data
        };
      } catch (err) {
        return {
          ok: false,
          status: 0,
          data: { success: false, message: 'Network error communicating with hospital directory.' }
        };
      }
    },

    /**
     * Persist patient's location to their profile in MongoDB
     */
    async savePatientLocation(locationData) {
      try {
        const res = await fetch('/api/patients/me/location', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(locationData)
        });

        const data = await res.json();
        return { ok: res.ok, data };
      } catch (err) {
        return { ok: false, data: { message: err.message } };
      }
    },

    /**
     * Retrieve last known location from patient's account
     */
    async getPatientSavedLocation() {
      try {
        const res = await fetch('/api/patients/me/location', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });
        const data = await res.json();
        return { ok: res.ok, data };
      } catch (err) {
        return { ok: false, data: null };
      }
    }
  };

  window.CareLinkLocation = CareLinkLocation;
})(window);
