// js/assureur.js
// Logique B2B : Recherche de dossier, paiement Revolut, et Déchiffrement Zero-Knowledge.

let currentReportData = null;
let currentReportId = null;

// ==========================================
// 1. RECHERCHE DE DOSSIER (FIREBASE)
// ==========================================
async function searchReport() {
  const hardwareId = document.getElementById("search-hw-id").value.trim();
  const optionsDiv = document.getElementById("report-options-container");
  const btnPay = document.getElementById("btn-pay");
  const statusMsg = document.getElementById("status-msg");

  if (!hardwareId) {
    statusMsg.innerHTML = '<span class="error">Veuillez entrer un ID de boîte noire.</span>';
    return;
  }

  statusMsg.innerHTML = '<span class="info"><i class="fa-solid fa-spinner fa-spin"></i> Recherche sécurisée en cours...</span>';
  
  try {
    // Dans une version finale, on ferait un getDoc sur Firebase :
    // const docRef = db.collection('blackbox_telemetry').doc(hardwareId);
    // const docSnap = await docRef.get();
    
    // Pour la démo, on simule la réponse chiffrée
    setTimeout(() => {
      // Simulation d'une trame AES-GCM (IV + Ciphertext) stockée en Base64
      // Contenu original : {"speed": 62, "gForce": 12.4, "lean": 85, "timestamp": "2026-08-08T18:42:00Z", "lat": 48.8566, "lng": 2.3522}
      currentReportData = {
        iv: "bW9uNTBjY2V0bW9pMTIzNDU=", // IV fixe pour la démo
        ciphertext: "dHVfYXMfZMOpY2hpZmZyw6lfYXZlY19zdWjZXM=" // Faux ciphertext
      };
      currentReportId = hardwareId;

      optionsDiv.style.display = "flex";
      btnPay.style.display = "block";
      statusMsg.innerHTML = '<span class="success">Dossier crypté trouvé. Authentification requise pour l\'ouverture.</span>';
    }, 1500);

  } catch (err) {
    console.error(err);
    statusMsg.innerHTML = '<span class="error">Erreur de connexion au registre distribué.</span>';
  }
}

function selectReportOption(element) {
  document.querySelectorAll('.report-card').forEach(c => c.classList.remove('selected'));
  element.classList.add('selected');
}

// ==========================================
// 2. PAIEMENT REVOLUT B2B
// ==========================================
function payReport() {
  const btnPay = document.getElementById("btn-pay");
  btnPay.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Transaction B2B en cours...';
  btnPay.disabled = true;

  // Simulation d'un appel Revolut Pay Merchant API
  setTimeout(() => {
    btnPay.innerHTML = '<i class="fa-solid fa-check"></i> Accès Déverrouillé';
    btnPay.style.background = "#00ffcc";
    btnPay.style.color = "#000";
    
    // Afficher la modale de déchiffrement Zero-Knowledge
    document.getElementById("decryption-modal").style.display = "block";
    
  }, 2000);
}

// ==========================================
// 3. DÉCHIFFREMENT ZERO-KNOWLEDGE (WEB CRYPTO API)
// ==========================================
async function decryptTelemetry() {
  const keyInput = document.getElementById("master-key-input").value.trim();
  const expertDashboard = document.getElementById("expert-dashboard");
  const modal = document.getElementById("decryption-modal");
  const hashElement = document.getElementById("telemetry-hash");

  if (!keyInput) {
    alert("Vous devez fournir la Master Key de l'agence pour déchiffrer.");
    return;
  }

  // === SIMULATION WEB CRYPTO API ===
  // Dans un flux réel, nous utiliserions : 
  // crypto.subtle.importKey(...) puis crypto.subtle.decrypt({name: "AES-GCM", iv}, key, ciphertext)
  
  if (keyInput === "AXA-MASTER-KEY-2026") { // Clé de démo
    
    // Simulation de la donnée claire obtenue après déchiffrement
    const clearData = {
      speed: 62,
      gForce: 12.4,
      lean: 85,
      timestamp: new Date().toLocaleString("fr-FR"),
      lat: 48.856613,
      lng: 2.352222,
      hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    };

    // Mise à jour de l'UI
    document.getElementById("telemetry-id").textContent = currentReportId;
    document.getElementById("telemetry-speed").textContent = clearData.speed + " km/h";
    document.getElementById("telemetry-g").textContent = clearData.gForce + " G";
    document.getElementById("telemetry-lean").textContent = clearData.lean + " °";
    
    document.getElementById("telemetry-time").textContent = " " + clearData.timestamp;
    document.getElementById("telemetry-gps").textContent = ` ${clearData.lat}, ${clearData.lng}`;
    
    // Animation matrix du hash
    hashElement.textContent = "Déchiffrement en cours...";
    setTimeout(() => {
      hashElement.style.color = "#00ffcc";
      hashElement.textContent = clearData.hash;
    }, 800);

    // Affichage
    modal.style.display = "none";
    expertDashboard.style.display = "block";

  } else {
    alert("Clé AES invalide. La signature MAC a rejeté le déchiffrement (Anti-Tamper).");
  }
}
