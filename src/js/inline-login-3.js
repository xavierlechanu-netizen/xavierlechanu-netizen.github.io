import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

function toggleForm(formType) {
        document.getElementById("login-form").classList.add("hidden");
        document.getElementById("register-form").classList.add("hidden");
        document.getElementById(formType + "-form").classList.remove("hidden");
      }

      function doLogin() {
        login(
          document.getElementById("login-user").value,
          document.getElementById("login-pass").value,
        );
      }
      function doRegister() {
        register(
          document.getElementById("reg-user").value,
          document.getElementById("reg-pass").value,
          document.getElementById("reg-brand").value,
          document.getElementById("reg-model").value,
        );
      }

      // --- NEW: URL Hash Routing ---
      window.addEventListener("DOMContentLoaded", () => {
        if (window.location.hash === "#register") {
          toggleForm("register");
        }
      });

      // --- NEW: Google Login Callback via Firebase ---
      async function handleCredentialResponse(response) {
        console.log("Tentative de connexion Google via Firebase...");
        const credential = firebase.auth.GoogleAuthProvider.credential(
          response.credential,
        );
        try {
          const userCredential = await firebase
            .auth()
            .signInWithCredential(credential);
          const user = userCredential.user;

          // Vérifier si le profil Firestore existe
          const doc = await firebase
            .firestore()
            .collection("users")
            .doc(user.uid)
            .get();
          let profile;
          if (!doc.exists) {
            profile = {
              uid: user.uid,
              username: user.displayName || user.email.split("@")[0],
              role: "user",
              points: 50,
              registrationDate: Date.now(),
              brand: "Google Pilot",
            };
            await firebase
              .firestore()
              .collection("users")
              .doc(user.uid)
              .set(profile);
          } else {
            profile = doc.data();
          }

          secureSetItem("session", JSON.stringify(profile));
          window.location.href = "app.html";
        } catch (error) {
          console.error("Google Auth Error:", error);
          alert("Erreur Google Auth : " + error.message);
        }
      }

      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker
            .register("./sw.js?v=1060000")
            .then((reg) => console.log("Service Worker (Login) enregistré"))
            .catch((err) => console.log("Échec Service Worker: ", err));
        });
      }
// --- Action Registry (ESM) ---
registerAction('toggleForm', toggleForm);
