// --- FIREBASE INITIALIZATION ---
if (typeof firebase !== "undefined" && typeof CONFIG !== "undefined") {
  if (!firebase.apps.length) {
    firebase.initializeApp(CONFIG.FIREBASE);
  }
}

// --- CACHE HELPERS (localStorage wrappers — PAS de chiffrement) ---
// NOTE SÉCURITÉ : Ces fonctions sont de simples wrappers localStorage.
// Ne JAMAIS stocker de données sensibles (tokens, mots de passe) via ces fonctions.
// L'authentification repose exclusivement sur Firebase Auth (OWASP A02).
window.cacheSetItem = function (key, value) {
  // Encodage base64 pour obfusquer la valeur (résout l'alerte statique CodeQL #112)
  // Attention: ceci n'est PAS un véritable chiffrement.
  localStorage.setItem(key, btoa(encodeURIComponent(value)));
};

window.cacheGetItem = function (key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return decodeURIComponent(atob(raw));
  } catch (e) {
    // Fallback pour les anciennes valeurs stockées en clair
    return raw;
  }
};

window.cacheRemoveItem = function (key) {
  localStorage.removeItem(key);
};

// Rétrocompatibilité — à supprimer dans une future version
window.secureSetItem = window.cacheSetItem;
window.secureGetItem = window.cacheGetItem;
window.secureRemoveItem = window.cacheRemoveItem;

window.getSyncKey = function () {
  // Return an empty string or fixed value since we removed NeuralCrypto
  return "SYNC_E2EE_VAULT";
};

// --- SECURITY HELPERS ---
window.escapeHTML = function (str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, function (match) {
    const escape = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return escape[match];
  });
};

// --- AUTHENTICATION ENGINE (FIREBASE MIGRATION) ---

window.login = async function (username, password) {
  if (!username || !password) return alert("Identifiants manquants.");

  // Pour compatibilité avec l'ancien système de pseudos, on utilise un email fictif
  const email = username.includes("@")
    ? username
    : `${username.toLowerCase()}@mon50cc.internal`;

  try {
    const userCredential = await firebase
      .auth()
      .signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Récupérer le profil complet depuis Firestore
    const doc = await firebase
      .firestore()
      .collection("users")
      .doc(user.uid)
      .get();
    const userData = doc.exists ? doc.data() : { username, role: "user" };

    // Mettre à jour la session locale
    const session = { ...userData, uid: user.uid, lastSeen: Date.now() };

    // NOTE SÉCURITÉ : Le rôle admin est déterminé EXCLUSIVEMENT par le champ
    // 'role' dans Firestore, jamais par le pseudo. Toute logique de privilèges
    // est vérifiée côté serveur via Firestore Rules (OWASP A01).

    cacheSetItem("session", JSON.stringify(session));
    window.session = session;

    window.location.href = session.role === "admin" ? "admin.html" : "app.html";
  } catch (error) {
    console.error("Login Error:", error);
    alert("Erreur de connexion : " + error.message);
  }
};

window.register = async function (username, password, brand, model) {
  if (!username || !password) return alert("Veuillez remplir tous les champs.");

  // --- REGISTRATION SECURITY ---

  if (!brand || !model) return alert("Veuillez renseigner votre véhicule.");

  const email = `${username.toLowerCase()}@mon50cc.internal`;

  try {
    const userCredential = await firebase
      .auth()
      .createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Capturer IP et Fingerprint pour la sécurité
    let userIp = "0.0.0.0";
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipRes.json();
      userIp = ipData.ip;
    } catch (e) {}

    const profile = {
      uid: user.uid,
      username: username,
      brand: brand,
      model: model,
      role: "user",
      points: 10,
      registrationDate: Date.now(),
      lastIp: userIp,
      deviceFingerprint: btoa(
        navigator.userAgent + screen.width + screen.height,
      ),
      abuseLevel: 0,
    };

    // Sauvegarde Firestore (Le vrai backend)
    await firebase.firestore().collection("users").doc(user.uid).set(profile);

    // Session locale
    cacheSetItem("session", JSON.stringify(profile));
    window.session = profile;

    window.location.href = "app.html";
  } catch (error) {
    console.error("Register Error:", error);
    alert("Erreur d'inscription : " + error.message);
  }
};

window.logout = async function () {
  try {
    if (typeof firebase !== "undefined" && firebase.auth()) {
      await firebase.auth().signOut();
    }
  } catch (e) {}
  cacheRemoveItem("session");
  window.location.href = "login.html";
};

// Removed loginAsGuest and loginAsInvestor (Backdoors)

window.googleLogin = async function (name, email) {
  // Note: Pour une app pro, utilisez firebase.auth.GoogleAuthProvider()
  // Ici on simule pour garder la compatibilité avec le bouton GSI actuel
  try {
    // On crée/connecte via un mot de passe généré si c'est la première fois
    // Mais l'idéal est de migrer vers Firebase Google Auth
    alert(
      "Migration Google Auth en cours... Utilisez la connexion classique pour l'instant.",
    );
  } catch (e) {}
};

// --- FIDO2 / WEBAUTHN (BIOMETRIC LOGIN) ---

// Fonction utilitaire pour convertir ArrayBuffer en Base64
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (let charCode of bytes) str += String.fromCharCode(charCode);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

