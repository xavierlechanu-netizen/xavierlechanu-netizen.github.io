import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

document.addEventListener("DOMContentLoaded", () => {
        if (
          Intl.DateTimeFormat()
            .resolvedOptions()
            .timeZone.startsWith("America/")
        ) {
          const obdBtn = document.getElementById("dock-btn-obd");
          if (obdBtn) {
            obdBtn.style.display = "none";
            console.log(
              "[Nexus Atlas Security] OBD-II module hidden for US region.",
            );
          }
        }
      });