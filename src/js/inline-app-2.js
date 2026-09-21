import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

window.triggerHUDGlitch = function () {
        const hud = document.getElementById("obd-hud-screen");
        if (hud && !hud.classList.contains("hidden")) {
          hud.classList.add("hud-glitch-danger");
          setTimeout(() => {
            hud.classList.remove("hud-glitch-danger");
          }, 1500);
        }
      };
      // Overwrite triggerFallAlert to also trigger glitch
      setTimeout(() => {
        if (window.triggerFallAlert) {
          const originalFall = window.triggerFallAlert;
          window.triggerFallAlert = function (isManual) {
            window.triggerHUDGlitch();
            originalFall(isManual);
          };
        }
      }, 2000);