import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

(async () => {
    const session = await checkAuth(true); // Requiert admin
    if (!session) return;
})();