import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

// Pre-define Google GSI callback so gsi/client never warns about missing callback
if (typeof window !== 'undefined') {
  window.handleCredentialResponse = function(response) {
    if (typeof window._handleCredentialResponseReal === 'function') {
      window._handleCredentialResponseReal(response);
    } else {
      console.log("[GSI] Réception du credential Google:", response);
    }
  };
}