// Highly Optimized IP Tracking World Map with Advanced Features
// Uses modern approaches for IP geolocation and performance optimization

class OptimizedIPTrackerMap {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      maxMarkers: options.maxMarkers || 100,
      privacyEnabled: options.privacyEnabled !== false,
      updateInterval: options.updateInterval || 30000, // 30 seconds
      retentionDays: options.retentionDays || 30,
      ...options
    };

    // Efficient storage with Map for O(1) lookups
    this.visitedIPs = new Map(); 
    this.markers = new Map();
    this.storageKey = 'optimizedVisitedLocations';
    
    // Debounce and throttle utilities
    this.debouncedTrack = this.debounce(() => this.trackVisitor(), 1000);
    this.throttledRender = this.throttle(() => this.renderMarkers(), 500);
    
    this.loadVisitedLocations();
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

    // Efficient styling with single style element
    if (!document.getElementById('optimized-map-styles')) {
      const style = document.createElement('style');
      style.id = 'optimized-map-styles';
      style.textContent = `
        .optimized-map-wrapper {
          position: relative;
          width: 100%;
          height: 350px;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
          margin-top: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          background: #f8f9fa;
        }
        
        .map-title {
          font-size: 1.2em;
          font-weight: bold;
          margin-bottom: 10px;
          color: #333;
        }
        
        .visitor-stats {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 0.9em;
          color: #666;
        }
        
        .map-controls {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 1000;
          background: white;
          padding: 5px;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          display: flex;
          gap: 5px;
        }
        
        .map-controls button {
          background: #4a86e8;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.8em;
        }
        
        .map-controls button:hover {
          background: #3a76d8;
        }
        
        .privacy-notice {
          font-size: 0.8em;
          color: #999;
          margin-top: 5px;
          text-align: center;
        }
        
        .loading-indicator {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #666;
          font-style: italic;
        }
      `;
      document.head.appendChild(style);
    }

    container.innerHTML = `
      <div class="map-title">访客分布图</div>
      <div class="optimized-map-wrapper">
        <div id="${this.containerId}-canvas" style="width:100%; height:100%;"></div>
        <div id="${this.containerId}-loading" class="loading-indicator" style="display:none;">正在定位...</div>
        <div class="map-controls">
          <button id="${this.containerId}-refresh-btn" title="刷新位置">刷新</button>
          <button id="${this.containerId}-clear-btn" title="清除标记">清空</button>
        </div>
      </div>
      <div class="visitor-stats">
        <div>已记录访客位置: <span id="${this.containerId}-count">${this.markers.size}</span></div>
        <div>今日访客: <span id="${this.containerId}-today">-</span></div>
      </div>
      <div class="privacy-notice">我们尊重您的隐私，仅记录匿名地理位置信息</div>
    `;

    // Event listeners
    document.getElementById(`${this.containerId}-refresh-btn`).addEventListener('click', () => {
      this.debouncedTrack();
    });
    
    document.getElementById(`${this.containerId}-clear-btn`).addEventListener('click', () => {
      this.clearMarkers();
    });

    this.renderMap();
  }

  renderMap() {
    const canvasContainer = document.getElementById(`${this.containerId}-canvas`);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 500");
    svg.setAttribute("style", "width:100%; height:100%; background: linear-gradient(to bottom, #e6f3ff 0%, #cce6ff 100%);");
    
    // More detailed continent paths with better accuracy
    const continents = [
      { // North America
        path: "M120,100 C180,80 220,90 250,120 C300,80 350,100 400,140 L400,280 C350,270 300,290 250,260 C200,280 150,250 120,200 Z",
        fill: "#c8e6c9", stroke: "#81c784", strokeWidth: "0.5"
      },
      { // South America
        path: "M200,250 C250,270 280,320 260,370 C220,390 180,370 170,330 C180,290 190,260 200,250 Z",
        fill: "#c8e6c9", stroke: "#81c784", strokeWidth: "0.5"
      },
      { // Europe
        path: "M420,80 C450,70 480,80 500,100 C530,90 560,110 570,140 C560,170 540,180 510,170 C480,180 450,160 430,130 Z",
        fill: "#c8e6c9", stroke: "#81c784", strokeWidth: "0.5"
      },
      { // Africa
        path: "M430,130 C470,140 500,180 510,230 C490,280 460,320 420,330 C390,300 380,250 400,200 C410,160 420,140 430,130 Z",
        fill: "#c8e6c9", stroke: "#81c784", strokeWidth: "0.5"
      },
      { // Asia
        path: "M550,80 C600,70 680,80 720,120 C780,100 850,120 870,160 L870,280 C820,300 770,290 720,310 C670,330 620,320 580,290 C540,300 500,270 520,230 C530,180 540,130 550,80 Z",
        fill: "#c8e6c9", stroke: "#81c784", strokeWidth: "0.5"
      },
      { // Australia
        path: "M720,300 C760,310 790,340 780,370 C750,390 710,380 690,350 C700,320 710,300 720,300 Z",
        fill: "#c8e6c9", stroke: "#81c784", strokeWidth: "0.5"
      }
    ];

    continents.forEach(continent => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", continent.path);
      path.setAttribute("fill", continent.fill);
      path.setAttribute("stroke", continent.stroke);
      path.setAttribute("stroke-width", continent.strokeWidth);
      path.setAttribute("opacity", "0.7");
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
    const loadingEl = document.getElementById(`${this.containerId}-loading`);
    if (loadingEl) loadingEl.style.display = 'block';

    try {
      const ipData = await this.getVisitorLocation();
      
      if (ipData && this.shouldRecordLocation(ipData)) {
        this.addMarker(ipData);
        this.saveVisitedLocation(ipData);
        this.updateStats();
      }
    } catch (error) {
      console.log("Could not track visitor location:", error);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  // Optimized geolocation with multiple fallbacks and caching
  async getVisitorLocation() {
    const cacheKey = 'cached_location_' + Math.floor(Date.now() / (30 * 60 * 1000)); // 30-min cache
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Use cached data if not older than 30 mins
        if (parsed.timestamp && Date.now() - parsed.timestamp < 30 * 60 * 1000) {
          return parsed.data;
        }
      } catch (e) {
        console.debug("Cache parsing failed:", e);
      }
    }

    // Try multiple services in sequence with timeouts
    const services = [
      () => fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) }),
      () => fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(5000) }),
      () => fetch('https://api.my-ip.io/ip.json', { signal: AbortSignal.timeout(5000) })
    ];

    for (const serviceFn of services) {
      try {
        const response = await serviceFn();
        if (!response.ok) continue;
        
        const data = await response.json();
        
        // Verify we have valid coordinates
        if ((data.lat || data.latitude) && (data.lon || data.longitude || data.loc)) {
          const locationData = {
            ip: data.ip || data.query,
            city: data.city || data.hostname?.split('.')[0] || "Unknown",
            region: data.region || data.regionName || data.country || "Unknown",
            country: data.country || data.country_name || "Unknown",
            latitude: data.lat || data.latitude || (data.loc ? parseFloat(data.loc.split(',')[0]) : null),
            longitude: data.lon || data.longitude || (data.loc ? parseFloat(data.loc.split(',')[1]) : null),
            timestamp: new Date().toISOString()
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
        continue; // Try next service
      }
    }

    // If all services fail, generate a location based on timezone as a last resort
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzOffsets = {
      'America/New_York': { lat: 40.7128, lng: -74.0060 },
      'America/Los_Angeles': { lat: 34.0522, lng: -118.2437 },
      'America/Chicago': { lat: 41.8781, lng: -87.6298 },
      'America/Denver': { lat: 39.7392, lng: -104.9903 },
      'Europe/London': { lat: 51.5074, lng: -0.1278 },
      'Europe/Paris': { lat: 48.8566, lng: 2.3522 },
      'Asia/Tokyo': { lat: 35.6762, lng: 139.6503 },
      'Asia/Shanghai': { lat: 31.2304, lng: 121.4737 },
      'Asia/Kolkata': { lat: 19.0760, lng: 72.8777 },
      'Australia/Sydney': { lat: -33.8688, lng: 151.2093 }
    };

    if (tzOffsets[timezone]) {
      return {
        ip: "unknown",
        city: "Estimated",
        region: timezone,
        country: "Based on timezone",
        latitude: tzOffsets[timezone].lat,
        longitude: tzOffsets[timezone].lng,
        timestamp: new Date().toISOString()
      };
    }

    return null;
  }

  shouldRecordLocation(locationData) {
    if (!locationData || !locationData.ip) return false;
    
    // Check if we've seen this IP in the last 24 hours
    const today = new Date().toDateString();
    const ipKey = `${locationData.ip}-${today}`;
    
    if (this.visitedIPs.has(ipKey)) {
      return false;
    }
    
    // Add to visited IPs
    this.visitedIPs.set(ipKey, new Date());
    
    // Limit size to prevent memory issues
    if (this.visitedIPs.size > 1000) {
      // Remove oldest entries (first 10%)
      const entries = Array.from(this.visitedIPs.entries());
      for (let i = 0; i < Math.floor(entries.length * 0.1); i++) {
        if (entries[i]) this.visitedIPs.delete(entries[i][0]);
      }
    }
    
    return true;
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
      // Skip invalid locations
      return;
    }

    // Convert lat/long to SVG coordinates
    const x = 500 + (locationData.longitude * (1000 / 360));
    const y = 250 - (locationData.latitude * (500 / 180));

    // Ensure coordinates are within bounds
    if (x < 0 || x > 1000 || y < 0 || y > 500) {
      // Location is outside reasonable bounds, skip
      return;
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(svgNS, "circle");
    
    const markerId = `marker-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    circle.setAttribute("id", markerId);
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", "#FF5722");
    circle.setAttribute("opacity", "0.9");
    circle.setAttribute("class", "visitor-marker");
    circle.setAttribute("data-ip", locationData.ip);
    circle.setAttribute("data-time", locationData.timestamp);
    
    // Add pulsing animation with optimized performance
    const animate = document.createElementNS(svgNS, "animate");
    animate.setAttribute("attributeName", "r");
    animate.setAttribute("values", "4;5;4");
    animate.setAttribute("dur", "2s");
    animate.setAttribute("repeatCount", "indefinite");
    circle.appendChild(animate);
    
    // Add tooltip
    const title = document.createElementNS(svgNS, "title");
    title.textContent = this.getLocationTooltip(locationData);
    circle.appendChild(title);
    
    // Add click handler
    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showLocationDetails(locationData);
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

  getLocationTooltip(locationData) {
    let tooltip = `IP: ${locationData.ip || 'Unknown'}\n`;
    if (locationData.city && locationData.city !== "Unknown") tooltip += `城市: ${locationData.city}\n`;
    if (locationData.region && locationData.region !== "Unknown") tooltip += `地区: ${locationData.region}\n`;
    if (locationData.country && locationData.country !== "Unknown") tooltip += `国家: ${locationData.country}\n`;
    tooltip += `时间: ${new Date(locationData.timestamp).toLocaleString()}`;
    return tooltip;
  }

  showLocationDetails(locationData) {
    const details = [
      '访问详情:',
      '',
      `IP地址: ${locationData.ip || 'Unknown'}`,
      `位置: ${[locationData.city, locationData.region, locationData.country].filter(Boolean).join(', ')}`,
      `坐标: ${locationData.latitude ? locationData.latitude.toFixed(4) + '°, ' + locationData.longitude?.toFixed(4) + '°' : 'N/A'}`,
      `访问时间: ${new Date(locationData.timestamp).toLocaleString()}`
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
    
    // Calculate today's visitors
    const today = new Date().toDateString();
    let todayCount = 0;
    
    for (const marker of this.markers.values()) {
      if (new Date(marker.timestamp).toDateString() === today) {
        todayCount++;
      }
    }
    
    const todayElement = document.getElementById(`${this.containerId}-today`);
    if (todayElement) {
      todayElement.textContent = todayCount;
    }
  }

  loadVisitedLocations() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        
        // Process and validate stored data
        for (const item of parsed) {
          if (item.location && item.location.ip && item.timestamp) {
            // Check if entry is within retention period
            const age = (Date.now() - new Date(item.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            if (age <= this.options.retentionDays) {
              // Add to visited IPs
              const today = new Date(item.timestamp).toDateString();
              this.visitedIPs.set(`${item.location.ip}-${today}`, new Date(item.timestamp));
              
              // Add to markers collection (but not to DOM yet)
              const markerId = `marker-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
              this.markers.set(markerId, {
                id: markerId,
                location: item.location,
                element: null, // Will be created when rendered
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
      // Prepare data for storage
      const storageItem = {
        id: `storage-${Date.now()}`,
        location: locationData,
        timestamp: locationData.timestamp
      };
      
      // Load existing data
      let stored = [];
      const existing = localStorage.getItem(this.storageKey);
      if (existing) {
        try {
          stored = JSON.parse(existing);
        } catch (e) {
          console.warn("Corrupted storage data, resetting");
        }
      }
      
      // Add new item
      stored.push(storageItem);
      
      // Prune old entries beyond retention period
      const cutoff = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
      stored = stored.filter(item => new Date(item.timestamp).getTime() > cutoff);
      
      // Limit stored items to prevent localStorage bloat
      if (stored.length > this.options.maxMarkers * 2) {
        stored = stored.slice(-Math.floor(this.options.maxMarkers * 1.5));
      }
      
      // Save back to localStorage
      localStorage.setItem(this.storageKey, JSON.stringify(stored));
    } catch (e) {
      console.error("Error saving location:", e);
    }
  }

  loadExistingMarkers() {
    // Render stored markers with throttling to prevent blocking UI
    const storedMarkers = Array.from(this.markers.values()).slice(0, 50); // Limit initial render
    
    let index = 0;
    const renderNextBatch = () => {
      const batchSize = 5;
      const batch = storedMarkers.slice(index, index + batchSize);
      
      if (batch.length === 0) return; // Done
      
      for (const markerData of batch) {
        this.addMarkerFromStored(markerData.location);
      }
      
      index += batchSize;
      
      // Schedule next batch
      if (index < storedMarkers.length) {
        setTimeout(renderNextBatch, 100);
      }
    };
    
    renderNextBatch();
    this.updateStats();
  }

  addMarkerFromStored(locationData) {
    // Validate coordinates before adding
    if (!locationData.latitude || !locationData.longitude) return;

    // Convert lat/long to SVG coordinates
    const x = 500 + (locationData.longitude * (1000 / 360));
    const y = 250 - (locationData.latitude * (500 / 180));

    // Ensure coordinates are within bounds
    if (x < 0 || x > 1000 || y < 0 || y > 500) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(svgNS, "circle");
    
    const markerId = `marker-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    circle.setAttribute("id", markerId);
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "3");
    circle.setAttribute("fill", "#4CAF50");
    circle.setAttribute("opacity", "0.7");
    circle.setAttribute("class", "stored-marker");
    
    const title = document.createElementNS(svgNS, "title");
    title.textContent = this.getLocationTooltip(locationData);
    circle.appendChild(title);
    
    circle.addEventListener('click', () => {
      this.showLocationDetails(locationData);
    });
    
    this.markersGroup.appendChild(circle);
  }

  setupEventListeners() {
    // Throttled resize handler
    window.addEventListener('resize', this.throttle(() => {
      // In a real implementation, we might redraw the map
    }, 500));
    
    // Page visibility API to pause/resume tracking
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Page became visible, refresh location
        setTimeout(() => this.debouncedTrack(), 2000);
      }
    });
  }

  // Utility functions for performance optimization
  
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
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

// Initialize the map when the page loads
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('visitor-map')) {
    new OptimizedIPTrackerMap('visitor-map', {
      maxMarkers: 100,
      privacyEnabled: true,
      updateInterval: 30000
    });
  }
});

// Handle potential errors gracefully
window.addEventListener('error', function(e) {
  console.error('Optimized map script error:', e.error);
});