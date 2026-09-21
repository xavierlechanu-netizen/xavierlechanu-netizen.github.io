import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

async function cleanEverything() {
            try {
                // 1. Désenregistrer les Service Workers
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for(const registration of registrations) {
                        await registration.unregister();
                    }
                }
                // 2. Vider le Cache Storage
                if ('caches' in window) {
                    const names = await caches.keys();
                    for (const name of names) {
                        await caches.delete(name);
                    }
                }
                
                // 3. Redirection avec un paramètre anti-cache
                setTimeout(() => {
                    window.location.replace('index.html?cleared=' + Date.now());
                }, 1500);
            } catch (e) {
                console.error(e);
                window.location.replace('index.html?error=1');
            }
        }
        window.onload = cleanEverything;
// --- Action Registry (ESM) ---
registerAction('cleanEverything', cleanEverything);
