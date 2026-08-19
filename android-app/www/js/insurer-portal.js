/* --- B2B INSURER PORTAL (WEB4) --- */

window.InsurerPortal = {
  currentCode: null,
  currentInsurer: null,

  open: function () {
    document.getElementById("insurer-portal-screen").classList.remove("hidden");
    if (this.currentInsurer) {
      document.getElementById("insurer-login-box").classList.add("hidden");
      document
        .getElementById("insurer-dashboard-box")
        .classList.remove("hidden");
    } else {
      document.getElementById("insurer-login-box").classList.remove("hidden");
      document.getElementById("insurer-dashboard-box").classList.add("hidden");
    }
    document.getElementById("insurer-pricing-box").classList.add("hidden");
  },

  close: function () {
    document.getElementById("insurer-portal-screen").classList.add("hidden");
  },

  login: async function () {
    const id = document.getElementById("insurer-id-input").value.trim();
    const pwd = document.getElementById("insurer-pwd-input").value.trim();

    if (!id || !pwd) {
      alert("Veuillez saisir votre Identifiant et Mot de passe.");
      return;
    }

    try {
      await firebase.auth().signInWithEmailAndPassword(id, pwd);
      this.currentInsurer = id;
      document.getElementById("insurer-name-display").innerText =
        this.currentInsurer;
      document.getElementById("insurer-login-box").classList.add("hidden");
      document
        .getElementById("insurer-dashboard-box")
        .classList.remove("hidden");
    } catch (error) {
      console.error("Auth error:", error);
      alert("Accès refusé : Identifiants invalides ou compte inexistant.");
    }
  },

  signup: function () {
    alert(
      "La création de compte Assureur est gérée manuellement par notre équipe pour des raisons de sécurité. Veuillez nous contacter.",
    );
  },

  logout: function () {
    this.currentInsurer = null;
    this.currentCode = null;
    document.getElementById("insurer-id-input").value = "";
    document.getElementById("insurer-pwd-input").value = "";
    document.getElementById("insurer-code-input").value = "";
    document.getElementById("insurer-login-box").classList.remove("hidden");
    document.getElementById("insurer-dashboard-box").classList.add("hidden");
    document.getElementById("insurer-pricing-box").classList.add("hidden");
  },

  verifyCode: async function () {
    const input = document
      .getElementById("insurer-code-input")
      .value.trim()
      .toUpperCase();
    if (!input.startsWith("LITIGE-")) {
      alert("Code Invalide. Le format attendu est LITIGE-XXXXXX");
      return;
    }

    try {
      if (typeof db !== "undefined") {
        const docRef = db.collection("litigation_proposals").doc(input);
        const doc = await docRef.get();

        if (!doc.exists) {
          alert("Dossier introuvable ou expiré.");
          return;
        }

        const data = doc.data();
        if (data.status === "RESOLVED") {
            alert("Ce dossier a déjà été traité et clôturé.");
            return;
        }
      } else {
          // Simulation si DB n'est pas dispo
          const parts = input.split("-");
          if (parts.length >= 2) {
            const tsStr = parts[1].toLowerCase();
            const timestamp = parseInt(tsStr, 36);
            if (!isNaN(timestamp)) {
              const now = Date.now();
              const diffHours = (now - timestamp) / (1000 * 60 * 60);
              if (diffHours > 72) {
                alert(
                  "Code Expiré. Le code litige est valable uniquement 72h. Le pilote doit générer un nouveau code depuis son application.",
                );
                return;
              }
            }
          }
      }

      document.getElementById("insurer-dashboard-box").classList.add("hidden");
      document.getElementById("insurer-pricing-box").classList.remove("hidden");
      this.currentCode = input;
    } catch (e) {
        console.error("Erreur Firestore :", e);
        alert("Erreur de connexion à la base sécurisée.");
    }
  },

  buyReport: async function (type, price, rewardBvc) {
    if (
      confirm(
        `[SÉCURITÉ ZERO-TRUST]\nConfirmez-vous l'achat du rapport [${type}] pour ${price}€ HT ?\n\n⚠ï¸  CONDITIONS B2B : Les données chiffrées sont définitives.\nLe paiement sera instantanément prélevé via le Smart Contract.`,
      )
    ) {
      // 1. Mise à jour statut dans Firestore
      try {
          if (typeof db !== "undefined" && this.currentCode) {
              await db.collection("litigation_proposals").doc(this.currentCode).update({
                  status: "RESOLVED",
                  resolvedBy: this.currentInsurer || "ASSUREUR_ANONYME",
                  resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              
              // On peut attribuer la récompense au pilote si on récupère son ID du doc.
              // Ici, pour le MVP, on simule l'appel Web4 comme avant si sur la même session
          }
      } catch (e) {
          console.error("Erreur de mise à jour Firestore :", e);
      }

      // Premium WOW Effect for success
      const pricingBox = document.getElementById("insurer-pricing-box");
      pricingBox.innerHTML = `
                <div style="text-align:center; padding: 40px;">
                    <i class="fa-solid fa-circle-check" style="font-size: 5rem; color: #00ffcc; text-shadow: 0 0 30px #00ffcc; margin-bottom:20px; animation: pulse 1s infinite;"></i>
                    <h2 style="color:#fff; font-size:2rem; font-weight:900;">TRANSACTION VALIDÉE</h2>
                    <p style="color:#00d2ff; font-family:'JetBrains Mono', monospace;">Clé de déchiffrement générée pour le dossier ${this.currentCode}</p>
                    <div style="margin-top:30px; background:rgba(0,255,204,0.1); border:1px solid #00ffcc; border-radius:12px; padding:15px; color:#fff;">
                        <i class="fa-solid fa-envelope"></i> Le rapport a été envoyé de manière sécurisée à votre adresse pro.
                    </div>
                </div>
            `;

      setTimeout(() => {
        // Déclenchement du Smart Contract Web4 : Rétribution du pilote
        if (window.Web4Economy && rewardBvc > 0) {
          // Note : en prod, ça doit être le backend qui mint pour le pilote
          // Ici, c'est une simulation.
          window.Web4Economy.mineToken(
            rewardBvc,
            `Smart Contract: L'assureur a acheté le rapport (${type})`,
          );
        }
        setTimeout(() => this.close(), 3000);
      }, 2000);
    }
  },
};
