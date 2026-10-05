/**
 * SOCIAL MEDIA — Cloud Function sécurisée pour la Page Facebook
 * ─────────────────────────────────────────────────────────────────
 * Publie du contenu sur la Page Facebook mon50ccetmoi via l'API Graph.
 * 
 * Sécurité (Zero-Trust) :
 * - Authentification Firebase Auth obligatoire
 * - Rôle admin vérifié dans Firestore (pas de confiance client)
 * - Page Access Token stocké côté serveur (Firebase Secrets)
 * - Rate limiting : 5 publications / heure / admin
 * - Validation stricte des entrées
 * - Audit trail dans Firestore (collection facebook_posts)
 * ─────────────────────────────────────────────────────────────────
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
    onRequest, admin, db,
    FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, GEMINI_API_KEY,
    setCorsHeaders, verifyAuthToken
} = require("./shared");

const FB_GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

// Hashtags par défaut ajoutés à chaque publication
const DEFAULT_HASHTAGS = ["mon50ccetmoi", "securiteroutiere", "50cc", "scooter"];

// Signature automatique en bas de chaque publication
const POST_SIGNATURE = "\n\n🏍️ Publié via mon50ccetmoi — La Boîte Noire des 2 roues\nhttps://mon50ccetmoi.com";

/**
 * Nettoie et valide un hashtag (supprime les caractères spéciaux)
 * @param {string} tag - Le hashtag brut
 * @returns {string} - Le hashtag nettoyé avec le préfixe #
 */
function sanitizeHashtag(tag) {
    if (typeof tag !== "string") return "";
    const cleaned = tag.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆ]/g, "");
    return cleaned.length > 0 ? `#${cleaned}` : "";
}

/**
 * Construit le message final avec hashtags et signature
 * @param {string} message - Le message brut
 * @param {string[]} hashtags - Liste de hashtags optionnels
 * @returns {string} - Le message formaté pour Facebook
 */
function buildFacebookMessage(message, hashtags = []) {
    let fullMessage = message.trim();

    // Ajout des hashtags
    const allTags = [...new Set([...hashtags, ...DEFAULT_HASHTAGS])];
    const sanitizedTags = allTags
        .map(sanitizeHashtag)
        .filter(t => t.length > 0);

    if (sanitizedTags.length > 0) {
        fullMessage += `\n\n${sanitizedTags.join(" ")}`;
    }

    // Ajout de la signature
    fullMessage += POST_SIGNATURE;

    return fullMessage;
}

exports.publishToFacebook = onRequest(
    { secrets: [FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID], region: "europe-west1" },
    async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        // ─── 1. AUTHENTIFICATION ───
        const authUser = await verifyAuthToken(req);
        if (!authUser) {
            return res.status(401).json({ error: "Authentification requise." });
        }

        // ─── 2. AUTORISATION (Zero-Trust : lecture Firestore, pas de confiance client) ───
        let userData;
        try {
            const userDoc = await db.collection("users").doc(authUser.uid).get();
            if (!userDoc.exists || userDoc.data().role !== "admin") {
                console.warn(`[Facebook] Publication refusée pour ${authUser.uid} (rôle: ${userDoc.exists ? userDoc.data().role : "inexistant"})`);
                return res.status(403).json({ error: "Seuls les administrateurs peuvent publier sur la Page Facebook." });
            }
            userData = userDoc.data();
        } catch (e) {
            console.error("[Facebook] Erreur vérification rôle :", e);
            return res.status(500).json({ error: "Erreur interne lors de la vérification des droits." });
        }

        // ─── 3. VALIDATION DES ENTRÉES ───
        const { message, link, imageUrl, hashtags } = req.body;

        if (!message || typeof message !== "string") {
            return res.status(400).json({ error: "Le paramètre 'message' (string) est requis." });
        }

        const trimmedMessage = message.trim();
        if (trimmedMessage.length < 5) {
            return res.status(400).json({ error: "Le message doit contenir au moins 5 caractères." });
        }
        if (trimmedMessage.length > 5000) {
            return res.status(400).json({ error: "Le message ne peut pas dépasser 5000 caractères." });
        }

        if (link && typeof link === "string") {
            try {
                new URL(link);
            } catch (_) {
                return res.status(400).json({ error: "Le lien fourni n'est pas une URL valide." });
            }
        }

        if (imageUrl && typeof imageUrl === "string") {
            try {
                const parsedUrl = new URL(imageUrl);
                if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                    throw new Error("Protocol invalide");
                }
            } catch (_) {
                return res.status(400).json({ error: "L'URL de l'image n'est pas valide." });
            }
        }

        if (hashtags && !Array.isArray(hashtags)) {
            return res.status(400).json({ error: "Le paramètre 'hashtags' doit être un tableau de strings." });
        }

        // ─── 4. RATE LIMITING (5 publications / heure) ───
        const rateLimitRef = db.collection("rate_limits").doc(`facebook_${authUser.uid}`);
        const now = Date.now();
        try {
            const rateLimitDoc = await rateLimitRef.get();
            const rateData = rateLimitDoc.exists ? rateLimitDoc.data() : null;

            if (rateData && rateData.windowStart && (now - rateData.windowStart) < 3600000) {
                if (rateData.count >= 5) {
                    return res.status(429).json({
                        error: "Limite atteinte : maximum 5 publications Facebook par heure."
                    });
                }
                await rateLimitRef.update({ count: admin.firestore.FieldValue.increment(1) });
            } else {
                await rateLimitRef.set({ windowStart: now, count: 1 });
            }
        } catch (rlErr) {
            console.warn("[Facebook Rate Limit] Erreur non bloquante :", rlErr.message);
        }

        // ─── 5. VÉRIFICATION DES SECRETS ───
        const pageToken = FB_PAGE_ACCESS_TOKEN.value();
        const pageId = FB_PAGE_ID.value();

        if (!pageToken || !pageId) {
            console.error("[Facebook] CRITIQUE : FB_PAGE_ACCESS_TOKEN ou FB_PAGE_ID non configuré dans Firebase Secrets.");
            return res.status(500).json({ error: "Configuration Facebook manquante côté serveur." });
        }

        // ─── 6. PUBLICATION VIA API GRAPH ───
        const fullMessage = buildFacebookMessage(trimmedMessage, hashtags || []);

        try {
            let fbEndpoint;
            let fbBody;

            if (imageUrl) {
                // Publication avec image
                fbEndpoint = `${FB_GRAPH_API_BASE}/${pageId}/photos`;
                fbBody = JSON.stringify({
                    url: imageUrl,
                    message: fullMessage,
                    access_token: pageToken
                });
            } else if (link) {
                // Publication avec lien
                fbEndpoint = `${FB_GRAPH_API_BASE}/${pageId}/feed`;
                fbBody = JSON.stringify({
                    message: fullMessage,
                    link: link,
                    access_token: pageToken
                });
            } else {
                // Publication texte simple
                fbEndpoint = `${FB_GRAPH_API_BASE}/${pageId}/feed`;
                fbBody = JSON.stringify({
                    message: fullMessage,
                    access_token: pageToken
                });
            }

            const fbResponse = await fetch(fbEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: fbBody
            });

            if (!fbResponse.ok) {
                const errBody = await fbResponse.text();
                console.error("[Facebook] Erreur API Graph :", fbResponse.status, errBody);

                // Parsing de l'erreur Facebook pour un message user-friendly
                let fbErrorMsg = "Erreur de publication Facebook.";
                try {
                    const fbErr = JSON.parse(errBody);
                    if (fbErr.error && fbErr.error.message) {
                        fbErrorMsg = fbErr.error.message;
                    }
                } catch (_) {}

                return res.status(fbResponse.status).json({
                    error: fbErrorMsg,
                    fb_error_code: fbResponse.status
                });
            }

            const fbData = await fbResponse.json();
            const postId = fbData.id || fbData.post_id;

            // ─── 7. AUDIT TRAIL (Firestore) ───
            await db.collection("facebook_posts").add({
                postId: postId,
                message: trimmedMessage,
                link: link || null,
                imageUrl: imageUrl || null,
                hashtags: hashtags || [],
                authorUid: authUser.uid,
                authorName: userData.username || "admin",
                status: "PUBLISHED",
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`[Facebook] ✅ Post publié : ${postId} par ${userData.username || authUser.uid}`);

            return res.status(200).json({
                success: true,
                postId: postId,
                message: "Publication Facebook réussie."
            });

        } catch (err) {
            console.error("[Facebook] Exception serveur :", err);
            return res.status(500).json({ error: "Erreur interne lors de la publication.", message: err.message });
        }
    }
);

