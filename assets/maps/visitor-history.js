// The provider's t=tt option changes the counter, but its dots cover only a month.
// Replace those base dots with the full history collected during the site build.
(function () {
  'use strict';

  const widget = document.querySelector('[data-visitor-history]');
  if (!widget) return;

  function waitForMap() {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 30000;
      function check() {
        const jq = window.vmap_jq;
        const container = widget.querySelector('.jvectormap-container');
        const map = jq && container && jq(container).data('mapObject');
        if (map) {
          resolve(map);
        } else if (Date.now() >= deadline) {
          reject(new Error('Visitor map did not load'));
        } else {
          setTimeout(check, 100);
        }
      }
      check();
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const history = fetch(widget.dataset.visitorHistory, {
    cache: 'no-cache',
    signal: controller.signal
  }).then(response => {
    if (!response.ok) throw new Error('Visitor history could not be loaded');
    return response.json();
  }).finally(() => clearTimeout(timeout));

  Promise.all([history, waitForMap()]).then(([data, map]) => {
    const locations = data.locations.filter(location =>
      Number.isFinite(location.lat) && Number.isFinite(location.lng) &&
      Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180 &&
      Number.isInteger(location.pageviews) && location.pageviews > 0 &&
      typeof location.name === 'string' &&
      !/unknown location/i.test(location.name)
    );
    if (!locations.length) throw new Error('Visitor history contains no locations');

    const markers = {};
    const counts = {};
    const positions = new Set();
    locations.forEach((location, index) => {
      const id = 'history-' + index;
      const visits = location.pageviews.toLocaleString('en-US');
      markers[id] = {
        latLng: [location.lat, location.lng],
        name: visits + (location.pageviews === 1 ? ' visit from ' : ' visits from ') + location.name
      };
      counts[id] = location.pageviews;
      positions.add(location.lat + ',' + location.lng);
    });

    // Retain locations first seen after the daily snapshot, without counting
    // the provider's rolling totals twice for places already in the history.
    const baseMarkers = Object.keys(map.markers).filter(id => !map.markers[id].config.style);
    const series = map.series.markers[0];
    baseMarkers.forEach(id => {
      const marker = map.markers[id].config;
      if (!positions.has(marker.latLng.join(',')) && !/unknown location/i.test(marker.name)) {
        markers['recent-' + id] = marker;
        counts['recent-' + id] = series.values[id] || 1;
      }
    });

    // The provider adds orange real-time markers separately; keep those intact.
    series.clear();
    map.removeMarkers(baseMarkers);
    delete series.params.min;
    delete series.params.max;
    map.addMarkers(markers, [counts]);
    series.setScale([2.4, 5.2]);

    const date = widget.querySelector('[data-visitor-since]') || widget.querySelector('.mapmyvisitors-date');
    const since = new Date(data.since + 'T00:00:00Z');
    if (date && !Number.isNaN(since.getTime())) {
      date.textContent = 'Since ' + since.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
      });
      date.style.display = '';
    }

    const total = widget.querySelector('[data-visitor-total]');
    const counter = widget.querySelector('.mapmyvisitors-visitors');
    if (total) {
      total.textContent = data.totalPageviews.toLocaleString('en-US');
      const syncCounter = () => {
        const match = counter && counter.textContent.match(/([\d,]+)/);
        if (match) {
          const current = Number(total.textContent.replace(/,/g, '')) || data.totalPageviews;
          total.textContent = Math.max(current, Number(match[1].replace(/,/g, ''))).toLocaleString('en-US');
        }
      };
      syncCounter();
      if (counter) {
        new MutationObserver(syncCounter).observe(counter, { childList: true, subtree: true, characterData: true });
      }
    }

    // The provider fixes its SVG size at startup. Refit it when the card resizes
    // so dots remain aligned with the map on phones and after rotation.
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        map.updateSize();
        window.dispatchEvent(new Event('resize'));
      }).observe(widget);
    }
    map.updateSize();
    window.dispatchEvent(new Event('resize'));
    widget.dataset.historyLoaded = 'true';
  }).catch(error => {
    // Keep the original working widget if the provider or history is unavailable.
    console.warn('All-time visitor map:', error);
  });
}());
