import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

// Clock Update
      function updateTime() {
        const now = new Date();
        document.getElementById("watch-time").innerText =
          now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      setInterval(updateTime, 1000);
      updateTime();

      // Sync with Phone via BroadcastChannel
      const watchChannel = new BroadcastChannel("mon50cc_watch_sync");

      watchChannel.onmessage = function(event) {
        if (event.data.type === "TELEMETRY_UPDATE") {
          const payload = event.data.payload;
          
          if (payload.speed !== undefined) {
            const speed = Math.floor(payload.speed);
            document.getElementById("watch-speed").innerText = speed;
            const speedEl = document.getElementById("watch-speed");
            if (speed >= 50) {
              speedEl.style.color = "#ff0055";
              speedEl.style.textShadow = "0 0 15px #ff0055";
            } else {
              speedEl.style.color = "#00f2ff";
              speedEl.style.textShadow = "0 0 10px #00f2ff";
            }
          }

          if (payload.bpm !== undefined) {
            document.getElementById("watch-bpm").innerText = payload.bpm;
          }

          if (payload.crewCount !== undefined) {
            document.getElementById("watch-crew").innerText = payload.crewCount;
          }
        }
      };

      function triggerWatchSOS() {
        // Trigger haptic feedback if supported by the watch
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200, 100, 500]);
        }
        
        // Notify phone
        watchChannel.postMessage({
          type: "SOS_TRIGGERED",
          payload: { source: "watch", timestamp: Date.now() }
        });
        
        alert("ALERTE SOS ENVOYÉE DEPUIS LA MONTRE !");
      }