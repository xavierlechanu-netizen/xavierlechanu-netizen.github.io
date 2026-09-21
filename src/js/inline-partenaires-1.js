import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

// Initialisation de Firebase
if (!CONFIG) {
        console.error("[Nexus Atlas] CONFIG non chargé — Firebase ne peut pas démarrer.");
      }