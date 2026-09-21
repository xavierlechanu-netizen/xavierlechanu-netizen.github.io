import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

// Fallback JS au cas où meta refresh ne fonctionne pas
      window.location.replace("insurance.html");