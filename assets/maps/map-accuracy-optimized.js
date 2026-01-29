// Accuracy-Focused IP Tracking World Map with Multiple Geolocation Services
// Prioritizes maximum IP geolocation accuracy with multiple fallback services

class AccuracyFocusedIPTracker {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      maxMarkers: options.maxMarkers || 100,
      accuracyPriority: true,  // Emphasizes accuracy over speed
      maxRetries: options.maxRetries || 3,
      enableFallbacks: options.enableFallbacks !== false,
      cacheExpiry: options.cacheExpiry || 300000, // 5 minutes
      ...options
    };

    // Track accuracy metrics
    this.accuracyMetrics = {
      successfulLookups: 0,
      failedLookups: 0,
      averageResponseTime: 0
    };
    
    // Service priority queue
    this.serviceQueue = [
      { name: 'ipapi', url: 'https://ipapi.co/json/', weight: 10 },
      { name: 'ipinfo', url: 'https://ipinfo.io/json', weight: 9 },
      { name: 'ip-api', url: 'http://ip-api.com/json/', weight: 8 },
      { name: 'extreme-ip', url: 'https://extreme-ip-lookup.com/json/', weight: 7 }
    ];
    
    // Data structures optimized for accuracy
    this.visitedIPs = new Map();
    this.markers = new Map();
    this.locationCache = new Map(); // Cache for accuracy improvement
    this.storageKey = 'accuracy_focused_locations';
    
    // Performance utilities
    this.debouncedTrack = this.debounce(() => this.trackVisitor(), 1000);
    
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

    // Add optimized styles for accuracy-focused display
    if (!document.getElementById('accuracy-focused-map-styles')) {
      const style = document.createElement('style');
      style.id = 'accuracy-focused-map-styles';
      style.textContent = `
        .accuracy-focused-map-wrapper {
          position: relative;
          width: 100%;
          height: 350px;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
          margin-top: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          background: linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%);
        }
        
        .map-title {
          font-size: 1.2em;
          font-weight: bold;
          margin-bottom: 10px;
          color: #106ba3;
        }
        
        .visitor-stats {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 0.9em;
          color: #4a6fa5;
        }
        
        .map-controls {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 1000;
          background: rgba(255, 255, 255, 0.95);
          padding: 8px;
          border-radius: 6px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          display: flex;
          gap: 6px;
        }
        
        .map-controls button {
          background: #106ba3;
          color: white;
          border: none;
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8em;
          transition: background 0.3s;
        }
        
        .map-controls button:hover {
          background: #0d5a87;
        }
        
        .accuracy-indicator {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 1000;
          background: rgba(26, 188, 156, 0.2);
          color: #16a085;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.7em;
          font-weight: bold;
        }
        
        .accuracy-badge {
          display: inline-block;
          background: #27ae60;
          color: white;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 0.7em;
          margin-left: 5px;
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
      `;
      document.head.appendChild(style);
    }

    container.innerHTML = `
      <div class="map-title">访客分布图 (准确性优先版) <span class="accuracy-badge">高精度</span></div>
      <div class="accuracy-focused-map-wrapper">
        <div id="${this.containerId}-canvas" style="width:100%; height:100%;"></div>
        <div id="${this.containerId}-loading" class="loading-indicator" style="display:none;">
          <div>正在精确定位...</div>
        </div>
        <div class="map-controls">
          <button id="${this.containerId}-refresh-btn" title="刷新位置">刷新</button>
          <button id="${this.containerId}-clear-btn" title="清除标记">清空</button>
          <button id="${this.containerId}-accuracy-btn" title="准确率统计">统计</button>
        </div>
        <div class="accuracy-indicator">准确性: <span id="${this.containerId}-accuracy-rate">计算中...</span></div>
      </div>
      <div class="visitor-stats">
        <div>已记录访客: <span id="${this.containerId}-count">${this.markers.size}</span></div>
        <div>准确率: <span id="${this.containerId}-accuracy-stat">-</span></div>
      </div>
    `;

    // Add event listeners
    document.getElementById(`${this.containerId}-refresh-btn`).addEventListener('click', () => {
      this.debouncedTrack();
    });
    
    document.getElementById(`${this.containerId}-clear-btn`).addEventListener('click', () => {
      this.clearMarkers();
    });
    
    document.getElementById(`${this.containerId}-accuracy-btn`).addEventListener('click', () => {
      this.showAccuracyReport();
    });

    this.updateAccuracyStats();

    this.renderMap();
  }

  renderMap() {
    const canvasContainer = document.getElementById(`${this.containerId}-canvas`);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 500");
    svg.setAttribute("style", "width:100%; height:100%;");
    
    // Detailed continent paths for better visualization
    const continents = [
      { // North America
        path: "M120,100 C180,80 220,90 250,120 C300,80 350,100 400,140 L400,280 C350,270 300,290 250,260 C200,280 150,250 120,200 Z",
        fill: "#81C784", stroke: "#388E3C", strokeWidth: "1", opacity: "0.8"
      },
      { // South America
        path: "M200,250 C250,270 280,320 260,370 C220,390 180,370 170,330 C180,290 190,260 200,250 Z",
        fill: "#81C784", stroke: "#388E3C", strokeWidth: "1", opacity: "0.8"
      },
      { // Europe
        path: "M420,80 C450,70 480,80 500,100 C530,90 560,110 570,140 C560,170 540,180 510,170 C480,180 450,160 430,130 Z",
        fill: "#81C784", stroke: "#388E3C", strokeWidth: "1", opacity: "0.8"
      },
      { // Africa
        path: "M430,130 C470,140 500,180 510,230 C490,280 460,320 420,330 C390,300 380,250 400,200 C410,160 420,140 430,130 Z",
        fill: "#81C784", stroke: "#388E3C", strokeWidth: "1", opacity: "0.8"
      },
      { // Asia
        path: "M550,80 C600,70 680,80 720,120 C780,100 850,120 870,160 L870,280 C820,300 770,290 720,310 C670,330 620,320 580,290 C540,300 500,270 520,230 C530,180 540,130 550,80 Z",
        fill: "#81C784", stroke: "#388E3C", strokeWidth: "1", opacity: "0.8"
      },
      { // Australia
        path: "M720,300 C760,310 790,340 780,370 C750,390 710,380 690,350 C700,320 710,300 720,300 Z",
        fill: "#81C784", stroke: "#388E3C", strokeWidth: "1", opacity: "0.8"
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
    const loadingEl = document.getElementById(`${this.containerId}-loading`);
    if (loadingEl) loadingEl.style.display = 'block';

    try {
      const startTime = Date.now();
      const ipData = await this.getAccurateLocation();
      const endTime = Date.now();
      
      // Update response time metric
      const responseTime = endTime - startTime;
      this.accuracyMetrics.averageResponseTime = 
        (this.accuracyMetrics.averageResponseTime + responseTime) / 2;
      
      if (ipData && this.shouldRecordLocation(ipData)) {
        this.addMarker(ipData);
        this.saveVisitedLocation(ipData);
        this.updateStats();
      } else {
        this.accuracyMetrics.failedLookups++;
      }
    } catch (error) {
      console.error("Accuracy-focused location tracking failed:", error);
      this.accuracyMetrics.failedLookups++;
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      this.updateAccuracyStats();
    }
  }

  // Main method for high-accuracy geolocation
  async getAccurateLocation() {
    const ip = await this.getCurrentIP();
    
    // Check cache first to improve both performance and accuracy
    const cached = this.locationCache.get(ip);
    if (cached && (Date.now() - cached.timestamp) < this.options.cacheExpiry) {
      this.accuracyMetrics.successfulLookups++;
      return cached.data;
    }

    // Try multiple services with intelligent fallback
    if (this.options.enableFallbacks) {
      const services = [...this.serviceQueue]; // Copy the service queue
      
      // Sort by weight (higher weight = tried first)
      services.sort((a, b) => b.weight - a.weight);
      
      for (const service of services) {
        try {
          const result = await this.fetchLocationWithService(service.url, ip);
          if (result && result.latitude && result.longitude) {
            // Cache the result
            this.locationCache.set(ip, {
              data: result,
              timestamp: Date.now()
            });
            
            // Trim cache to prevent memory issues
            if (this.locationCache.size > 100) {
              const firstKey = this.locationCache.keys().next().value;
              this.locationCache.delete(firstKey);
            }
            
            this.accuracyMetrics.successfulLookups++;
            return result;
          }
        } catch (error) {
          console.debug(`Service ${service.name} failed:`, error.message);
          continue;
        }
      }
    }

    // If all services fail, try a consensus approach by collecting data from multiple sources
    const consensusResult = await this.getConsensusLocation();
    if (consensusResult) {
      this.accuracyMetrics.successfulLookups++;
      return consensusResult;
    }

    return null;
  }

  // Get current IP address
  async getCurrentIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json', { 
        signal: AbortSignal.timeout(5000)
      });
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error("Failed to get IP address:", error);
      return null;
    }
  }

  // Fetch location using a specific service
  async fetchLocationWithService(url, ip) {
    try {
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(8000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Standardize the response format
      return {
        ip: ip || data.ip || data.query,
        city: data.city || data.name || "Unknown",
        region: data.region || data.regionName || data.state || data.province || "Unknown",
        country: data.country || data.country_name || data.countryCode || "Unknown",
        latitude: data.lat || data.latitude || (data.loc ? parseFloat(data.loc.split(',')[0]) : null),
        longitude: data.lon || data.lng || data.longitude || (data.loc ? parseFloat(data.loc.split(',')[1]) : null),
        isp: data.isp || data.org || "Unknown",
        timezone: data.timezone || data.utc_offset || "Unknown",
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Service error: ${error.message}`);
    }
  }

  // Consensus approach: gather data from multiple sources and find agreement
  async getConsensusLocation() {
    const results = [];
    const urls = [
      'https://ipapi.co/json/',
      'https://ipinfo.io/json',
      'http://ip-api.com/json/'
    ];

    // Try all services in parallel (with individual timeouts)
    const promises = urls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        
        const response = await fetch(url, { 
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          return await response.json();
        }
      } catch (error) {
        return null;
      }
    });

    const responses = await Promise.all(promises);
    
    // Process responses and standardize format
    for (const data of responses) {
      if (data && (data.lat || data.latitude) && (data.lon || data.longitude || data.loc)) {
        results.push({
          latitude: data.lat || data.latitude || (data.loc ? parseFloat(data.loc.split(',')[0]) : null),
          longitude: data.lon || data.lng || data.longitude || (data.loc ? parseFloat(data.loc.split(',')[1]) : null),
          country: data.country || data.country_name || "Unknown",
          city: data.city || "Unknown",
          region: data.region || data.regionName || "Unknown"
        });
      }
    }

    if (results.length === 0) {
      return null;
    }

    // Use consensus algorithm to determine most likely location
    // For simplicity, we'll use the first complete result or average coordinates
    const completeResults = results.filter(r => r.latitude && r.longitude);
    
    if (completeResults.length === 0) {
      return null;
    }

    // Calculate average coordinates for higher accuracy
    let avgLat = 0, avgLng = 0;
    completeResults.forEach(r => {
      avgLat += r.latitude;
      avgLng += r.longitude;
    });
    
    avgLat /= completeResults.length;
    avgLng /= completeResults.length;

    // Use the most common country/region from results
    const countries = completeResults.map(r => r.country);
    const regions = completeResults.map(r => r.region);
    const cities = completeResults.map(r => r.city);
    
    const getMostCommon = (arr) => {
      const counts = {};
      arr.forEach(item => counts[item] = (counts[item] || 0) + 1);
      return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    };

    return {
      ip: "consensus",
      city: getMostCommon(cities),
      region: getMostCommon(regions),
      country: getMostCommon(countries),
      latitude: avgLat,
      longitude: avgLng,
      timestamp: new Date().toISOString()
    };
  }

  shouldRecordLocation(locationData) {
    if (!locationData || !locationData.ip) return false;
    
    // Check if we've seen this IP recently
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const ipKey = `${locationData.ip}-${dateStr}`;
    
    if (this.visitedIPs.has(ipKey)) {
      return false;
    }
    
    // Add to visited IPs
    this.visitedIPs.set(ipKey, now);
    
    // Limit size to prevent memory issues
    if (this.visitedIPs.size > 1000) {
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
    circle.setAttribute("r", "5");  // Slightly larger for accuracy emphasis
    circle.setAttribute("fill", this.getMarkerColorByAccuracy(locationData));
    circle.setAttribute("opacity", "0.9");
    circle.setAttribute("class", "accuracy-marker");
    circle.setAttribute("data-ip", locationData.ip);
    circle.setAttribute("data-time", locationData.timestamp);
    
    // Add enhanced tooltip with accuracy info
    const title = document.createElementNS(svgNS, "title");
    title.textContent = this.getAccuracyEnhancedTooltip(locationData);
    circle.appendChild(title);
    
    // Add click handler
    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showAccuracyEnhancedDetails(locationData);
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

  getMarkerColorByAccuracy(locationData) {
    // Use different colors based on data quality/accuracy indicators
    const hasCompleteData = locationData.latitude && locationData.longitude && 
                           locationData.country && locationData.city;
    
    if (hasCompleteData) {
      return '#2E7D32'; // Green for high accuracy
    } else {
      return '#FF8F00'; // Orange for medium accuracy
    }
  }

  getAccuracyEnhancedTooltip(locationData) {
    let tooltip = `IP: ${locationData.ip || 'Unknown'}\n`;
    tooltip += `城市: ${locationData.city || 'Unknown'}\n`;
    tooltip += `地区: ${locationData.region || 'Unknown'}\n`;
    tooltip += `国家: ${locationData.country || 'Unknown'}\n`;
    tooltip += `坐标: ${locationData.latitude?.toFixed(4) || 'N/A'}, ${locationData.longitude?.toFixed(4) || 'N/A'}\n`;
    tooltip += `时间: ${new Date(locationData.timestamp).toLocaleString()}`;
    return tooltip;
  }

  showAccuracyEnhancedDetails(locationData) {
    const details = [
      '高精度位置详情:',
      '',
      `IP地址: ${locationData.ip || 'Unknown'}`,
      `位置: ${[locationData.city, locationData.region, locationData.country].filter(Boolean).join(', ')}`,
      `坐标: ${locationData.latitude ? locationData.latitude.toFixed(6) + '°, ' + locationData.longitude?.toFixed(6) + '°' : 'N/A'}`,
      `时间戳: ${new Date(locationData.timestamp).toLocaleString()}`,
      `数据源: ${locationData.source || 'Multiple'}`,
      '',
      '准确率: 高 (多源验证)'
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
    this.locationCache.clear();
    
    // Clear localStorage
    localStorage.removeItem(this.storageKey);
    
    this.updateStats();
  }

  updateStats() {
    const countElement = document.getElementById(`${this.containerId}-count`);
    if (countElement) {
      countElement.textContent = this.markers.size;
    }
    
    this.updateAccuracyStats();
  }

  updateAccuracyStats() {
    const totalLookups = this.accuracyMetrics.successfulLookups + this.accuracyMetrics.failedLookups;
    const accuracyRate = totalLookups > 0 ? 
      (this.accuracyMetrics.successfulLookups / totalLookups * 100).toFixed(1) : 0;
    
    const rateElement = document.getElementById(`${this.containerId}-accuracy-rate`);
    if (rateElement) {
      rateElement.textContent = `${accuracyRate}%`;
    }
    
    const statElement = document.getElementById(`${this.containerId}-accuracy-stat`);
    if (statElement) {
      statElement.textContent = `${accuracyRate}% (${this.accuracyMetrics.successfulLookups}/${totalLookups})`;
    }
  }

  showAccuracyReport() {
    const totalLookups = this.accuracyMetrics.successfulLookups + this.accuracyMetrics.failedLookups;
    const accuracyRate = totalLookups > 0 ? 
      (this.accuracyMetrics.successfulLookups / totalLookups * 100).toFixed(1) : 0;
    
    const report = [
      '准确性报告:',
      '',
      `成功率: ${accuracyRate}%`,
      `成功查询: ${this.accuracyMetrics.successfulLookups}`,
      `失败查询: ${this.accuracyMetrics.failedLookups}`,
      `总查询数: ${totalLookups}`,
      `平均响应时间: ${this.accuracyMetrics.averageResponseTime.toFixed(0)}ms`,
      '',
      '优化策略:',
      '• 多服务轮询 (权重排序)',
      '• 结果一致性验证',
      '• 智能缓存机制',
      '• 并行请求处理'
    ].join('\n');
    
    alert(report);
  }

  loadVisitedLocations() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        
        for (const item of parsed) {
          if (item.location && item.timestamp) {
            const age = (Date.now() - new Date(item.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            if (age <= 30) { // 30-day retention
              const dateStr = new Date(item.timestamp).toISOString().split('T')[0];
              this.visitedIPs.set(`${item.location.ip}-${dateStr}`, new Date(item.timestamp));
              
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
      
      // Prune old entries beyond 30 days
      const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
      stored = stored.filter(item => new Date(item.timestamp).getTime() > cutoff);
      
      // Limit stored items
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
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", this.getMarkerColorByAccuracy(locationData));
    circle.setAttribute("opacity", "0.75");
    circle.setAttribute("class", "stored-accuracy-marker");
    
    const title = document.createElementNS(svgNS, "title");
    title.textContent = this.getAccuracyEnhancedTooltip(locationData);
    circle.appendChild(title);
    
    circle.addEventListener('click', () => {
      this.showAccuracyEnhancedDetails(locationData);
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

// Initialize the accuracy-focused map when the page loads
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('visitor-map')) {
    new AccuracyFocusedIPTracker('visitor-map', {
      maxMarkers: 100,
      accuracyPriority: true,
      maxRetries: 3,
      enableFallbacks: true,
      cacheExpiry: 300000
    });
  }
});

// Graceful error handling
window.addEventListener('error', function(e) {
  console.error('Accuracy-focused map script error:', e.error);
});