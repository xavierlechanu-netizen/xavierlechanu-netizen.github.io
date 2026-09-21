import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

// Initialiser Firebase et la base de données (db)
// Config.js s'en charge maintenant.