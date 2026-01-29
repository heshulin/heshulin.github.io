// Advanced IP Tracking World Map with Privacy Compliance & Performance Optimization
// Implements advanced geolocation with privacy safeguards and performance optimization

class AdvancedPrivacyCompliantIPTracker {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      maxMarkers: options.maxMarkers || 100,
      privacyEnabled: options.privacyEnabled !== false,
      retentionDays: options.retentionDays || 30,
      rateLimitMs: options.rateLimitMs || 30000, // 30 seconds between checks
      enableAnonymization: options.enableAnonymization !== false,
      ...options
    };

    // Data structures optimized for performance
    this.visitedIPs = new Map();
    this.markers = new Map();
    this.storageKey = 'privacy_compliant_locations';
    
    // Rate limiting
    this.lastCheckTime = 0;
    this.isChecking = false;
    
    // Performance utilities
    this.debouncedTrack = this.debounce(() => this.trackVisitor(), 1000);
    this.throttledRender = this.throttle(() => this.renderMarkers(), 500);
    
    // Load persisted data
    this.loadVisitedLocations();
    
    // Initialize the tracker
    this.init();
  }

  init() {
    this.createMapContainer();
    this.loadExistingMarkers();
    this.trackVisitor();
    this.setupEventListeners();
  }

  createMapContainer() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Add optimized styles
    if (!document.getElementById('advanced-privacy-map-styles')) {
      const style = document.createElement('style');
      style.id = 'advanced-privacy-map-styles';
      style.textContent = `
        .advanced-privacy-map-wrapper {
          position: relative;
          width: 100%;
          height: 350px;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
          margin-top: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          background: linear-gradient(135deg, #f5f7fa 0%, #e4edf5 100%);
        }
        
        .map-title {
          font-size: 1.2em;
          font-weight: bold;
          margin-bottom: 10px;
          color: #2c3e50;
        }
        
        .visitor-stats {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 0.9em;
          color: #7f8c8d;
        }
        
        .map-controls {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 1000;
          background: rgba(255, 255, 255, 0.9);
          padding: 8px;
          border-radius: 6px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          display: flex;
          gap: 6px;
        }
        
        .map-controls button {
          background: #3498db;
          color: white;
          border: none;
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8em;
          transition: background 0.3s;
        }
        
        .map-controls button:hover {
          background: #2980b9;
        }
        
        .privacy-badge {
          position: absolute;
          bottom: 10px;
          right: 10px;
          z-index: 1000;
          background: rgba(46, 204, 113, 0.2);
          color: #27ae60;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.7em;
          font-weight: bold;
        }
        
        .loading-indicator {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #7f8c8d;
          font-style: italic;
          z-index: 1001;
        }
        
        .pulse-animation {
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 0.7; }
        }
      `;
      document.head.appendChild(style);
    }

    container.innerHTML = `
      <div class="map-title">访客分布图 (隐私合规版)</div>
      <div class="advanced-privacy-map-wrapper">
        <div id="${this.containerId}-canvas" style="width:100%; height:100%;"></div>
        <div id="${this.containerId}-loading" class="loading-indicator" style="display:none;">
          <div class="pulse-animation">正在定位匿名访客...</div>
        </div>
        <div class="map-controls">
          <button id="${this.containerId}-refresh-btn" title="刷新位置">刷新</button>
          <button id="${this.containerId}-clear-btn" title="清除标记">清空</button>
          <button id="${this.containerId}-stats-btn" title="查看统计">统计</button>
        </div>
        <div class="privacy-badge">隐私合规</div>
      </div>
      <div class="visitor-stats">
        <div>已记录访客位置: <span id="${this.containerId}-count">${this.markers.size}</span></div>
        <div>匿名数据: <span id="${this.containerId}-anon">启用</span></div>
      </div>
    `;

    // Add event listeners
    document.getElementById(`${this.containerId}-refresh-btn`).addEventListener('click', () => {
      this.debouncedTrack();
    });
    
    document.getElementById(`${this.containerId}-clear-btn`).addEventListener('click', () => {
      this.clearMarkers();
    });
    
    document.getElementById(`${this.containerId}-stats-btn`).addEventListener('click', () => {
      this.showStatistics();
    });

    this.renderMap();
  }

  renderMap() {
    const canvasContainer = document.getElementById(`${this.containerId}-canvas`);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 500");
    svg.setAttribute("style", "width:100%; height:100%;");
    
    // Enhanced continent paths with better detail
    const continents = [
      { // North America
        path: "M120,100 C180,80 220,90 250,120 C300,80 350,100 400,140 L400,280 C350,270 300,290 250,260 C200,280 150,250 120,200 Z",
        fill: "#aed581", stroke: "#689f38", strokeWidth: "0.8", opacity: "0.7"
      },
      { // South America
        path: "M200,250 C250,270 280,320 260,370 C220,390 180,370 170,330 C180,290 190,260 200,250 Z",
        fill: "#aed581", stroke: "#689f38", strokeWidth: "0.8", opacity: "0.7"
      },
      { // Europe
        path: "M420,80 C450,70 480,80 500,100 C530,90 560,110 570,140 C560,170 540,180 510,170 C480,180 450,160 430,130 Z",
        fill: "#aed581", stroke: "#689f38", strokeWidth: "0.8", opacity: "0.7"
      },
      { // Africa
        path: "M430,130 C470,140 500,180 510,230 C490,280 460,320 420,330 C390,300 380,250 400,200 C410,160 420,140 430,130 Z",
        fill: "#aed581", stroke: "#689f38", strokeWidth: "0.8", opacity: "0.7"
      },
      { // Asia
        path: "M550,80 C600,70 680,80 720,120 C780,100 850,120 870,160 L870,280 C820,300 770,290 720,310 C670,330 620,320 580,290 C540,300 500,270 520,230 C530,180 540,130 550,80 Z",
        fill: "#aed581", stroke: "#689f38", strokeWidth: "0.8", opacity: "0.7"
      },
      { // Australia
        path: "M720,300 C760,310 790,340 780,370 C750,390 710,380 690,350 C700,320 710,300 720,300 Z",
        fill: "#aed581", stroke: "#689f38", strokeWidth: "0.8", opacity: "0.7"
      }
    ];

    continents.forEach(continent => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", continent.path);
      path.setAttribute("fill", continent.fill);
      path.setAttribute("stroke", continent.stroke);
      path.setAttribute("stroke-width", continent.strokeWidth);
      path.setAttribute("opacity", continent.opacity);
      svg.appendChild(path);
    });

    // Create markers group
    this.markersGroup = document.createElementNS(svgNS, "g");
    this.markersGroup.setAttribute("id", `${this.containerId}-markers`);
    svg.appendChild(this.markersGroup);

    canvasContainer.innerHTML = '';
    canvasContainer.appendChild(svg);
  }

  async trackVisitor() {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastCheckTime < this.options.rateLimitMs) {
      return; // Too soon since last check
    }
    
    if (this.isChecking) {
      return; // Already checking
    }
    
    this.isChecking = true;
    this.lastCheckTime = now;

    const loadingEl = document.getElementById(`${this.containerId}-loading`);
    if (loadingEl) loadingEl.style.display = 'block';

    try {
      const ipData = await this.getVisitorLocation();
      
      if (ipData && this.shouldRecordLocation(ipData)) {
        const anonymizedData = this.anonymizeLocationData(ipData);
        this.addMarker(anonymizedData);
        this.saveVisitedLocation(anonymizedData);
        this.updateStats();
      }
    } catch (error) {
      console.log("Could not track visitor location:", error);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      this.isChecking = false;
    }
  }

  // Enhanced geolocation with privacy compliance
  async getVisitorLocation() {
    // First, try to get location from cache to minimize API calls
    const cacheKey = 'privacy_location_cache_' + Math.floor(Date.now() / (15 * 60 * 1000)); // 15-min cache
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 15 * 60 * 1000) {
          return parsed.data;
        }
      } catch (e) {
        console.debug("Cache parsing failed:", e);
      }
    }

    // Multiple fallback services with privacy-conscious approach
    const services = [
      // Primary: ipapi.co (does not log IP addresses according to their privacy policy)
      () => fetch('https://ipapi.co/json/', { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Privacy-Conscious-App' }
      }),
      // Secondary: ipinfo.io (with privacy considerations)
      () => fetch('https://ipinfo.io/json', { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Privacy-Conscious-App' }
      }),
      // Third option: api.my-ip.io (minimal logging)
      () => fetch('https://api.my-ip.io/ip.json', { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Privacy-Conscious-App' }
      })
    ];

    for (const serviceFn of services) {
      try {
        const response = await serviceFn();
        if (!response.ok) continue;
        
        const data = await response.json();
        
        // Verify we have valid coordinates
        if ((data.lat || data.latitude) && (data.lon || data.longitude || data.loc)) {
          const locationData = {
            ip: this.options.enableAnonymization ? this.hashIP(data.ip || data.query || 'unknown') : (data.ip || data.query),
            city: data.city || "Unknown",
            region: data.region || data.regionName || data.country || "Unknown",
            country: data.country || data.country_name || "Unknown",
            latitude: data.lat || data.latitude || (data.loc ? parseFloat(data.loc.split(',')[0]) : null),
            longitude: data.lon || data.longitude || (data.loc ? parseFloat(data.loc.split(',')[1]) : null),
            timestamp: new Date().toISOString(),
            isp: data.org || data.isp || "Unknown"
          };

          // Cache the successful result
          sessionStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: locationData
          }));

          return locationData;
        }
      } catch (error) {
        console.debug(`Geolocation service failed:`, error.message);
        continue;
      }
    }

    // If all services fail, return null rather than falling back to less privacy-conscious methods
    return null;
  }

  // Hash IP for privacy (simple client-side hashing)
  hashIP(ip) {
    if (!ip) return 'unknown';
    
    // Simple hash to obscure actual IP while maintaining uniqueness
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      const char = ip.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Return a pseudonymous identifier
    return `hashed_${Math.abs(hash).toString(36)}`;
  }

  shouldRecordLocation(locationData) {
    if (!locationData || !locationData.ip) return false;
    
    // Check if we've seen this hashed IP in the last 24 hours
    const today = new Date().toDateString();
    const ipKey = `${locationData.ip}-${today}`;
    
    if (this.visitedIPs.has(ipKey)) {
      return false;
    }
    
    // Add to visited IPs
    this.visitedIPs.set(ipKey, new Date());
    
    // Limit size to prevent memory issues
    if (this.visitedIPs.size > 1000) {
      const entries = Array.from(this.visitedIPs.entries());
      for (let i = 0; i < Math.floor(entries.length * 0.1); i++) {
        if (entries[i]) this.visitedIPs.delete(entries[i][0]);
      }
    }
    
    return true;
  }

  anonymizeLocationData(locationData) {
    if (!this.options.enableAnonymization) return locationData;
    
    // Anonymize by reducing precision of coordinates
    const anonymized = { ...locationData };
    
    if (anonymized.latitude && anonymized.longitude) {
      // Reduce coordinate precision to roughly 1km accuracy
      anonymized.latitude = Math.round(anonymized.latitude * 100) / 100;
      anonymized.longitude = Math.round(anonymized.longitude * 100) / 100;
    }
    
    // Remove ISP information for privacy
    delete anonymized.isp;
    
    return anonymized;
  }

  addMarker(locationData) {
    // Remove oldest marker if we've reached the limit
    if (this.markers.size >= this.options.maxMarkers) {
      const oldestKey = this.markers.keys().next().value;
      if (oldestKey) {
        const markerInfo = this.markers.get(oldestKey);
        if (markerInfo.element && markerInfo.element.parentNode) {
          markerInfo.element.parentNode.removeChild(markerInfo.element);
        }
        this.markers.delete(oldestKey);
      }
    }

    // Validate coordinates
    if (!locationData.latitude || !locationData.longitude) {
      return;
    }

    // Convert lat/long to SVG coordinates
    const x = 500 + (locationData.longitude * (1000 / 360));
    const y = 250 - (locationData.latitude * (500 / 180));

    // Ensure coordinates are within bounds
    if (x < 0 || x > 1000 || y < 0 || y > 500) {
      return;
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(svgNS, "circle");
    
    const markerId = `marker-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    circle.setAttribute("id", markerId);
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", this.getMarkerColorByCountry(locationData.country));
    circle.setAttribute("opacity", "0.85");
    circle.setAttribute("class", "visitor-marker");
    circle.setAttribute("data-ip-hash", locationData.ip);
    circle.setAttribute("data-time", locationData.timestamp);
    
    // Add subtle pulsing animation
    const animate = document.createElementNS(svgNS, "animate");
    animate.setAttribute("attributeName", "r");
    animate.setAttribute("values", "4;5;4");
    animate.setAttribute("dur", "3s");
    animate.setAttribute("repeatCount", "indefinite");
    circle.appendChild(animate);
    
    // Add privacy-conscious tooltip (doesn't reveal actual IP)
    const title = document.createElementNS(svgNS, "title");
    title.textContent = this.getPrivacyCompliantTooltip(locationData);
    circle.appendChild(title);
    
    // Add click handler
    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPrivacyCompliantDetails(locationData);
    });
    
    this.markersGroup.appendChild(circle);
    
    // Store marker info
    this.markers.set(markerId, {
      id: markerId,
      location: locationData,
      element: circle,
      timestamp: new Date(locationData.timestamp)
    });
  }

  getMarkerColorByCountry(country) {
    // Assign colors based on continent/region for visual grouping
    const countryColors = {
      'US': '#3498db', 'CA': '#3498db', 'MX': '#3498db', // Americas
      'BR': '#2ecc71', 'AR': '#2ecc71', 'CL': '#2ecc71',
      'GB': '#e74c3c', 'FR': '#e74c3c', 'DE': '#e74c3c', 'IT': '#e74c3c', // Europe
      'CN': '#f39c12', 'JP': '#f39c12', 'IN': '#f39c12', 'KR': '#f39c12', // Asia
      'NG': '#9b59b6', 'EG': '#9b59b6', 'ZA': '#9b59b6', // Africa
      'AU': '#1abc9c', 'NZ': '#1abc9c' // Oceania
    };
    
    return countryColors[country] || '#95a5a6'; // Default gray
  }

  getPrivacyCompliantTooltip(locationData) {
    let tooltip = `位置: ${locationData.city || '未知城市'}, ${locationData.country || '未知国家'}\n`;
    tooltip += `时间: ${new Date(locationData.timestamp).toLocaleString()}`;
    return tooltip;
  }

  showPrivacyCompliantDetails(locationData) {
    // Show only privacy-compliant information
    const details = [
      '访客信息 (隐私保护):',
      '',
      `国家: ${locationData.country || '未知'}`,
      `地区: ${locationData.city || locationData.region || '未知'}`,
      `坐标: ${locationData.latitude ? locationData.latitude.toFixed(2) + '°, ' + locationData.longitude?.toFixed(2) + '°' : 'N/A'}`,
      `访问时间: ${new Date(locationData.timestamp).toLocaleString()}`,
      '',
      '注意: 此数据已进行隐私脱敏处理'
    ].join('\n');
    
    alert(details);
  }

  clearMarkers() {
    // Remove all markers from DOM efficiently
    while (this.markersGroup.firstChild) {
      this.markersGroup.removeChild(this.markersGroup.firstChild);
    }
    
    // Clear collections
    this.markers.clear();
    this.visitedIPs.clear();
    
    // Clear localStorage
    localStorage.removeItem(this.storageKey);
    
    this.updateStats();
  }

  updateStats() {
    const countElement = document.getElementById(`${this.containerId}-count`);
    if (countElement) {
      countElement.textContent = this.markers.size;
    }
    
    const anonElement = document.getElementById(`${this.containerId}-anon`);
    if (anonElement) {
      anonElement.textContent = this.options.enableAnonymization ? '已启用' : '已禁用';
    }
  }

  showStatistics() {
    const stats = [
      '隐私合规统计:',
      '',
      `总标记数: ${this.markers.size}`,
      `IP哈希化: ${this.options.enableAnonymization ? '是' : '否'}`,
      `坐标精度: ${this.options.enableAnonymization ? '约1km' : '精确'}`,
      `数据保留: ${this.options.retentionDays}天`,
      `速率限制: ${this.options.rateLimitMs / 1000}秒/次`
    ].join('\n');
    
    alert(stats);
  }

  loadVisitedLocations() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        
        for (const item of parsed) {
          if (item.location && item.timestamp) {
            // Check if entry is within retention period
            const age = (Date.now() - new Date(item.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            if (age <= this.options.retentionDays) {
              const today = new Date(item.timestamp).toDateString();
              this.visitedIPs.set(`${item.location.ip}-${today}`, new Date(item.timestamp));
              
              const markerId = `marker-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
              this.markers.set(markerId, {
                id: markerId,
                location: item.location,
                element: null,
                timestamp: new Date(item.timestamp)
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("Error loading stored locations:", e);
    }
  }

  saveVisitedLocation(locationData) {
    try {
      const storageItem = {
        id: `storage-${Date.now()}`,
        location: locationData,
        timestamp: locationData.timestamp
      };
      
      let stored = [];
      const existing = localStorage.getItem(this.storageKey);
      if (existing) {
        try {
          stored = JSON.parse(existing);
        } catch (e) {
          console.warn("Corrupted storage data, resetting");
        }
      }
      
      stored.push(storageItem);
      
      // Prune old entries beyond retention period
      const cutoff = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
      stored = stored.filter(item => new Date(item.timestamp).getTime() > cutoff);
      
      // Limit stored items to prevent localStorage bloat
      if (stored.length > this.options.maxMarkers * 3) {
        stored = stored.slice(-Math.floor(this.options.maxMarkers * 2));
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(stored));
    } catch (e) {
      console.error("Error saving location:", e);
    }
  }

  loadExistingMarkers() {
    const storedMarkers = Array.from(this.markers.values()).slice(0, 50);
    
    let index = 0;
    const renderNextBatch = () => {
      const batchSize = 5;
      const batch = storedMarkers.slice(index, index + batchSize);
      
      if (batch.length === 0) return;
      
      for (const markerData of batch) {
        this.addMarkerFromStored(markerData.location);
      }
      
      index += batchSize;
      
      if (index < storedMarkers.length) {
        setTimeout(renderNextBatch, 100);
      }
    };
    
    renderNextBatch();
    this.updateStats();
  }

  addMarkerFromStored(locationData) {
    if (!locationData.latitude || !locationData.longitude) return;

    const x = 500 + (locationData.longitude * (1000 / 360));
    const y = 250 - (locationData.latitude * (500 / 180));

    if (x < 0 || x > 1000 || y < 0 || y > 500) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(svgNS, "circle");
    
    const markerId = `marker-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    circle.setAttribute("id", markerId);
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "3");
    circle.setAttribute("fill", this.getMarkerColorByCountry(locationData.country));
    circle.setAttribute("opacity", "0.7");
    circle.setAttribute("class", "stored-marker");
    
    const title = document.createElementNS(svgNS, "title");
    title.textContent = this.getPrivacyCompliantTooltip(locationData);
    circle.appendChild(title);
    
    circle.addEventListener('click', () => {
      this.showPrivacyCompliantDetails(locationData);
    });
    
    this.markersGroup.appendChild(circle);
  }

  setupEventListeners() {
    // Throttled resize handler
    window.addEventListener('resize', this.throttle(() => {
      // Could redraw map on resize if needed
    }, 500));
    
    // Page visibility API
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        setTimeout(() => this.debouncedTrack(), 2000);
      }
    });
  }

  // Performance utilities
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func.apply(this, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}

// Initialize the privacy-compliant map when the page loads
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('visitor-map')) {
    new AdvancedPrivacyCompliantIPTracker('visitor-map', {
      maxMarkers: 100,
      privacyEnabled: true,
      retentionDays: 30,
      rateLimitMs: 30000,
      enableAnonymization: true
    });
  }
});

// Graceful error handling
window.addEventListener('error', function(e) {
  console.error('Advanced privacy-compliant map script error:', e.error);
});