/**
 * NEXUS ATLAS AUTONOMOUS PUBLISHER
 * ─────────────────────────────────────────────────────────────────
 * Publication automatique quotidienne (CRON)
 * Utilise Gemini pour générer le contenu du jour.
 */
exports.autoPublishFacebookNexusAtlas = onSchedule(
    {
        schedule: "every day 10:00", // Tous les jours à 10h00
        timeZone: "Europe/Paris",
        secrets: [FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, GEMINI_API_KEY],
        region: "europe-west1"
    },
    async (event) => {
        try {
            console.log("[NexusAtlas Auto-Publish] Démarrage de la génération du post du jour...");
            
            // 1. Appeler Gemini (Nexus Atlas Engine) pour générer le post
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY.value()}`;
            
            const prompt = `Tu es Nexus Atlas, l'IA experte de l'application 'mon50ccetmoi' (dédiée aux 50cc et voitures sans permis en France).
Ton rôle est de rédiger un court post Facebook engageant, utile ou amusant sur la conduite, la sécurité, l'entretien, ou une statistique intéressante pour notre communauté de jeunes pilotes.
Le ton doit être moderne, bienveillant et inclure des emojis.
Ne mets PAS de guillemets, ni de hashtags (ils seront ajoutés automatiquement), ni de signature. Juste le texte brut du post.`;

            const geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!geminiRes.ok) {
                console.error("[NexusAtlas Auto-Publish] Gemini API Error");
                return;
            }
            
            const geminiData = await geminiRes.json();
            const generatedText = geminiData.candidates[0].content.parts[0].text.trim();

            // 2. Construire le message avec les hashtags et la signature
            const finalMessage = buildFacebookMessage(generatedText);

            // 3. Publier sur la Page Facebook
            const fbUrl = `${FB_GRAPH_API_BASE}/${FB_PAGE_ID.value()}/feed`;
            const fbRes = await fetch(fbUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    access_token: FB_PAGE_ACCESS_TOKEN.value(),
                    message: finalMessage
                })
            });

            if (!fbRes.ok) {
                const fbError = await fbRes.json();
                console.error("[NexusAtlas Auto-Publish] Erreur Facebook API:", fbError);
                return;
            }

            const fbData = await fbRes.json();
            console.log(`[NexusAtlas Auto-Publish] Succès ! Post ID: ${fbData.id}`);
            
            // 4. Logger dans Firestore (Audit)
            await db.collection("facebook_posts").add({
                postId: fbData.id,
                message: finalMessage,
                authorUid: "NEXUS_ATLAS_BOT",
                isAutomated: true,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            console.error("[NexusAtlas Auto-Publish] Échec critique:", error);
        }
    }
);
