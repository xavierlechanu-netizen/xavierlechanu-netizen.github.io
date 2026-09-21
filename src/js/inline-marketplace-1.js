import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';


      // Session fallback
      try {
        const rawSession = localStorage.getItem("session");
        if (rawSession && rawSession.startsWith("{")) {
          window.session = JSON.parse(rawSession);
        } else {
          window.session = { username: "Invité", isGuest: true };
        }
      } catch (e) {
        window.session = { username: "Invité", isGuest: true };
      }