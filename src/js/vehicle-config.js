import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

﻿window.setCrewMode = function (mode) {
  window.session = window.session || {};

  // Interdiction formelle du passager sur trottinette électrique (Art. R412-43-1)
  if (window.session.motor === "trottinette" && mode === "duo") {
    alert("Interdiction légale (Art. R412-43-1 du Code de la Route) : Le transport d'un passager sur une trottinette électrique est interdit sous peine d'une amende de 135 €.");
    mode = "solo";
  }

  window.session.crewMode = mode;

  const btnSolo = document.getElementById("btn-solo");
  const btnDuo = document.getElementById("btn-duo");
  if (btnSolo) btnSolo.style.borderColor = mode === "solo" ? "#00d2ff" : "#444";
  if (btnDuo) btnDuo.style.borderColor = mode === "duo" ? "#00d2ff" : "#444";
};

window.saveVehicleProfile = function () {
  const motor = document.getElementById("scooter-motor");
  window.session = window.session || {};
  window.session.motor = motor ? motor.value : "2t";
  if (!window.session.crewMode || window.session.motor === "trottinette") {
    window.session.crewMode = "solo";
  }

  secureSetItem("session", window.session);

  const screen = document.getElementById("vehicle-config-screen");
  if (screen) screen.classList.add("hidden");
  if (window.ScreenManager) window.ScreenManager.close();

  if (typeof speak === "function") {
    if (window.session.motor === "trottinette") {
      speak("Profil Trottinette Électrique configuré. Vitesse légale 25 km/h. Pistes cyclables prioritaires.");
    } else if (window.session.motor === "velo") {
      speak("Profil Vélo et VAE configuré. Pistes cyclables prioritaires. Bonne route !");
    } else if (window.session.motor === "vsp") {
      speak("Profil Voiture Sans Permis configuré. Voies rapides interdites.");
    } else {
      speak("Profil véhicule sauvegardé. Prêt pour le départ.");
    }
  }
};

// Override the startPremiumNavigation to include the warning and ETA adjustment
if (typeof window.startPremiumNavigation === "function") {
  const originalNav = window.startPremiumNavigation;
  window.startPremiumNavigation = function (leg) {
    // Appeler la nav originale
    originalNav(leg);

    // Ajuster l'ETA selon le type de véhicule (Duo, VSP, Trottinette, Vélo)
    if (window.session) {
      const isDuo = window.session.crewMode === "duo";
      const isVSP = window.session.motor === "vsp";
      const isTrottinette = window.session.motor === "trottinette";
      const isVelo = window.session.motor === "velo";

      if (isDuo || isVSP || isTrottinette || isVelo) {
        const etaEl = document.getElementById("nav-eta");
        const arrEl = document.getElementById("nav-arrival-time");

        if (etaEl) {
          const durVal = leg?.duration?.value || leg?.durationSec || 600;
          const originalMins = Math.ceil(durVal / 60);
          let multiplier = 1.0;

          if (isDuo && !isVSP) multiplier = 1.15; // Scooter Duo = +15%
          if (isVSP) multiplier = 1.25; // Voiturette = +25% (impossible de remonter les files)
          if (isTrottinette || isVelo) multiplier = 1.35; // Mobilité douce (vitesse moy 18-20 km/h)

          const newMins = Math.ceil(originalMins * multiplier);
          etaEl.textContent = newMins + " min";

          if (arrEl) {
            const now = new Date();
            now.setMinutes(now.getMinutes() + newMins);
            const hours = now.getHours().toString().padStart(2, "0");
            const mins = now.getMinutes().toString().padStart(2, "0");
            arrEl.textContent = hours + ":" + mins;
          }

          // Alertes sonores adaptées à la catégorie
          if (typeof speak === "function") {
            if (isTrottinette) {
              setTimeout(
                () =>
                  speak(
                    "Mode Trottinette Électrique. Empruntez les pistes cyclables. Vitesse maximale 25 km/h.",
                  ),
                3500,
              );
            } else if (isVelo) {
              setTimeout(
                () =>
                  speak(
                    "Mode Vélo activé. Privilégiez les aménagements cyclables.",
                  ),
                3500,
              );
            } else if (isVSP) {
              setTimeout(
                () =>
                  speak(
                    "Mode Voiturette détecté. Temps de trajet ajusté car vous ne pouvez pas remonter les files de trafic.",
                  ),
                4000,
              );
            } else if (isDuo) {
              setTimeout(
                () =>
                  speak(
                    "Mode Duo détecté. Le temps de trajet a été augmenté pour anticiper la perte de puissance en montée.",
                  ),
                4000,
              );
            }
          }

          // Mettre l'ETA en couleur d'accentuation
          etaEl.style.color = (isTrottinette || isVelo) ? "#00ffaa" : "#ffb703";
          etaEl.style.textShadow = (isTrottinette || isVelo) ? "0 0 10px #00ffaa" : "0 0 10px #ffb703";
        }
      }
    }
  };
}

registerAction('saveVehicleProfile', () => window.saveVehicleProfile());
registerAction('setCrewMode', (mode) => window.setCrewMode(mode));


