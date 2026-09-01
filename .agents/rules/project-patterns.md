# Règles Opérationnelles — Projet mon50ccetmoi

Ces règles documentent les patterns techniques, les conventions et les pièges connus du projet.
Elles complètent le fichier `AGENTS.md` (sécurité) et `NEXUS_ATLAS_CONTEXT.md` (architecture générale).

---

## 1. Structure des dossiers et fichiers statiques

### Dossier `public/` = fichiers statiques servis par Vite
Les fichiers JavaScript, images et ressources statiques résident dans `public/`.
Vite copie automatiquement le contenu de `public/` à la racine lors du `dev` ou `build`.

**Conséquence critique :** Tous les fichiers HTML à la racine du projet (ex: `index.html`, `login.html`, `assureur.html`, `garage.html`) doivent référencer les scripts avec des chemins relatifs simples comme `js/config.js` — PAS `public/js/config.js`.

```
Projet racine/
├── index.html          ← Pages HTML source (entrées Vite)
├── login.html
├── assureur.html
├── garage.html
├── public/
│   └── js/             ← Fichiers JS statiques (servis comme /js/ par Vite)
│       ├── config.js
│       ├── database.js
│       ├── auth.js
│       ├── garage-pro.js
│       └── ...
├── css/
│   └── design-system.css
├── dist/               ← Build de production (Firebase Hosting pointe ici)
└── android-app/www/    ← Build mobile (Capacitor/Cordova)
```

### ⚠️ Piège fréquent : `file://` ne fonctionne pas
Ouvrir un fichier HTML directement depuis l'explorateur (`file:///...`) provoque des erreurs `ERR_FILE_NOT_FOUND` car les chemins `js/config.js` ne sont pas résolus.
**Toujours utiliser `npm run dev` (Vite sur `http://localhost:5000`) pour tester.**

---

## 2. Ajout d'une nouvelle page HTML

Quand on crée une nouvelle page HTML au projet, il faut :

1. **Créer le fichier `.html`** à la racine du projet (pas dans `public/`).

2. **Ajouter l'entrée dans `vite.config.js`** dans `rollupOptions.input` :
   ```js
   garage: resolve(__dirname, 'garage.html'),
   ```

3. **Utiliser le boilerplate standard** pour le `<head>` :
   ```html
   <!-- Fonts & Icons -->
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@700;900&display=swap" rel="stylesheet" />
   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />

   <!-- Design System -->
   <link rel="stylesheet" href="css/design-system.css" />

   <!-- Firebase SDK (v9 Compat) -->
   <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
   <script src="js/config.js"></script>
   <script>firebase.initializeApp(CONFIG.FIREBASE);</script>
   ```

4. **Mettre à jour les liens** dans `index.html` ET `public/index.html` (la navbar).

5. **Synchroniser** les 3 dossiers après le build (`public/`, `dist/`, `android-app/www/`).

---

## 3. Conventions de la Navbar (index.html)

La navbar de la page d'accueil contient 3 boutons d'accès :

| Bouton | Couleur | Lien | Fichier cible |
|---|---|---|---|
| Espace Garage Pro | `--neon-gold` (#ffb703) | `garage.html` | Page Garage |
| Assureur | `--neon-red` (#ff0055) | `assureur.html` | Portail B2B Assureur |
| Espace Pilote | Couleur primaire (cyan) | `login.html` | Connexion Pilote |

**Note :** `public/index.html` a un format HTML légèrement différent de `index.html` (racine) — les classes CSS et la structure des boutons ne sont pas identiques. Modifier les deux séparément.

---

## 4. Design System — Variables CSS clés

Le design system est dans `css/design-system.css`. Les variables les plus utilisées :

- **Fonts** : `--font-sans` (Inter), `--font-display` (Outfit), `--font-mono` (JetBrains Mono)
- **Couleurs d'accent** : `--neon-cyan`, `--neon-gold`, `--neon-red`, `--neon-purple`, `--neon-green`
- **Glassmorphism** : Classe `.glass-card` pour les cartes avec effet de verre dépoli
- **Animations** : `fadeInUp`, `pulseGlow` — disponibles globalement
- **Grille de fond** : Classe `.bg-grid` à ajouter comme premier enfant de `<body>`

### Conventions de couleur par type de portail
- **Pilote (Utilisateur)** : Teintes cyan/bleu (`--neon-cyan`)
- **Garage Pro** : Teintes dorées/orangées (`--neon-gold`, `#ff6600`)
- **Assureur** : Teintes rouges (`--neon-red`)
- **Admin** : Teintes violettes (`--neon-purple`)

---

## 5. Firebase — Patterns d'authentification

### Flux de connexion standard
```js
// 1. Auth Firebase
const userCredential = await firebase.auth().signInWithEmailAndPassword(email, pass);
const uid = userCredential.user.uid;

// 2. Récupérer le profil Firestore
const doc = await firebase.firestore().collection("users").doc(uid).get();
const profile = doc.data();

// 3. Stocker la session (chiffrement AES-256)
if (typeof secureSetItem === "function") {
  secureSetItem("session", JSON.stringify(profile));
} else {
  localStorage.setItem("session", JSON.stringify(profile));
}

// 4. Redirection
window.location.href = "app.html";
```

### Rôles utilisateur (champs Firestore `users/{uid}`)
- `role: "user"` — Pilote standard
- `isCertifiedGarage: true` — Garage professionnel certifié
- Le portail assureur utilise un système d'auth séparé (pas Firebase Auth standard)

---

## 6. Scripts et commandes

| Commande | Utilisation |
|---|---|
| `npm run dev` | Lancement du dev server Vite (port 5000) |
| `npm run build` | Build production → `dist/` + post-build script |
| `npm run preview` | Preview du build de production |
| `firebase deploy --only hosting` | Déploiement vers Firebase Hosting |
| `firebase deploy --only functions` | Déploiement Cloud Functions |
| `firebase deploy --only firestore:rules` | Mise à jour des règles Firestore |

---

## 7. SEO — Template de base pour chaque page

Chaque page HTML doit inclure :
```html
<title>[Nom de page] - mon50ccetmoi</title>
<meta name="description" content="[Description pertinente]" />
<meta property="og:title" content="[Titre OG]" />
<meta property="og:description" content="[Description OG]" />
<meta property="og:image" content="https://mon50ccetmoi.com/assets/ui/screenshot_wide.jpg" />
<meta property="og:url" content="https://mon50ccetmoi.com/[page]" />
<meta property="og:type" content="website" />
<link rel="canonical" href="https://mon50ccetmoi.com/[page]" />
<link rel="icon" type="image/png" href="assets/icons/icon-192x192.png" />
```

---

## 8. Pièges connus et erreurs fréquentes

1. **`CONFIG is not defined`** → Le fichier `js/config.js` n'est pas chargé. Vérifier que Vite est lancé (`npm run dev`), pas `file://`.
2. **`initDatabase is not defined`** → `js/database.js` non chargé. Même cause.
3. **PowerShell `&&` non supporté** → Utiliser `;` comme séparateur de commandes dans PowerShell.
4. **Synchronisation 3 dossiers** → Après modification d'un fichier dans `public/`, penser à rebuilder (`npm run build`) pour mettre à jour `dist/`.
5. **`innerHTML` interdit avec données utilisateur** → Utiliser `textContent` ou `insertAdjacentHTML` avec des données internes uniquement (OWASP A03).
