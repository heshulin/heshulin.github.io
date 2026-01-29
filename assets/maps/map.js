// IP Tracking World Map
class IPTrackerMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.visitedIPs = new Set();
    this.init();
  }

  init() {
    this.loadMap();
    this.trackVisitor();
  }

  async loadMap() {
    // Create the map container
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Add map styles
    const style = document.createElement('style');
    style.textContent = `
      #${this.containerId}-map {
        width: 100%;
        height: 300px;
        border: 1px solid #ddd;
        border-radius: 8px;
        margin-top: 20px;
      }
      
      .map-title {
        font-size: 1.2em;
        font-weight: bold;
        margin-bottom: 10px;
      }
      
      .visitor-count {
        margin-top: 10px;
        font-size: 0.9em;
        color: #666;
      }
    `;
    document.head.appendChild(style);

    // Create map HTML structure
    container.innerHTML = `
      <div class="map-title">访客分布图</div>
      <div id="${this.containerId}-map"></div>
      <div class="visitor-count">已记录访客位置: <span id="${this.containerId}-count">0</span></div>
    `;

    // Initialize a simple world map using SVG
    this.createSimpleMap();
  }

  createSimpleMap() {
    const mapContainer = document.getElementById(`${this.containerId}-map`);
    
    // Simple world map using SVG
    mapContainer.innerHTML = `
      <svg viewBox="0 0 1000 500" style="width:100%; height:100%;">
        <!-- Simplified world outline -->
        <path d="M150,150 Q200,100 300,120 Q400,80 500,120 Q600,100 700,130 Q800,120 850,180 L850,350 Q800,380 700,370 Q600,400 500,360 Q400,380 300,350 Q200,370 150,320 Z" 
              fill="#e6f3ff" stroke="#ccc" stroke-width="1"/>
        
        <!-- Continents simplified -->
        <path d="M200,180 Q250,160 300,170 Q350,150 400,170 Q450,160 500,180 Q550,170 600,190 Q650,180 700,200 L700,280 Q650,290 600,280 Q550,300 500,280 Q450,300 400,280 Q350,300 300,280 Q250,300 200,270 Z" 
              fill="#c8e6c9" stroke="#aaa" stroke-width="0.5"/>
        
        <!-- Markers will be added here -->
        <g id="${this.containerId}-markers"></g>
      </svg>
    `;
  }

  async trackVisitor() {
    try {
      // Get visitor's IP and location
      const ipData = await this.getVisitorLocation();
      
      if (ipData && !this.visitedIPs.has(ipData.ip)) {
        this.visitedIPs.add(ipData.ip);
        this.addMarker(ipData);
        this.updateCount();
      }
    } catch (error) {
      console.log("Could not track visitor location:", error);
    }
  }

  async getVisitorLocation() {
    try {
      // Using a public IP geolocation API
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      
      return {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country_name,
        latitude: data.latitude,
        longitude: data.longitude
      };
    } catch (error) {
      // Fallback to a less accurate service
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const ipData = await response.json();
        
        return {
          ip: ipData.ip,
          city: "Unknown",
          region: "Unknown", 
          country: "Unknown",
          latitude: 0,
          longitude: 0
        };
      } catch (err) {
        console.error("Failed to get location:", err);
        return null;
      }
    }
  }

  addMarker(locationData) {
    if (!locationData.latitude || !locationData.longitude) {
      // For demo purposes, generate random positions if we don't have real coordinates
      const markersContainer = document.getElementById(`${this.containerId}-markers`);
      const x = 200 + Math.random() * 600;
      const y = 150 + Math.random() * 200;
      
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.setAttribute("cx", x);
      marker.setAttribute("cy", y);
      marker.setAttribute("r", "4");
      marker.setAttribute("fill", "#ff5722");
      marker.setAttribute("opacity", "0.8");
      
      // Add tooltip
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `IP: ${locationData.ip}\nLocation: ${locationData.city || 'Unknown'}, ${locationData.country || 'Unknown'}`;
      marker.appendChild(title);
      
      markersContainer.appendChild(marker);
    } else {
      // Convert lat/long to SVG coordinates (simplified projection)
      const x = 500 + (locationData.longitude * 3); // Rough conversion
      const y = 250 - (locationData.latitude * 2); // Rough conversion
      
      const markersContainer = document.getElementById(`${this.containerId}-markers`);
      
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.setAttribute("cx", x);
      marker.setAttribute("cy", y);
      marker.setAttribute("r", "4");
      marker.setAttribute("fill", "#ff5722");
      marker.setAttribute("opacity", "0.8");
      
      // Add tooltip
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `IP: ${locationData.ip}\nLocation: ${locationData.city}, ${locationData.region}, ${locationData.country}`;
      marker.appendChild(title);
      
      markersContainer.appendChild(marker);
    }
  }

  updateCount() {
    const countElement = document.getElementById(`${this.containerId}-count`);
    if (countElement) {
      countElement.textContent = this.visitedIPs.size;
    }
  }
}

// Initialize the map when the page loads
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('visitor-map')) {
    new IPTrackerMap('visitor-map');
  }
});