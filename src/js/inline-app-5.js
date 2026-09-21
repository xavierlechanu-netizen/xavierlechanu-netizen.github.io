import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

function updateHoloVehicle(type) {
        const icon = document.getElementById("holo-vehicle-icon");
        if (!icon) return;

        // Add glitch effect
        icon.style.opacity = "0";
        icon.style.transform = "scale(0.8)";

        setTimeout(() => {
          let html = "";
          if (type === "vsp") {
            html = '<i class="fa-solid fa-car-side"></i>';
            icon.style.color = "#ff0055";
            icon.style.filter = "drop-shadow(0 0 15px #ff0055)";
          } else if (type === "moto") {
            html = '<i class="fa-solid fa-motorcycle"></i>';
            icon.style.color = "#b700ff";
            icon.style.filter = "drop-shadow(0 0 15px #b700ff)";
          } else {
            html = '<i class="fa-solid fa-motorcycle"></i>';
            icon.style.color = "#00d2ff";
            icon.style.filter = "drop-shadow(0 0 15px #00d2ff)";
          }
          // eslint-disable-next-line no-restricted-syntax
icon.innerHTML = html;
          icon.style.opacity = "1";
          icon.style.transform = "scale(1)";
        }, 200);
      }
// --- Action Registry (ESM) ---
registerAction('updateHoloVehicle', updateHoloVehicle);
