import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

function loadGoogleMaps() {
        if (typeof CONFIG === 'undefined' || !CONFIG.MAPS) return;
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.MAPS.PC}&callback=initMap&v=beta&libraries=places,geometry`;
        script.async = true;
        document.head.appendChild(script);
      }
      document.addEventListener('DOMContentLoaded', loadGoogleMaps);
// --- Action Registry (ESM) ---
registerAction('loadGoogleMaps', loadGoogleMaps);
