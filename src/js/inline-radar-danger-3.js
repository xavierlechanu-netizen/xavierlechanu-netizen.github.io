import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

function loadGoogleMaps() {
        const injectGoogleMaps = () => {
          if (typeof CONFIG === 'undefined' || !CONFIG.MAPS) return;
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.MAPS.PC}&callback=initMap&v=beta&libraries=places,geometry`;
          script.async = true;
          document.head.appendChild(script);
        };
        
        window._axcb = window._axcb || [];
        window._axcb.push(function(axeptio) {
          axeptio.on("cookies:complete", function(choices) {
            if (choices.google_maps || choices.$$all) {
              injectGoogleMaps();
            } else {
              console.warn("Radar : Consentement Google Maps refusé.");
            }
          });
        });
      }
      document.addEventListener('DOMContentLoaded', loadGoogleMaps);
// --- Action Registry (ESM) ---
registerAction('loadGoogleMaps', loadGoogleMaps);
