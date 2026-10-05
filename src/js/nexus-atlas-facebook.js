import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

/**
 * Nexus Atlas — Module Facebook Publishing
 * Permet à Nexus Atlas de publier sur la Page Facebook via commande chat/voix.
 * Accès restreint aux admins (vérifié côté serveur via Cloud Function).
 */

window.NexusAtlasFacebook = {
    endpoint: "https://europe-west1-mon50ccetmoi.cloudfunctions.net/publishToFacebook",

    /**
     * Publie un message sur la Page Facebook mon50ccetmoi.
     * @param {string} message - Le texte du post
     * @param {object} options - { link?, imageUrl?, hashtags? }
     * @returns {Promise<object>} - { success, postId }
     */
    publishToFacebook: async function (message, options = {}) {
        if (!message || message.trim().length < 5) {
            throw new Error("Le message doit contenir au moins 5 caractères.");
        }

        // Vérification auth locale (la vraie vérification est côté serveur)
        const user = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
        if (!user) {
            throw new Error("Vous devez être connecté pour publier sur Facebook.");
        }

        const token = await user.getIdToken();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        try {
            const response = await fetch(this.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: message.trim(),
                    link: options.link || null,
                    imageUrl: options.imageUrl || null,
                    hashtags: options.hashtags || ["mon50ccetmoi", "securiteroutiere", "50cc"]
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || `Erreur HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log("[NexusAtlas Facebook] ✅ Publication réussie :", data.postId);
            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === "AbortError") {
                throw new Error("Délai d'attente dépassé pour la publication Facebook.");
            }
            throw error;
        }
    }
};

// Enregistrement dans l'Action Registry pour la commande vocale et le chat
registerAction('publishToFacebook', (message, options) =>
    window.NexusAtlasFacebook.publishToFacebook(message, options)
);