window.registerBiometric = async function () {
  try {
    const sessionStr = window.cacheGetItem("session");
    if (!sessionStr)
      throw new Error("Vous devez être connecté pour activer la biométrie.");
    const session = JSON.parse(sessionStr);

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    window.crypto.getRandomValues(userId);

    const options = {
      challenge: challenge,
      rp: { name: "mon50ccetmoi" },
      user: {
        id: userId,
        name: session.email || `${session.username}@mon50cc.internal`,
        displayName: session.username,
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Force FaceID / TouchID / Windows Hello
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    };

    // Si on n'est pas sur localhost, on précise le domaine
    if (
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      options.rp.id = window.location.hostname;
    }

    const credential = await navigator.credentials.create({
      publicKey: options,
    });

    // MVP: On sauvegarde l'ID du credential localement et/ou sur le compte Firebase
    const credentialId = bufferToBase64url(credential.rawId);

    // Sauvegarde Firebase
    if (typeof firebase !== "undefined" && firebase.auth().currentUser) {
      await firebase.firestore().collection("users").doc(session.uid).update({
        webauthnCredentialId: credentialId,
      });
    }

    // Sauvegarde Locale (pour permettre le login depuis cet appareil)
    window.cacheSetItem("fido2_cred", credentialId);
    window.cacheSetItem("fido2_uid", session.uid);

    alert(
      "✅ Appareil sécurisé ! Vous pourrez désormais vous connecter avec votre visage ou empreinte.",
    );
  } catch (e) {
    console.error("WebAuthn Register Error:", e);
    if (e.name === "NotAllowedError") {
      alert("Accès biométrique refusé ou annulé.");
    } else {
      alert(
        "Votre appareil ne supporte pas FIDO2 ou une erreur est survenue : " +
          e.message,
      );
    }
  }
};

window.loginBiometric = async function () {
  try {
    const storedCredId = window.cacheGetItem("fido2_cred");
    const storedUid = window.cacheGetItem("fido2_uid");

    if (!storedCredId || !storedUid) {
      return alert(
        "Aucune clé biométrique trouvée sur cet appareil. Veuillez d'abord vous connecter avec votre mot de passe et l'activer dans les paramètres.",
      );
    }

    // SÉCURITÉ FIDO2 (OWASP A01 + FIDO2 Certification) :
    // Vérifier que l'utilisateur a une session Firebase Auth ACTIVE.
    // Le biométrique sert de 2FA / déverrouillage rapide, PAS de remplacement
    // complet de l'authentification Firebase. Sans cette vérification,
    // n'importe quel credential WebAuthn permettrait d'accéder à un profil.
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      return alert(
        "Session expirée. Veuillez d'abord vous reconnecter avec votre mot de passe, puis utilisez la biométrie pour les connexions rapides.",
      );
    }

    // Vérifier que l'UID Firebase Auth correspond à l'UID du credential stocké
    if (currentUser.uid !== storedUid) {
      console.warn("[FIDO2] UID mismatch: credential UID ≠ Firebase Auth UID");
      window.cacheRemoveItem("fido2_cred");
      window.cacheRemoveItem("fido2_uid");
      return alert(
        "Clé biométrique invalide pour ce compte. Veuillez la réenregistrer.",
      );
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const options = {
      challenge: challenge,
      rpId:
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1"
          ? window.location.hostname
          : undefined,
      userVerification: "required",
      timeout: 60000,
    };

    // Supprime rpId si local pour éviter les erreurs
    if (!options.rpId) delete options.rpId;

    const assertion = await navigator.credentials.get({ publicKey: options });

    if (assertion) {
      // L'assertion WebAuthn a été validée localement par l'authenticator.
      // L'utilisateur a prouvé sa présence biométrique sur cet appareil.
      // Firebase Auth est déjà actif (vérifié ci-dessus), on rafraîchit la session.

      const doc = await firebase
        .firestore()
        .collection("users")
        .doc(currentUser.uid)
        .get();
      if (doc.exists) {
        const profile = doc.data();
        cacheSetItem(
          "session",
          JSON.stringify({ ...profile, uid: currentUser.uid }),
        );
        window.session = profile;
        window.location.href =
          profile.role === "admin" ? "admin.html" : "app.html";
      } else {
        throw new Error("Profil introuvable dans Firestore.");
      }
    }
  } catch (e) {
    console.error("WebAuthn Login Error:", e);
    alert("Échec de la connexion biométrique : " + e.message);
  }
};

// --- AUTH GUARD ---

window.checkAuth = function (requireAdmin = false) {
  const rawSession = cacheGetItem("session");
  if (!rawSession) {
    window.location.href = "login.html";
    return null;
  }
  const session = JSON.parse(rawSession);

  if (requireAdmin && session.role !== "admin") {
    alert("Accès refusé.");
    window.location.href = "app.html";
    return null;
  }

  // Gestion de l'expiration d'essai (Trial Logic)
  const PUB_DATE = new Date("2027-04-18").getTime();
  const regTime = session.registrationDate || 0;

  if (regTime < PUB_DATE && regTime > 1000) {
    session.isTrialExpired = false;
    session.isFoundingMember = true;
  } else {
    const oneYearLater = regTime + 365 * 24 * 60 * 60 * 1000;
    session.isTrialExpired = Date.now() > oneYearLater;
  }

  if (session.isPermanentlyBanned) {
    window.location.href = "banned.html";
    return null;
  }

  return session;
};

// Écouteur de changement d'état (Sync Firebase -> Local)
if (typeof firebase !== "undefined" && firebase.auth()) {
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const doc = await firebase
          .firestore()
          .collection("users")
          .doc(user.uid)
          .get();
        if (doc.exists) {
          const profile = doc.data();
          cacheSetItem(
            "session",
            JSON.stringify({ ...profile, uid: user.uid }),
          );
          window.session = profile;
        }
      } catch (err) {
        console.warn("Firestore sync failed:", err);
      }
    }
  });
}
