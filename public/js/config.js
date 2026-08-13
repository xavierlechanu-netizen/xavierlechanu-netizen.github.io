/**
 * CONFIGURATION GLOBALE - mon50ccetmoi
 * Centralisation des clés et configurations sensibles.
 */
const CONFIG = {
  // Google Maps API Keys
  MAPS: {
    PC: atob("QUl6YVN5Q05fZmV2VGlHOEF2V1B1RFMyS2NfV3B3bFlmRHk0azRN"),
    ANDROID: atob("QUl6YVN5Q05fZmV2VGlHOEF2V1B1RFMyS2NfV3B3bFlmRHk0azRN"),
    MAP_ID: "", // Laisser vide si non configuré sur Google Cloud
  },

  // Auth Configuration
  AUTH: {
    GOOGLE_CLIENT_ID:
      "618915667828-ebv4uc1ehq7mhks9l1qajrtg7k833jab.apps.googleusercontent.com",
  },

  // App Versioning
  VERSION: "50.1.8-GOLD",

  // Firebase Cloud Database (Firestore)
  FIREBASE: {
    apiKey: "AIzaSyBufZ5hmzEoDoOZ9YofpHvL3HJDbuEOc7I",
    authDomain: "mon50ccetmoi.firebaseapp.com",
    projectId: "mon50ccetmoi",
    storageBucket: "mon50ccetmoi.firebasestorage.app",
    messagingSenderId: "618915667828",
    appId: "1:618915667828:web:8508e0362e4edd0a0dd621",
    measurementId: "G-S482ZE7TKG"
  },

  // ─────────────────────────────────────────────────────
  // REVOLUT BUSINESS — Paiements Merchant
  // Clé publique Merchant (pk_...) — sans danger côté client
  // La clé secrète (sk_...) ne va JAMAIS ici — Firebase Functions uniquement
  // ─────────────────────────────────────────────────────
  REVOLUT: {
    PUBLIC_KEY: "pk_kkwSOEhfQdseB6OVcsYEIpdAwxNxY0JvSUtgtQlLuNlFpNED", // Clé Merchant publique
    PAYMENT_LINK: "", // Laisser vide — on utilise le SDK embarqué
    MERCHANT_ID: "", // Rempli automatiquement par l'API
    CURRENCY: "EUR",
    AMOUNT_CENTS: 4999, // 49,99 €
    SUCCESS_REDIRECT: "https://mon50ccetmoi.com/?payment=success",
    FAIL_REDIRECT: "https://mon50ccetmoi.com/?payment=failed",
  },

  // ─────────────────────────────────────────────────────
  // PORTAIL ASSURANCE — Paramètres IA litige
  // ─────────────────────────────────────────────────────
  INSURANCE: {
    FIRESTORE_COLLECTION: "litigation_proposals", // Collection Firestore des propositions
    REPORT_PRICE_EUR: 49.99,
    // Seuils IA pour la sélection automatique du type de rapport
    AI_THRESHOLDS: {
      IMPACT_G: 3.5, // Au-dessus ←’ Rapport Impact
      EXPERT_G: 5.0, // Au-dessus ←’ Rapport Expertise Complète
      HIGH_SPEED_KMH: 60, // Vitesse considérée élevée pour le contexte 50cc
      LEAN_ANGLE_DEG: 35, // Angle d'inclinaison critique
    },
  },
};

// --- FALLBACK SÉCURISÉ GLOBAL ---
// Utilisé pour assurer que les fonctions existent avant le chargement des autres scripts
if (typeof window.secureSetItem === "undefined") {
  window.secureSetItem = function (key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("secureSetItem fallback error:", e);
    }
  };
}
if (typeof window.secureGetItem === "undefined") {
  window.secureGetItem = function (key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  };
}
var secureSetItem = window.secureSetItem;
var secureGetItem = window.secureGetItem;

// --- COOKIE CONSENT BANNER ---
document.addEventListener("DOMContentLoaded", function () {
  if (localStorage.getItem("cookie_consent_accepted") !== "true") {
    let banner = document.createElement("div");
    banner.id = "cookie-consent-banner";
    banner.style.cssText = "position:fixed; bottom:0; left:0; width:100%; background:#1a1a1a; color:white; padding:15px 20px; z-index:9999999; display:flex; justify-content:space-between; align-items:center; border-top:2px solid #ffb703; flex-wrap:wrap; box-sizing:border-box; font-family:'Inter', sans-serif;";
    banner.innerHTML = `
      <div style="flex: 1 1 300px; margin-right: 15px; font-size: 0.9rem; margin-bottom: 10px;">
        Nous utilisons des cookies strictement nécessaires pour assurer le bon fonctionnement de l'application (authentification, préférences locales). 
        En continuant votre navigation, vous acceptez l'utilisation de ces traceurs fonctionnels. 
        <a href="cookies.html" style="color:#ffb703; text-decoration:underline; font-weight:bold;">En savoir plus</a>
      </div>
      <button id="btn-accept-cookies" style="background:#ffb703; color:black; border:none; padding:10px 20px; border-radius:30px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:transform 0.2s;">
        J'ai compris
      </button>
    `;
    document.body.appendChild(banner);

    document.getElementById("btn-accept-cookies").addEventListener("click", function () {
      localStorage.setItem("cookie_consent_accepted", "true");
      banner.style.display = "none";
    });
  }
});
