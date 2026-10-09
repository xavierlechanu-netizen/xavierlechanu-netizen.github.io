import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

function checkProminentDisclosure() {
        const isAndroid = /Android/i.test(navigator.userAgent);
        const modal = document.getElementById("prominent-disclosure-modal");
        if (!modal) return;
        if (!isAndroid) {
          modal.style.display = "none";
          return;
        }
        if (localStorage.getItem("legal_consent_accepted") !== "true") {
          modal.style.display = "flex";
        }
      }
      function acceptProminentDisclosure() {
        localStorage.setItem("legal_consent_accepted", "true");
        document.getElementById("prominent-disclosure-modal").style.display =
          "none";
      }
      function declineProminentDisclosure() {
        alert(
          "L'application nécessite l'accès à votre position pour fonctionner correctement.",
        );
        document.getElementById("prominent-disclosure-modal").style.display =
          "none";
      }
      document.addEventListener("DOMContentLoaded", checkProminentDisclosure);
      if (
        document.readyState === "complete" ||
        document.readyState === "interactive"
      )
        checkProminentDisclosure();
// --- Action Registry (ESM) ---
registerAction('checkProminentDisclosure', checkProminentDisclosure);
registerAction('acceptProminentDisclosure', acceptProminentDisclosure);
registerAction('declineProminentDisclosure', declineProminentDisclosure);

if (typeof window !== 'undefined') {
  window.checkProminentDisclosure = checkProminentDisclosure;
  window.acceptProminentDisclosure = acceptProminentDisclosure;
  window.declineProminentDisclosure = declineProminentDisclosure;
}

