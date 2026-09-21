import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

function checkProminentDisclosure() {
        if (localStorage.getItem("location_consent_accepted") !== "true") {
          document.getElementById("prominent-disclosure-modal").style.display =
            "flex";
        }
      }
      document.addEventListener("DOMContentLoaded", function () {
        checkProminentDisclosure();
        document
          .getElementById("btn-accept-disclosure")
          .addEventListener("click", function () {
            localStorage.setItem("location_consent_accepted", "true");
            document.getElementById(
              "prominent-disclosure-modal",
            ).style.display = "none";
          });
        document
          .getElementById("btn-refuse-disclosure")
          .addEventListener("click", function () {
            document.getElementById(
              "prominent-disclosure-modal",
            ).style.display = "none";
            alert(
              "L'application nécessite l'accès à votre position pour fonctionner correctement.",
            );
          });
      });
      if (
        document.readyState === "complete" ||
        document.readyState === "interactive"
      )
        checkProminentDisclosure();
// --- Action Registry (ESM) ---
registerAction('checkProminentDisclosure', checkProminentDisclosure);
