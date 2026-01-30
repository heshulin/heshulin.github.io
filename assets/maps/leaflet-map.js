// Leaflet Visitor Map - Modern and Beautiful
// Uses OpenStreetMap tiles and tracks visitors across the world

class LeafletVisitorMap {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      maxMarkers: options.maxMarkers || 100,
      updateInterval: options.updateInterval || 30000,
      retentionDays: options.retentionDays || 30,
      ...options
    };

    // Geolocation options (reused from previous implementation)
    this.geoOptions = {
      cacheMinutes: 30,
      timeoutMs: 4500,
      totalTimeoutMs: 9000,
      hedgeDelayMs: 350,
      minQualityScore: 6,
      debug: false,
      apiKeys: {},
      ...(options.geoOptions || {})
    };

    this.visitedIPs = new Map();
    this.markers = [];
    this.map = null;
    this.storageKey = 'leafletVisitedLocations';
    this.geoCacheKey = 'leafletGeoCacheV2';
    this.memoryGeoCache = null;
    this.inflightGeoPromise = null;
    this.activeGeoControllers = new Map();

    this.loadVisitedLocations();
    this.init();
  }

  init() {
    this.createMap();
    this.loadExistingMarkers();
    this.trackVisitor();
  }

  createMap() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('Map container not found:', this.containerId);
      return;
    }

    // Initialize Leaflet map with a nice starting view
    this.map = L.map(this.containerId, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      touchZoom: true
    });

    // Add OpenStreetMap tiles with a clean style
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      opacity: 1
    }).addTo(this.map);

    // Add a loading indicator
    this.addLoadingIndicator();
  }

  addLoadingIndicator() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const loading = document.createElement('div');
    loading.className = 'map-loading';
    loading.id = `${this.containerId}-loading`;
    loading.textContent = 'Loading...';
    loading.style.position = 'absolute';
    loading.style.zIndex = '1000';
    container.appendChild(loading);

    // Hide loading when map loads
    this.map.on('load', () => {
      loading.style.display = 'none';
    });
  }

  addMarker(location, isRecent = false) {
    if (!location || !location.latitude || !location.longitude) return;

    const marker = L.circleMarker([location.latitude, location.longitude], {
      radius: isRecent ? 8 : 5,
      fillColor: isRecent ? '#ff5722' : '#ffc107',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: isRecent ? 0.8 : 0.6,
      className: isRecent ? 'marker-new' : ''
    }).addTo(this.map);

    // Add popup with location info
    const popupContent = `
      <div class="popup-location">${location.city}, ${location.country}</div>
      <div class="popup-time">${this.formatTime(location.timestamp)}</div>
      ${location.visitorCount ? `<div class="popup-visitor-count">${location.visitorCount} visitor(s)</div>` : ''}
    `;

    marker.bindPopup(popupContent);

    this.markers.push(marker);

    // Fit map to show all markers
    this.fitMapToMarkers();

    return marker;
  }

  fitMapToMarkers() {
    if (this.markers.length === 0) return;

    const group = L.featureGroup(this.markers);
    this.map.fitBounds(group.getBounds().pad(0.1));
  }

  async trackVisitor() {
    const loadingEl = document.getElementById(`${this.containerId}-loading`);
    if (loadingEl) loadingEl.style.display = 'block';

    try {
      const ipData = await this.getVisitorLocation();

      if (ipData && this.shouldRecordLocation(ipData)) {
        this.addMarker(ipData, true); // Recent visitor
        this.saveVisitedLocation(ipData);
        this.updateStats();
      }
    } catch (error) {
      console.log('Could not track visitor location:', error);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  async getVisitorLocation() {
    const cached = this.readCachedLocation();
    if (cached) return cached;

    if (this.inflightGeoPromise) return this.inflightGeoPromise;

    this.inflightGeoPromise = this.fetchBestLocation()
      .then((location) => {
        if (location) {
          this.writeCachedLocation(location);
          return location;
        }
        return this.getTimezoneFallback();
      })
      .catch((error) => {
        this.logGeoDebug('Geolocation failed', error);
        return this.getTimezoneFallback();
      })
      .finally(() => {
        this.inflightGeoPromise = null;
      });

    return this.inflightGeoPromise;
  }

  async fetchBestLocation() {
    const services = this.getGeoServices();
    if (services.length === 0) return null;

    const totalTimeoutMs = this.geoOptions.totalTimeoutMs;
    const hedgeDelayMs = this.geoOptions.hedgeDelayMs;
    const minScore = this.geoOptions.minQualityScore;

    return new Promise((resolve) => {
      let resolved = false;
      let pending = 0;
      let best = null;

      const finalize = (result) => {
        if (resolved) return;
        resolved = true;
        this.abortActiveGeoControllers();
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        finalize(best ? best.data : null);
      }, totalTimeoutMs);

      services.forEach((service, index) => {
        pending += 1;
        const delay = index * hedgeDelayMs;

        setTimeout(async () => {
          if (resolved) {
            pending -= 1;
            return;
          }

          const result = await this.fetchGeoFromService(service);
          pending -= 1;

          if (result) {
            const score = this.scoreLocation(result);
            if (!best || score > best.score) {
              best = { data: result, score };
            }
            if (score >= minScore) {
              clearTimeout(timeoutId);
              finalize(best.data);
              return;
            }
          }

          if (!resolved && pending === 0) {
            clearTimeout(timeoutId);
            finalize(best ? best.data : null);
          }
        }, delay);
      });
    });
  }

  getGeoServices() {
    const apiKeys = this.geoOptions.apiKeys || {};
    const ipinfoUrl = apiKeys.ipinfo
      ? `https://ipinfo.io/json?token=${encodeURIComponent(apiKeys.ipinfo)}`
      : 'https://ipinfo.io/json';

    const ipapiUrl = new URL('https://ipapi.co/json/');
    ipapiUrl.searchParams.set('fields', 'ip,city,region,country_name,latitude,longitude,timezone');
    if (apiKeys.ipapi) {
      ipapiUrl.searchParams.set('key', apiKeys.ipapi);
    }

    return [
      {
        name: 'ipapi',
        url: ipapiUrl.toString(),
        transform: (data) => ({
          ip: data.ip,
          city: data.city,
          region: data.region,
          country: data.country_name,
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone
        })
      },
      {
        name: 'ipinfo',
        url: ipinfoUrl,
        transform: (data) => {
          const coords = this.parseLocString(data.loc);
          return {
            ip: data.ip,
            city: data.city,
            region: data.region,
            country: data.country,
            latitude: coords.latitude,
            longitude: coords.longitude,
            timezone: data.timezone
          };
        }
      },
      {
        name: 'ipwhois',
        url: 'https://ipwho.is/',
        transform: (data) => {
          if (data && data.success === false) return null;
          return {
            ip: data.ip,
            city: data.city,
            region: data.region,
            country: data.country,
            latitude: data.latitude,
            longitude: data.longitude,
            timezone: data.timezone
          };
        }
      },
      {
        name: 'geolocation-db',
        url: 'https://geolocation-db.com/json/',
        transform: (data) => ({
          ip: data.IPv4 || data.ip,
          city: data.city,
          region: data.state,
          country: data.country_name || data.country,
          latitude: data.latitude,
          longitude: data.longitude
        })
      }
    ];
  }

  async fetchGeoFromService(service) {
    const timeoutMs = service.timeoutMs || this.geoOptions.timeoutMs;
    const supportsAbort = typeof AbortController !== 'undefined';
    const controller = supportsAbort ? new AbortController() : null;
    if (controller) this.activeGeoControllers.set(service.name, controller);

    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const fetchOptions = {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      };

      const response = supportsAbort
        ? await fetch(service.url, fetchOptions)
        : await this.fetchWithTimeout(service.url, timeoutMs, fetchOptions);

      if (!response || response.timedOut) {
        this.logGeoDebug(`${service.name} timeout`);
        return null;
      }

      if (!response.ok) {
        this.logGeoDebug(`${service.name} HTTP ${response.status}`);
        return null;
      }

      const data = await response.json().catch((error) => {
        this.logGeoDebug(`${service.name} JSON parse error`, error);
        return null;
      });

      if (!data) return null;

      const transformed = service.transform ? service.transform(data) : data;
      return this.normalizeLocation(transformed, service.name);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        this.logGeoDebug(`${service.name} timeout`);
      } else {
        this.logGeoDebug(`${service.name} error`, error);
      }
      return null;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (controller) this.activeGeoControllers.delete(service.name);
    }
  }

  async fetchWithTimeout(url, timeoutMs, options) {
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    });
    const fetchPromise = fetch(url, options);
    return Promise.race([fetchPromise, timeoutPromise]);
  }

  normalizeLocation(location, source) {
    if (!location) return null;

    const latitude = this.parseCoordinate(location.latitude);
    const longitude = this.parseCoordinate(location.longitude);
    if (!this.isValidCoordinate(latitude, longitude)) return null;

    return {
      ip: location.ip || 'unknown',
      city: this.cleanLabel(location.city),
      region: this.cleanLabel(location.region),
      country: this.cleanLabel(location.country),
      latitude,
      longitude,
      timezone: location.timezone || null,
      accuracy: Number.isFinite(location.accuracy) ? location.accuracy : null,
      source,
      timestamp: new Date().toISOString()
    };
  }

  scoreLocation(location) {
    let score = 0;
    if (location.ip && location.ip !== 'unknown') score += 1;
    if (location.city && location.city !== 'Unknown') score += 2;
    if (location.region && location.region !== 'Unknown') score += 1;
    if (location.country && location.country !== 'Unknown') score += 1;
    if (Number.isFinite(location.accuracy)) {
      if (location.accuracy <= 50) score += 2;
      else if (location.accuracy <= 100) score += 1;
    }
    if (location.timezone) score += 1;
    return score;
  }

  readCachedLocation() {
    const maxAgeMs = this.getGeoCacheMaxAgeMs();
    if (this.memoryGeoCache && Date.now() - this.memoryGeoCache.timestamp < maxAgeMs) {
      return this.memoryGeoCache.data;
    }

    const cached = this.safeSessionGet(this.geoCacheKey);
    if (!cached) return null;

    const parsed = this.safeParseJSON(cached);
    if (!parsed || !parsed.timestamp || !parsed.data) return null;

    if (Date.now() - parsed.timestamp > maxAgeMs) return null;
    this.memoryGeoCache = parsed;
    return parsed.data;
  }

  writeCachedLocation(location) {
    if (!location || location.source === 'timezone') return;
    const payload = { timestamp: Date.now(), data: location };
    this.memoryGeoCache = payload;
    this.safeSessionSet(this.geoCacheKey, JSON.stringify(payload));
  }

  getGeoCacheMaxAgeMs() {
    const cacheMinutes = Number.isFinite(this.geoOptions.cacheMinutes)
      ? this.geoOptions.cacheMinutes
      : 30;
    return cacheMinutes * 60 * 1000;
  }

  safeParseJSON(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      this.logGeoDebug('Cache JSON parse failed', error);
      return null;
    }
  }

  safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      this.logGeoDebug('SessionStorage get failed', error);
      return null;
    }
  }

  safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      this.logGeoDebug('SessionStorage set failed', error);
    }
  }

  logGeoDebug(message, error) {
    if (!this.geoOptions.debug) return;
    if (error) {
      console.debug(`[geo] ${message}`, error);
    } else {
      console.debug(`[geo] ${message}`);
    }
  }

  abortActiveGeoControllers() {
    for (const controller of this.activeGeoControllers.values()) {
      try {
        controller.abort();
      } catch (error) {
        // Ignore abort failures
      }
    }
    this.activeGeoControllers.clear();
  }

  parseLocString(loc) {
    if (!loc || typeof loc !== 'string') {
      return { latitude: null, longitude: null };
    }
    const [lat, lon] = loc.split(',');
    return {
      latitude: this.parseCoordinate(lat),
      longitude: this.parseCoordinate(lon)
    };
  }

  parseCoordinate(value) {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  isValidCoordinate(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) &&
      Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }

  cleanLabel(value) {
    if (!value) return "Unknown";
    const text = String(value).trim();
    if (!text) return "Unknown";
    const lowered = text.toLowerCase();
    if (lowered === 'unknown' || lowered === 'null' || lowered === 'undefined') {
      return "Unknown";
    }
    return text;
  }

  getTimezoneFallback() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzOffsets = {
      'America/New_York': { lat: 40.7128, lng: -74.0060 },
      'America/Los_Angeles': { lat: 34.0522, lng: -118.2437 },
      'America/Chicago': { lat: 41.8781, lng: -87.6298 },
      'America/Denver': { lat: 39.7392, lng: -104.9903 },
      'America/Sao_Paulo': { lat: -23.5505, lng: -46.6333 },
      'Europe/London': { lat: 51.5074, lng: -0.1278 },
      'Europe/Paris': { lat: 48.8566, lng: 2.3522 },
      'Europe/Berlin': { lat: 52.5200, lng: 13.4050 },
      'Asia/Tokyo': { lat: 35.6762, lng: 139.6503 },
      'Asia/Shanghai': { lat: 31.2304, lng: 121.4737 },
      'Asia/Singapore': { lat: 1.3521, lng: 103.8198 },
      'Asia/Kolkata': { lat: 19.0760, lng: 72.8777 },
      'Australia/Sydney': { lat: -33.8688, lng: 151.2093 }
    };

    if (tzOffsets[timezone]) {
      return {
        ip: 'unknown',
        city: "Unknown",
        region: "Unknown",
        country: "Based on timezone",
        latitude: tzOffsets[timezone].lat,
        longitude: tzOffsets[timezone].lng,
        source: "timezone",
        timestamp: new Date().toISOString()
      };
    }
  }

  shouldRecordLocation(ipData) {
    const ip = ipData.ip;
    const now = Date.now();
    const retentionMs = this.options.retentionDays * 24 * 60 * 60 * 1000;

    // Clean old entries
    for (const [key, data] of this.visitedIPs.entries()) {
      if (now - data.timestamp > retentionMs) {
        this.visitedIPs.delete(key);
      }
    }

    // Check if this IP is already recorded recently
    if (this.visitedIPs.has(ip)) {
      const lastVisit = this.visitedIPs.get(ip);
      if (now - lastVisit.timestamp < 60000) { // 1 minute
        return false;
      }
    }

    return true;
  }

  saveVisitedLocation(location) {
    const ip = location.ip || 'unknown';
    const existing = this.visitedIPs.get(ip);

    if (existing) {
      existing.timestamp = Date.now();
      existing.visitorCount = (existing.visitorCount || 1) + 1;
      existing.visits.push({
        timestamp: location.timestamp,
        latitude: location.latitude,
        longitude: location.longitude
      });
    } else {
      this.visitedIPs.set(ip, {
        ip: ip,
        city: location.city,
        region: location.region,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: Date.now(),
        visitorCount: 1,
        visits: [{
          timestamp: location.timestamp,
          latitude: location.latitude,
          longitude: location.longitude
        }]
      });
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(Array.from(this.visitedIPs.entries())));
    } catch (error) {
      console.log('Could not save visited locations:', error);
    }
  }

  loadVisitedLocations() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const entries = JSON.parse(stored);
        this.visitedIPs = new Map(entries);
      }
    } catch (error) {
      console.log('Could not load visited locations:', error);
      this.visitedIPs = new Map();
    }
  }

  loadExistingMarkers() {
    const now = Date.now();
    const retentionMs = this.options.retentionDays * 24 * 60 * 60 * 1000;
    let count = 0;

    for (const [ip, data] of this.visitedIPs.entries()) {
      // Filter old entries
      if (now - data.timestamp > retentionMs) {
        this.visitedIPs.delete(ip);
        continue;
      }

      // Add marker for each location
      if (data.latitude && data.longitude && count < this.options.maxMarkers) {
        this.addMarker({
          latitude: data.latitude,
          longitude: data.longitude,
          city: data.city,
          country: data.country,
          timestamp: data.timestamp,
          visitorCount: data.visitorCount
        });
        count++;
      }
    }
  }

  updateStats() {
    const totalLocations = this.visitedIPs.size;
    const totalVisits = Array.from(this.visitedIPs.values()).reduce((sum, data) => sum + (data.visitorCount || 1), 0);

    // You could add stats display here if needed
    console.log(`Total locations: ${totalLocations}, Total visits: ${totalVisits}`);
  }

  formatTime(timestamp) {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;

      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    } catch (error) {
      return 'Unknown';
    }
  }
}

// Initialize the map when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.visitorMap = new LeafletVisitorMap('visitor-map', {
    maxMarkers: 100,
    retentionDays: 30
  });
});
