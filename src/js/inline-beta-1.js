import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

// Check slots availability on load
      async function checkSpots() {
        try {
          const db = firebase.firestore();
          const snapshot = await db.collection("beta_testers").get();
          const count = snapshot.size;
          const totalSpots = 20;
          let remaining = totalSpots - count;

          if (remaining <= 0) remaining = 0;

          document.getElementById("spots-text").textContent =
            `${remaining} / ${totalSpots}`;
          const fillPercent = ((totalSpots - remaining) / totalSpots) * 100;
          document.getElementById("progress-fill").style.width =
            `${fillPercent}%`;

          if (remaining === 0) {
            document.getElementById("betaForm").innerHTML = `
                        <div style="background: rgba(255,0,85,0.1); border: 1px solid #ff0055; padding: 15px; border-radius: 10px; color: #ff0055;">
                            La Beta est malheureusement complète !
                        </div>`;
          }
        } catch (e) {
          console.error("Erreur lecture places:", e);
          document.getElementById("spots-text").textContent = "Places limitées";
        }
      }

      // Initialize and check spots
      if (typeof firebase !== "undefined") {
        checkSpots();
      }

      // Handle form submission
      document
        .getElementById("betaForm")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const btn = document.getElementById("submitBtn");
          const emailInput = document.getElementById("email");
          const email = emailInput.value.trim().toLowerCase();

          if (!email) return;

          btn.disabled = true;
          // eslint-disable-next-line no-restricted-syntax
btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';

          try {
            const db = firebase.firestore();

            // Add to firestore with timestamp
            await db.collection("beta_testers").add({
              email: email,
              registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
              userAgent: navigator.userAgent,
            });

            // Show success UI
            document.getElementById("betaForm").style.display = "none";
            document.getElementById("success-message").style.display = "block";
          } catch (error) {
            console.error("Erreur :", error);
            alert("Une erreur est survenue. Veuillez réessayer.");
            btn.disabled = false;
            // eslint-disable-next-line no-restricted-syntax
btn.innerHTML = '<i class="fa-solid fa-rocket"></i> Demander l\'accès';
          }
        });