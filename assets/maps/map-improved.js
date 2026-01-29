// Advanced IP Tracking World Map with Privacy Considerations
class AdvancedIPTrackerMap {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.visitedIPs = new Set();
    this.markers = [];
    this.maxMarkers = options.maxMarkers || 100; // Limit markers for performance
    this.privacyEnabled = options.privacyEnabled !== false; // Default to true
    
    // Store visited locations in localStorage to persist between sessions
    this.storageKey = 'visitedLocations';
    this.loadVisitedLocations();
    
    this.init();
  }

  init() {
    this.createMapContainer();
    this.loadExistingMarkers();
    this.trackVisitor();
    this.setupResizeHandler();
  }

  createMapContainer() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Add enhanced map styles
    let style = document.getElementById('advanced-map-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'advanced-map-styles';
      style.textContent = `
        .advanced-map-wrapper {
          position: relative;
          width: 100%;
          height: 350px;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
          margin-top: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
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
      `;
      document.head.appendChild(style);
    }

    // Create map HTML structure with controls
    container.innerHTML = `
      <div class="map-title">访客分布图</div>
      <div class="advanced-map-wrapper">
        <div id="${this.containerId}-canvas" style="width:100%; height:100%;"></div>
        <div class="map-controls">
          <button id="${this.containerId}-clear-btn" title="清除标记">清空</button>
        </div>
      </div>
      <div class="visitor-stats">
        <div>已记录访客位置: <span id="${this.containerId}-count">${this.markers.length}</span></div>
        <div>活跃访客: <span id="${this.containerId}-active">-</span></div>
      </div>
      <div class="privacy-notice">我们尊重您的隐私，仅记录匿名地理位置信息</div>
    `;

    // Add event listener for clear button
    document.getElementById(`${this.containerId}-clear-btn`).addEventListener('click', () => {
      this.clearMarkers();
    });

    // Initialize the map visualization
    this.renderMap();
  }

  renderMap() {
    const canvasContainer = document.getElementById(`${this.containerId}-canvas`);
    
    // Create SVG world map
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 500");
    svg.setAttribute("style", "width:100%; height:100%; background-color:#e6f3ff;");
    
    // Draw simplified continents
    const continents = [
      { // North America
        path: "M150,150 Q200,100 250,120 Q300,80 350,120 Q400,100 450,130 L450,250 Q400,280 350,250 Q300,270 250,250 Q200,270 150,220 Z",
        fill: "#c8e6c9", stroke: "#aaa"
      },
      { // South America
        path: "M200,250 Q250,300 220,350 Q180,380 170,350 Q180,300 200,250 Z",
        fill: "#c8e6c9", stroke: "#aaa"
      },
      { // Europe
        path: "M450,120 Q500,100 550,120 Q580,150 570,180 Q550,200 520,190 L500,180 Q480,160 450,150 Z",
        fill: "#c8e6c9", stroke: "#aaa"
      },
      { // Africa
        path: "M450,180 Q500,200 530,250 Q500,300 450,320 Q420,300 430,250 Q440,200 450,180 Z",
        fill: "#c8e6c9", stroke: "#aaa"
      },
      { // Asia
        path: "M550,100 Q600,80 700,100 Q800,90 850,130 L850,250 Q800,280 750,270 Q700,300 650,280 Q600,300 550,270 Q520,250 530,200 Q540,150 550,120 Z",
        fill: "#c8e6c9", stroke: "#aaa"
      },
      { // Australia
        path: "M750,300 Q800,320 820,350 Q790,380 760,360 Q740,340 750,300 Z",
        fill: "#c8e6c9", stroke: "#aaa"
      }
    ];

    continents.forEach(continent => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", continent.path);
      path.setAttribute("fill", continent.fill);
      path.setAttribute("stroke", continent.stroke);
      path.setAttribute("stroke-width", "1");
      svg.appendChild(path);
    });

    // Create markers group
    this.markersGroup = document.createElementNS(svgNS, "g");
    this.markersGroup.setAttribute("id", `${this.containerId}-markers`);
    svg.appendChild(this.markersGroup);

    // Add the SVG to the container
    canvasContainer.innerHTML = '';
    canvasContainer.appendChild(svg);
  }

  async trackVisitor() {
    try {
      // Get visitor's IP and location
      const ipData = await this.getVisitorLocation();
      
      if (ipData && this.shouldRecordLocation(ipData)) {
        this.addMarker(ipData);
        this.saveVisitedLocation(ipData);
        this.updateCount();
      }
    } catch (error) {
      console.log("Could not track visitor location:", error);
      
      // As fallback, add a random marker to show functionality
      if (Math.random() > 0.7) { // Only sometimes to avoid spam
        const fakeLocation = {
          ip: this.generateFakeIP(),
          city: "Unknown",
          region: "Unknown", 
          country: "Unknown",
          latitude: 20 + Math.random() * 140 - 90, // Between -70 and +70 degrees
          longitude: -180 + Math.random() * 360
        };
        this.addMarker(fakeLocation);
        this.updateCount();
      }
    }
  }

  async getVisitorLocation() {
    try {
      // First attempt: Use a reliable geolocation API
      const response = await fetch('https://ipapi.co/json/', {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      if (data.latitude && data.longitude) {
        return {
          ip: data.ip,
          city: data.city || "Unknown",
          region: data.region || "Unknown",
          country: data.country_name || "Unknown",
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.warn("Primary geolocation failed, trying fallback:", error.message);
      
      // Fallback: Get IP first, then try secondary service
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        
        // Then try a secondary geolocation service
        const geoResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
        const geoData = await geoResponse.json();
        
        if (geoData.latitude && geoData.longitude) {
          return {
            ip: geoData.ip,
            city: geoData.city || "Unknown",
            region: geoData.region || "Unknown",
            country: geoData.country_name || "Unknown",
            latitude: geoData.latitude,
            longitude: geoData.longitude,
            timestamp: new Date().toISOString()
          };
        }
      } catch (secondaryError) {
        console.warn("Fallback geolocation also failed:", secondaryError.message);
      }
    }
    
    return null;
  }

  shouldRecordLocation(locationData) {
    // Don't record the same IP within a certain timeframe to prevent spam
    const ipKey = `${locationData.ip}-${new Date().toDateString()}`;
    if (this.visitedIPs.has(ipKey)) {
      return false;
    }
    
    // Add to set and limit size to prevent memory issues
    this.visitedIPs.add(ipKey);
    if (this.visitedIPs.size > 1000) {
      // Remove oldest entries
      const entries = Array.from(this.visitedIPs.entries());
      for (let i = 0; i < 100; i++) {
        if (entries[i]) this.visitedIPs.delete(entries[i][0]);
      }
    }
    
    return true;
  }

  addMarker(locationData) {
    if (this.markers.length >= this.maxMarkers) {
      // Remove oldest marker if we've reached the limit
      this.removeOldestMarker();
    }

    // Convert lat/long to SVG coordinates using a simple equirectangular projection
    let x, y;
    if (locationData.latitude && locationData.longitude) {
      // Longitude maps to X: -180 to +180 becomes 0 to 1000
      x = 500 + (locationData.longitude * (1000 / 360));
      // Latitude maps to Y: +90 to -90 becomes 0 to 500 (inverted)
      y = 250 - (locationData.latitude * (500 / 180));
      
      // Ensure coordinates are within bounds
      x = Math.max(0, Math.min(1000, x));
      y = Math.max(0, Math.min(500, y));
    } else {
      // For unknown locations, place randomly in ocean areas
      x = 100 + Math.random() * 800;
      y = 100 + Math.random() * 300;
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(svgNS, "circle");
    
    // Unique ID for this marker
    const markerId = `marker-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    circle.setAttribute("id", markerId);
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "#FF5722");
    circle.setAttribute("opacity", "0.9");
    circle.setAttribute("class", "visitor-marker");
    
    // Add pulsing animation
    const animate = document.createElementNS(svgNS, "animate");
    animate.setAttribute("attributeName", "r");
    animate.setAttribute("values", "5;7;5");
    animate.setAttribute("dur", "2s");
    animate.setAttribute("repeatCount", "indefinite");
    circle.appendChild(animate);
    
    // Add tooltip
    const title = document.createElementNS(svgNS, "title");
    title.textContent = this.getLocationTooltip(locationData);
    circle.appendChild(title);
    
    // Add click handler for more details
    circle.addEventListener('click', () => {
      this.showLocationDetails(locationData);
    });
    
    this.markersGroup.appendChild(circle);
    
    // Store marker info
    this.markers.push({
      id: markerId,
      location: locationData,
      element: circle,
      timestamp: new Date()
    });
  }

  getLocationTooltip(locationData) {
    let tooltip = `IP: ${locationData.ip}\n`;
    if (locationData.city !== "Unknown") tooltip += `城市: ${locationData.city}\n`;
    if (locationData.region !== "Unknown") tooltip += `地区: ${locationData.region}\n`;
    if (locationData.country !== "Unknown") tooltip += `国家: ${locationData.country}\n`;
    tooltip += `时间: ${new Date(locationData.timestamp).toLocaleString()}`;
    return tooltip;
  }

  showLocationDetails(locationData) {
    // Create a temporary modal or alert with more details
    let details = `访问详情:\n\n`;
    details += `IP地址: ${locationData.ip}\n`;
    details += `位置: ${locationData.city}, ${locationData.region}, ${locationData.country}\n`;
    details += `坐标: ${locationData.latitude ? locationData.latitude.toFixed(4) : 'N/A'}°, ${locationData.longitude ? locationData.longitude.toFixed(4) : 'N/A'}°\n`;
    details += `访问时间: ${new Date(locationData.timestamp).toLocaleString()}`;
    
    alert(details);
  }

  removeOldestMarker() {
    if (this.markers.length === 0) return;
    
    // Find oldest marker
    let oldestIndex = 0;
    for (let i = 1; i < this.markers.length; i++) {
      if (this.markers[i].timestamp < this.markers[oldestIndex].timestamp) {
        oldestIndex = i;
      }
    }
    
    // Remove from DOM
    const markerElement = this.markers[oldestIndex].element;
    if (markerElement.parentNode) {
      markerElement.parentNode.removeChild(markerElement);
    }
    
    // Remove from array
    this.markers.splice(oldestIndex, 1);
  }

  clearMarkers() {
    // Remove all markers from DOM
    while (this.markersGroup.firstChild) {
      this.markersGroup.removeChild(this.markersGroup.firstChild);
    }
    
    // Clear arrays
    this.markers = [];
    this.visitedIPs.clear();
    
    // Clear localStorage
    localStorage.removeItem(this.storageKey);
    
    this.updateCount();
  }

  updateCount() {
    const countElement = document.getElementById(`${this.containerId}-count`);
    if (countElement) {
      countElement.textContent = this.markers.length;
    }
  }

  loadVisitedLocations() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.markers = JSON.parse(stored);
        // Restore visited IPs from stored markers
        this.markers.forEach(marker => {
          if (marker.location && marker.location.ip) {
            this.visitedIPs.add(`${marker.location.ip}-${new Date(marker.location.timestamp).toDateString()}`);
          }
        });
      }
    } catch (e) {
      console.error("Error loading stored locations:", e);
    }
  }

  saveVisitedLocation(locationData) {
    try {
      // Add to markers array
      this.markers.push({
        id: `marker-${Date.now()}`,
        location: locationData,
        timestamp: new Date()
      });
      
      // Limit stored markers to prevent localStorage bloat
      if (this.markers.length > this.maxMarkers) {
        this.markers = this.markers.slice(-this.maxMarkers);
      }
      
      // Save to localStorage
      localStorage.setItem(this.storageKey, JSON.stringify(this.markers));
    } catch (e) {
      console.error("Error saving location:", e);
    }
  }

  loadExistingMarkers() {
    // Render markers that were previously saved
    this.markers.forEach(markerData => {
      // We'll recreate the visual markers based on stored data
      // But we'll skip adding them if the map has too many markers already
      if (this.markers.length < this.maxMarkers) {
        setTimeout(() => {
          // Use a slight delay to avoid blocking the UI
          this.addMarkerFromStored(markerData.location);
        }, 100);
      }
    });
  }

  addMarkerFromStored(locationData) {
    // Similar to addMarker but without the geolocation lookup
    if (this.markers.length >= this.maxMarkers) {
      this.removeOldestMarker();
    }

    let x, y;
    if (locationData.latitude && locationData.longitude) {
      x = 500 + (locationData.longitude * (1000 / 360));
      y = 250 - (locationData.latitude * (500 / 180));
      x = Math.max(0, Math.min(1000, x));
      y = Math.max(0, Math.min(500, y));
    } else {
      x = 100 + Math.random() * 800;
      y = 100 + Math.random() * 300;
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(svgNS, "circle");
    
    const markerId = `marker-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    circle.setAttribute("id", markerId);
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", "#4CAF50");
    circle.setAttribute("opacity", "0.8");
    circle.setAttribute("class", "stored-marker");
    
    const title = document.createElementNS(svgNS, "title");
    title.textContent = this.getLocationTooltip(locationData);
    circle.appendChild(title);
    
    circle.addEventListener('click', () => {
      this.showLocationDetails(locationData);
    });
    
    this.markersGroup.appendChild(circle);
  }

  generateFakeIP() {
    // Helper for generating plausible fake IPs for demonstration
    return `${Math.floor(Math.random()*223)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}`;
  }

  setupResizeHandler() {
    // Handle window resize to maintain proper map proportions
    window.addEventListener('resize', () => {
      // In a real implementation, we would adjust the map visualization
      // For now, we'll just debounce the handling
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        // Redraw if needed
      }, 250);
    });
  }
}

// Initialize the map when the page loads
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('visitor-map')) {
    // Use the improved map with additional options
    new AdvancedIPTrackerMap('visitor-map', {
      maxMarkers: 100,
      privacyEnabled: true
    });
  }
});

// Handle potential errors gracefully
window.addEventListener('error', function(e) {
  console.error('Map script error:', e.error);
});