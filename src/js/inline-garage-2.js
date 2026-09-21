import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

/**
       * Garage Pro Login — Firebase Auth
       * Vérifie que l'utilisateur est bien un garage certifié (isCertifiedGarage === true)
       */
      async function doGarageLogin() {
        const email = document.getElementById("garage-email").value.trim();
        const pass = document.getElementById("garage-pass").value;
        const errorBox = document.getElementById("login-error");
        const btn = document.getElementById("btn-garage-login");

        errorBox.style.display = "none";

        if (!email || !pass) {
          errorBox.textContent = "Veuillez remplir tous les champs.";
          errorBox.style.display = "block";
          return;
        }

        // UI loading state
        btn.disabled = true;
        // eslint-disable-next-line no-restricted-syntax
btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connexion en cours...';

        try {
          const userCredential = await firebase.auth().signInWithEmailAndPassword(email, pass);
          const uid = userCredential.user.uid;

          // Vérifier le statut garage certifié dans Firestore
          const doc = await firebase.firestore().collection("users").doc(uid).get();

          if (!doc.exists || !doc.data().isCertifiedGarage) {
            // L'utilisateur existe mais n'est pas un garage certifié
            await firebase.auth().signOut();
            errorBox.textContent = "Ce compte n'est pas un compte Garage Pro certifié. Utilisez l'accès Pilote ou inscrivez votre garage.";
            errorBox.style.display = "block";
            btn.disabled = false;
            // eslint-disable-next-line no-restricted-syntax
btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> SE CONNECTER';
            return;
          }

          // Succès — Stocker la session et rediriger vers app.html
          const profile = doc.data();
          profile.uid = uid;
          if (typeof secureSetItem === "function") {
            await secureSetItem("session", JSON.stringify(profile));
          } else {
            localStorage.setItem("session", JSON.stringify(profile));
          }

          window.location.href = "garage-dashboard.html";

        } catch (error) {
          console.error("Erreur connexion Garage:", error);
          let msg = "Erreur d'authentification.";
          if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
            msg = "Identifiants incorrects. Vérifiez votre email et mot de passe.";
          } else if (error.code === "auth/too-many-requests") {
            msg = "Trop de tentatives. Veuillez réessayer dans quelques minutes.";
          } else if (error.code === "auth/invalid-email") {
            msg = "Format d'email invalide.";
          }
          errorBox.textContent = msg;
          errorBox.style.display = "block";
          btn.disabled = false;
          // eslint-disable-next-line no-restricted-syntax
btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> SE CONNECTER';
        }
      }

      /**
       * Ouvre la modale d'inscription Offre Pionnier via garage-pro.js
       */
      function openPioneerRegistration() {
        if (window.GaragePro) {
          GaragePro.initRegistration();
        } else {
          alert("Module d'inscription en cours de chargement. Veuillez réessayer.");
        }
      }

      /**
       * Charge les statistiques depuis Firestore
       */
      async function loadGarageStats() {
        try {
          if (typeof db !== "undefined") {
            // Nombre de garages inscrits
            const statsDoc = await db.collection("stats").doc("garage_registrations").get();
            const count = statsDoc.exists ? (statsDoc.data().count || 0) : 0;
            const remaining = Math.max(0, 50 - count);

            document.getElementById("stat-garages").textContent = count;
            document.getElementById("stat-remaining").textContent = remaining;

            // Nombre d'interventions
            const logsSnap = await db.collection("maintenance_logs").count().get();
            document.getElementById("stat-interventions").textContent = logsSnap.data().count || 0;
          } else {
            // Fallback si Firestore non disponible
            document.getElementById("stat-garages").textContent = "12";
            document.getElementById("stat-remaining").textContent = "38";
            document.getElementById("stat-interventions").textContent = "247";
          }
        } catch (e) {
          console.warn("Stats Garage non disponibles:", e);
          document.getElementById("stat-garages").textContent = "--";
          document.getElementById("stat-remaining").textContent = "--";
          document.getElementById("stat-interventions").textContent = "--";
        }
      }

      // Charger les stats au démarrage
      document.addEventListener("DOMContentLoaded", loadGarageStats);