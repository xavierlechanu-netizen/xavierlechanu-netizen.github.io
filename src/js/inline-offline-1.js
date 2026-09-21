import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

let checkInterval;
      const pingText = document.getElementById("ping-text");
      const pingBadge = document.getElementById("ping-badge");

      // Check connection by pinging a tiny reliable file
      async function checkConnection() {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          // Ping favicon to avoid CORS and caching issues (adding timestamp)
          const res = await fetch(
            "/assets/icons/icon-192x192.png?ping=" + Date.now(),
            {
              method: "HEAD",
              signal: controller.signal,
            },
          );

          clearTimeout(timeoutId);

          if (res.ok) {
            clearInterval(checkInterval);
            pingText.textContent = "Signal rétabli ! Reconnexion...";
            pingBadge.style.color = "#00e676";
            pingBadge.style.borderColor = "#00e676";
            pingBadge.style.background = "rgba(0, 230, 118, 0.1)";
            document.querySelector(".radar").style.borderColor = "#00e676";

            // Small delay to let the user see the success state
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        } catch (error) {
          // Still offline
          console.log("Toujours hors ligne...");
        }
      }

      function manualRetry() {
        pingText.textContent = "Tentative manuelle...";
        checkConnection();
      }

      // Auto-check every 3 seconds
      checkInterval = setInterval(checkConnection, 3000);

      // Also listen to browser online event for instant reaction
      window.addEventListener("online", () => {
        pingText.textContent = "Réseau détecté ! Vérification...";
        checkConnection();
      });