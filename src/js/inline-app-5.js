import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

function updateHoloVehicle(type) {
  const icon = document.getElementById("holo-vehicle-icon");
  const specTitle = document.getElementById("v-spec-title");
  const specBody = document.getElementById("v-spec-body");
  const duoWarning = document.getElementById("duo-warning-box");
  const btnDuo = document.getElementById("btn-duo");

  // Manage Duo restrictions for trottinette
  if (type === "trottinette") {
    if (duoWarning) duoWarning.style.display = "block";
    if (btnDuo) {
      btnDuo.style.opacity = "0.4";
      btnDuo.style.cursor = "not-allowed";
    }
    if (window.setCrewMode) window.setCrewMode("solo");
  } else {
    if (duoWarning) duoWarning.style.display = "none";
    if (btnDuo) {
      btnDuo.style.opacity = "1";
      btnDuo.style.cursor = "pointer";
    }
  }

  // Update Legal Specs Card
  if (specBody) {
    if (type === "trottinette") {
      if (specTitle) specTitle.textContent = "Réglementation EDPM (Trottinette Électrique)";
      specBody.innerHTML = `
        • Vitesse max autorisée : <strong>25 km/h</strong> (Art. R311-1 6.15 Code de la route)<br>
        • Pistes cyclables obligatoires en ville si présentes | <strong>Trottoir interdit</strong> (amende 135 €)<br>
        • Âge minimum : <strong>14 ans</strong> | <strong>Passager strictement interdit</strong> (amende 135 €)<br>
        • Équipement : Feux AV/AR, avertisseur sonore, gilet rétro-réfléchissant la nuit.
      `;
    } else if (type === "velo") {
      if (specTitle) specTitle.textContent = "Réglementation Vélo & VAE";
      specBody.innerHTML = `
        • Vitesse assistance VAE : <strong>25 km/h</strong> (moteur 250W max, Art. R311-1 6.11)<br>
        • Pistes &amp; bandes cyclables prioritaires | Trottoir interdit &gt; 8 ans<br>
        • Casque obligatoire &lt; 12 ans (recommandé pour tous) | Éclairage obligatoire la nuit<br>
        • Circulation sur autoroutes &amp; voies express : <strong>Interdite</strong> (Art. R421-2).
      `;
    } else if (type === "vsp") {
      if (specTitle) specTitle.textContent = "Réglementation Voiture Sans Permis (VSP)";
      specBody.innerHTML = `
        • Vitesse max constructeur : <strong>45 km/h</strong> (Permis AM / BSR dès 14 ans)<br>
        • Voies express &amp; autoroutes : <strong>Strictement interdites</strong> (Art. R421-2)<br>
        • Ceinture de sécurité obligatoire | Interdiction de remonter les files.
      `;
    } else {
      if (specTitle) specTitle.textContent = "Réglementation Cyclomoteur 50cc";
      specBody.innerHTML = `
        • Vitesse max constructeur : <strong>45 km/h</strong> (Art. R311-1)<br>
        • Voies express &amp; autoroutes : <strong>Strictement interdites</strong> (Art. R421-2)<br>
        • Équipement : Casque attaché &amp; gants homologués CE obligatoires (retrait 3 pts / amende).
      `;
    }
  }

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
    } else if (type === "trottinette") {
      html = '<i class="fa-solid fa-bolt-lightning"></i>';
      icon.style.color = "#00ffaa";
      icon.style.filter = "drop-shadow(0 0 15px #00ffaa)";
    } else if (type === "velo") {
      html = '<i class="fa-solid fa-bicycle"></i>';
      icon.style.color = "#00f0ff";
      icon.style.filter = "drop-shadow(0 0 15px #00f0ff)";
    } else {
      html = '<i class="fa-solid fa-motorcycle"></i>';
      icon.style.color = "#00d2ff";
      icon.style.filter = "drop-shadow(0 0 15px #00d2ff)";
    }
    icon.innerHTML = html;
    icon.style.opacity = "1";
    icon.style.transform = "scale(1)";
  }, 200);
}

window.updateHoloVehicle = updateHoloVehicle;

// --- Action Registry (ESM) ---
registerAction('updateHoloVehicle', updateHoloVehicle);

