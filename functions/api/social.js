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
    onRequest, admin, db, googleAuth,
    FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, GEMINI_API_KEY,
    setCorsHeaders, verifyAuthToken
} = require("./shared");
const { renderDailyCardPng, computeActivityIndex, stripEmoji, HAZARD_LABELS } = require("./social-visual");

const FB_GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

// Hashtags par défaut ajoutés à chaque publication
const DEFAULT_HASHTAGS = ["mon50ccetmoi", "securiteroutiere", "50cc", "scooter"];

// Signature automatique en bas de chaque publication
const POST_SIGNATURE = "\n\n🏍️ Publié via mon50ccetmoi — La Boîte Noire des 2 roues\nhttps://mon50ccetmoi.com";

// Mention de transparence obligatoire pour les contenus générés par IA (AI Act UE 2024/1689, art. 50)
const AI_DISCLOSURE = "\n\n🤖 Texte et visuel générés automatiquement par Nexus Atlas (IA) à partir de données communautaires agrégées et anonymisées.";

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
 * @param {{aiGenerated?: boolean}} [options] - aiGenerated : ajoute la mention de transparence IA
 * @returns {string} - Le message formaté pour Facebook
 */
function buildFacebookMessage(message, hashtags = [], { aiGenerated = false } = {}) {
    let fullMessage = message.trim();

    // Ajout des hashtags
    const allTags = [...new Set([...hashtags, ...DEFAULT_HASHTAGS])];
    const sanitizedTags = allTags
        .map(sanitizeHashtag)
        .filter(t => t.length > 0);

    if (sanitizedTags.length > 0) {
        fullMessage += `\n\n${sanitizedTags.join(" ")}`;
    }

    // Mention IA (publications automatiques uniquement)
    if (aiGenerated) {
        fullMessage += AI_DISCLOSURE;
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
 * Publication automatique quotidienne (CRON 10:00 Europe/Paris) d'un post
 * de type PHOTO : texte rédigé par Gemini + carte de télémétrie générée.
 *
 * Garanties :
 * - Zéro intervention : repli déterministe si Gemini tombe, repli texte seul
 *   si le rendu ou l'upload de l'image échoue.
 * - Idempotence : verrou Firestore `facebook_daily_runs/{YYYY-MM-DD}` → jamais
 *   deux posts le même jour, même si Cloud Scheduler rejoue l'exécution.
 * - Retry sélectif : seules les erreurs transitoires AVANT publication sont
 *   rejouées ; un timeout pendant l'upload est marqué UNCERTAIN (pas de rejeu).
 * - Supervision humaine (AI Act) : coupe-circuit et mode dry-run via
 *   `config/social_automation` + endpoint de prévisualisation admin.
 * ─────────────────────────────────────────────────────────────────
 */

const DAILY_TZ = "Europe/Paris";
const GEMINI_MODEL = "gemini-2.5-flash";
const VERTEX_ENDPOINT = `https://europe-west1-aiplatform.googleapis.com/v1/projects/mon50ccetmoi/locations/europe-west1/publishers/google/models/${GEMINI_MODEL}:generateContent`;
const AI_STUDIO_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 30000;
const FB_UPLOAD_TIMEOUT_MS = 60000;
const RUN_LOCK_TTL_MS = 10 * 60 * 1000;   // Un verrou IN_PROGRESS plus vieux est considéré orphelin
const MAX_DAILY_ATTEMPTS = 4;              // 1 exécution + 3 rejeux maximum par jour

// Codes Graph API transitoires (rejouables) et d'authentification (non rejouables)
const FB_RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341]);
const FB_AUTH_CODES = new Set([10, 102, 190, 200]);

/**
 * Rotation éditoriale : un thème par jour. `fallback` garantit une publication
 * de qualité même si Gemini est indisponible.
 */
const DAILY_THEMES = [
    {
        key: "securite", label: "Sécurité", hashtag: "conseilsecurite",
        brief: "un réflexe de sécurité concret (angles morts, distances, intersections, être vu)",
        fallback: {
            headline: "Angle mort : si tu ne vois pas le rétro, il ne te voit pas",
            text: "👀 Réflexe du jour : l'angle mort.\n\nSi tu ne vois pas le visage du conducteur dans son rétroviseur, c'est qu'il ne te voit pas non plus. Évite de rester à hauteur des roues arrière d'une voiture ou d'un camion, et signale toujours tes changements de file.\n\nRouler visible, c'est rouler serein. 🛵"
        }
    },
    {
        key: "entretien", label: "Entretien", hashtag: "entretienscooter",
        brief: "un point d'entretien simple et rapide à faire soi-même (pneus, freins, éclairage, chaîne/courroie)",
        fallback: {
            headline: "2 minutes pour vérifier tes pneus, ça change tout",
            text: "🔧 Check rapide du jour : les pneus.\n\nUne pression trop basse allonge le freinage et rend la machine instable dans les virages. Contrôle-la à froid une fois par mois, et jette un œil à l'usure : témoins d'usure atteints = changement immédiat.\n\nDeux minutes de vérif, des kilomètres de tranquillité. ✅"
        }
    },
    {
        key: "equipement", label: "Équipement", hashtag: "equipementmoto",
        brief: "l'équipement de protection (casque homologué, gants, blouson, visibilité) et comment bien le choisir",
        fallback: {
            headline: "Les gants : obligatoires et vraiment utiles",
            text: "🧤 Focus équipement : les gants.\n\nEn cas de chute, le premier réflexe est de mettre les mains en avant. Des gants homologués protègent tes paumes et tes doigts, et ils sont obligatoires sur deux-roues motorisé. Choisis-les à ta taille : trop grands, ils gênent le freinage.\n\nBien équipé, bien protégé. 💪"
        }
    },
    {
        key: "meteo", label: "Météo & conduite", hashtag: "meteoroute",
        brief: "adapter sa conduite à la météo et à la saison (pluie, feuilles mortes, froid, nuit qui tombe tôt)",
        fallback: {
            headline: "Sol mouillé : on double les distances de freinage",
            text: "🌧️ Conduite par temps humide.\n\nSur route mouillée, la distance de freinage peut doubler. Attention particulière aux bandes blanches, plaques d'égout et feuilles mortes, très glissantes. Freine progressivement, en ligne droite, et garde de la marge.\n\nMieux vaut arriver 2 minutes plus tard que pas du tout. 🙏"
        }
    },
    {
        key: "reglementation", label: "Réglementation", hashtag: "codedelaroute",
        brief: "un rappel clair du Code de la route applicable aux 50cc ou voitures sans permis, sans citer de montant d'amende ni de numéro d'article si tu n'es pas certain",
        fallback: {
            headline: "Feux allumés de jour : un réflexe qui sauve",
            text: "📘 Rappel réglementaire.\n\nSur un deux-roues motorisé, les feux doivent être allumés même en plein jour. Ce n'est pas un détail : ça te rend visible de loin pour les autres usagers.\n\nUn doute sur une règle ? Teste-toi gratuitement dans le module Code de la route de l'appli. 🎓"
        }
    },
    {
        key: "communaute", label: "Communauté", hashtag: "entraideroute",
        brief: "valoriser les signalements communautaires (Radar de Danger) et l'entraide entre jeunes pilotes",
        fallback: {
            headline: "Un signalement peut éviter une chute",
            text: "🤝 La force de la communauté.\n\nUn nid-de-poule, du gravier, un chantier mal signalé ? En le signalant dans le Radar de Danger, tu préviens tous les pilotes qui passeront après toi.\n\nChaque signalement compte. Merci à toutes celles et ceux qui jouent le jeu ! 💙"
        }
    },
    {
        key: "boite-noire", label: "Boîte noire", hashtag: "boitenoire",
        brief: "expliquer simplement l'intérêt de la télémétrie / boîte noire pour progresser et se protéger (preuve en cas de sinistre, conduite plus fluide)",
        fallback: {
            headline: "Ta conduite, enfin mesurée (et protégée)",
            text: "📡 Pourquoi une boîte noire sur un 50cc ?\n\nElle enregistre tes trajets pour t'aider à progresser : freinages brusques, virages, régularité. Et en cas de pépin, elle fournit des données objectives utiles pour ton assurance.\n\nTes données restent privées et chiffrées. 🔒"
        }
    }
];

/** Erreur de publication enrichie pour piloter la stratégie de rejeu. */
class FacebookPublishError extends Error {
    constructor(message, { status = 0, code = null, retryable = false, uncertain = false } = {}) {
        super(message);
        this.name = "FacebookPublishError";
        this.status = status;
        this.code = code;
        this.retryable = retryable;
        this.uncertain = uncertain;
    }
}

/** Clé de jour (YYYY-MM-DD) dans le fuseau de Paris — sert d'identifiant idempotent. */
function parisDateKey(date = new Date()) {
    return new Intl.DateTimeFormat("fr-CA", {
        timeZone: DAILY_TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date);
}

/** Date lisible pour le visuel, ex. "LUN. 05 OCT. 2026". */
function parisDateLabel(date = new Date()) {
    return new Intl.DateTimeFormat("fr-FR", {
        timeZone: DAILY_TZ, weekday: "short", day: "2-digit", month: "short", year: "numeric"
    }).format(date).toUpperCase();
}

/** Thème déterministe pour une date donnée (stable entre rejeux et prévisualisation). */
function pickDailyTheme(dateKey) {
    const dayIndex = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
    return DAILY_THEMES[((dayIndex % DAILY_THEMES.length) + DAILY_THEMES.length) % DAILY_THEMES.length];
}

/**
 * Agrège les statistiques communautaires des dernières 24 h.
 * Fail-safe : une source en erreur n'empêche pas la publication (stats partielles).
 * RGPD : seuls des compteurs sont extraits (projection `select`), aucune donnée personnelle.
 */
async function collectDailyStats(now = new Date()) {
    const since = admin.firestore.Timestamp.fromMillis(now.getTime() - 24 * 3600 * 1000);
    const stats = { hazardsTotal: 0, hazardsByType: {}, telemetrySessions: 0, telemetryFrames: 0, partial: false };

    const [hazardsRes, telemetryRes] = await Promise.allSettled([
        db.collection("hazards").where("createdAt", ">=", since).select("type").limit(5000).get(),
        db.collection("telemetry_sessions").where("created_at", ">=", since).select("frameCount").limit(5000).get()
    ]);

    if (hazardsRes.status === "fulfilled") {
        hazardsRes.value.forEach(doc => {
            const rawType = doc.get("type");
            const type = HAZARD_LABELS[rawType] ? rawType : "other";
            stats.hazardsByType[type] = (stats.hazardsByType[type] || 0) + 1;
            stats.hazardsTotal++;
        });
    } else {
        stats.partial = true;
        console.warn("[NexusAtlas Auto-Publish] Stats hazards indisponibles :", hazardsRes.reason && hazardsRes.reason.message);
    }

    if (telemetryRes.status === "fulfilled") {
        telemetryRes.value.forEach(doc => {
            stats.telemetrySessions++;
            stats.telemetryFrames += Number(doc.get("frameCount")) || 0;
        });
    } else {
        stats.partial = true;
        console.warn("[NexusAtlas Auto-Publish] Stats télémétrie indisponibles :", telemetryRes.reason && telemetryRes.reason.message);
    }

    return stats;
}

/** Extrait et parse la réponse JSON d'un appel generateContent. */
function extractGeminiJson(data) {
    const candidate = data && data.candidates && data.candidates[0];
    if (!candidate) throw new Error("Réponse Gemini vide");
    if (candidate.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
        throw new Error(`Génération interrompue (${candidate.finishReason})`);
    }
    const text = ((candidate.content && candidate.content.parts) || []).map(p => p.text || "").join("");
    return JSON.parse(text);
}

/**
 * Appelle Gemini : Vertex AI (compte de service, sans clé) puis repli AI Studio.
 * La clé AI Studio passe en en-tête (jamais dans l'URL → pas de fuite dans les logs).
 */
async function callNexusAtlasGemini({ systemPrompt, userPrompt, responseSchema }) {
    const body = JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseSchema
        }
    });
    const errors = [];

    try {
        const client = await googleAuth.getClient();
        const { token } = await client.getAccessToken();
        const res = await fetch(VERTEX_ENDPOINT, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body,
            signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
        });
        if (res.ok) return extractGeminiJson(await res.json());
        errors.push(`Vertex HTTP ${res.status}`);
    } catch (e) {
        errors.push(`Vertex: ${e.message}`);
    }

    const apiKey = GEMINI_API_KEY.value();
    if (apiKey) {
        try {
            const res = await fetch(AI_STUDIO_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
                body,
                signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
            });
            if (res.ok) return extractGeminiJson(await res.json());
            errors.push(`AI Studio HTTP ${res.status}`);
        } catch (e) {
            errors.push(`AI Studio: ${e.message}`);
        }
    }

    throw new Error(`Gemini indisponible (${errors.join(" | ")})`);
}

/** Nettoie le texte généré : liens, hashtags et guillemets sont ajoutés/interdits par nos soins. */
function sanitizeGeneratedText(text) {
    return String(text || "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1")
        .replace(/^["«»“”\s]+|["«»“”\s]+$/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Génère l'accroche (pour le visuel) et le texte du post.
 * Ne lève jamais : bascule sur le contenu de repli du thème en cas d'échec.
 * @returns {Promise<{headline: string, text: string, source: "gemini"|"fallback", error?: string}>}
 */
async function generateDailyContent({ stats, theme, dateLabel }) {
    const index = computeActivityIndex(stats);
    const breakdown = Object.entries(stats.hazardsByType)
        .filter(([, n]) => n > 0)
        .map(([type, n]) => `${HAZARD_LABELS[type] || type} : ${n}`)
        .join(", ");

    const systemPrompt = `Tu es Nexus Atlas, l'IA de l'application mon50ccetmoi (50cc, scooters et voitures sans permis en France).
Tu rédiges la publication Facebook quotidienne de la Page officielle. Elle sera accompagnée d'une carte de télémétrie (visuel) affichant les statistiques fournies.
Règles impératives :
- Français, ton moderne et bienveillant, jamais moralisateur, 2 à 4 emojis maximum.
- Champ "text" : 350 à 800 caractères, aéré en 2 ou 3 paragraphes courts.
- N'invente AUCUN chiffre : utilise uniquement les statistiques fournies, ou aucune.
- Aucun conseil médical ou juridique catégorique ; aucun montant d'amende ni numéro d'article si tu n'es pas certain.
- Pas de hashtag, pas de lien, pas de signature, pas de guillemets englobants (ajoutés automatiquement).
- Ne mentionne jamais de lieu précis ni de personne.
- Champ "headline" : accroche de 60 caractères maximum, SANS emoji, affichée en gros sur le visuel.`;

    const userPrompt = `Date : ${dateLabel}
Thème du jour : ${theme.label} — ${theme.brief}
Statistiques communautaires agrégées des dernières 24 h (affichées sur le visuel) :
- Signalements de dangers : ${stats.hazardsTotal}${breakdown ? ` (${breakdown})` : ""}
- Indice d'activité : ${index.score}/100 (${index.label})
- Sessions boîte noire analysées : ${stats.telemetrySessions}
Si les chiffres sont faibles ou nuls, ne les présente pas négativement : concentre-toi sur le thème.`;

    try {
        const result = await callNexusAtlasGemini({
            systemPrompt,
            userPrompt,
            responseSchema: {
                type: "OBJECT",
                properties: {
                    headline: { type: "STRING" },
                    text: { type: "STRING" }
                },
                required: ["headline", "text"]
            }
        });

        const text = sanitizeGeneratedText(result.text);
        const headline = stripEmoji(sanitizeGeneratedText(result.headline)).slice(0, 70);
        if (text.length < 150 || text.length > 1500) throw new Error(`Longueur de texte hors bornes (${text.length})`);
        if (headline.length < 10) throw new Error("Accroche trop courte");

        return { headline, text, source: "gemini" };
    } catch (e) {
        console.warn("[NexusAtlas Auto-Publish] Repli sur le contenu éditorial du thème :", e.message);
        return { ...theme.fallback, source: "fallback", error: e.message };
    }
}

/**
 * Assemble le post complet du jour (texte + visuel). Ne publie rien.
 * Utilisé par le CRON et par la prévisualisation admin.
 */
async function buildDailyPost(now = new Date()) {
    const dateKey = parisDateKey(now);
    const dateLabel = parisDateLabel(now);
    const theme = pickDailyTheme(dateKey);
    const stats = await collectDailyStats(now);
    const content = await generateDailyContent({ stats, theme, dateLabel });

    let png = null;
    let imageError = null;
    try {
        png = renderDailyCardPng({ headline: content.headline, themeLabel: theme.label, dateLabel, stats });
    } catch (e) {
        imageError = e.message;
        console.error("[NexusAtlas Auto-Publish] Rendu du visuel impossible, publication texte seule :", e.message);
    }

    const message = buildFacebookMessage(content.text, [theme.hashtag], { aiGenerated: true });
    return { dateKey, dateLabel, theme, stats, activityIndex: computeActivityIndex(stats), content, message, png, imageError };
}

/** POST vers l'API Graph avec classification fine des erreurs. */
async function postToGraph(endpoint, body) {
    let res;
    try {
        res = await fetch(endpoint, { method: "POST", body, signal: AbortSignal.timeout(FB_UPLOAD_TIMEOUT_MS) });
    } catch (e) {
        const isTimeout = e.name === "TimeoutError" || e.name === "AbortError";
        // Timeout : Facebook a pu recevoir et publier → état incertain, on NE rejoue PAS (anti-doublon)
        throw new FacebookPublishError(
            isTimeout ? "Délai dépassé pendant l'appel à l'API Graph." : `Erreur réseau API Graph : ${e.message}`,
            { retryable: !isTimeout, uncertain: isTimeout }
        );
    }

    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (_) { /* réponse non JSON */ }

    if (!res.ok || data.error) {
        const fbErr = data.error || {};
        const code = typeof fbErr.code === "number" ? fbErr.code : null;
        throw new FacebookPublishError(fbErr.message || `HTTP ${res.status}`, {
            status: res.status,
            code,
            retryable: res.status >= 500 || res.status === 429 || FB_RETRYABLE_CODES.has(code) || fbErr.is_transient === true
        });
    }
    return data;
}

/**
 * Publie le post du jour. Photo (multipart, upload direct du PNG — aucune URL
 * publique requise) ; repli texte seul si l'image est refusée par Facebook.
 * @returns {Promise<{postId: string, photoId: string|null, format: "PHOTO"|"TEXT"}>}
 */
async function publishDailyPost(post, { pageId, pageToken }) {
    if (post.png) {
        try {
            const form = new FormData();
            form.append("access_token", pageToken);
            form.append("message", post.message);
            form.append("published", "true");
            form.append("source", new Blob([post.png], { type: "image/png" }), `nexus-atlas-${post.dateKey}.png`);

            const data = await postToGraph(`${FB_GRAPH_API_BASE}/${pageId}/photos`, form);
            return { postId: data.post_id || data.id, photoId: data.id || null, format: "PHOTO" };
        } catch (e) {
            // Incertain, transitoire ou problème d'auth → inutile (ou dangereux) de tenter le texte seul
            if (!(e instanceof FacebookPublishError) || e.uncertain || e.retryable || FB_AUTH_CODES.has(e.code)) throw e;
            console.warn(`[NexusAtlas Auto-Publish] Photo refusée (code ${e.code}), bascule texte seul :`, e.message);
        }
    }

    const data = await postToGraph(
        `${FB_GRAPH_API_BASE}/${pageId}/feed`,
        new URLSearchParams({ access_token: pageToken, message: post.message })
    );
    return { postId: data.id, photoId: null, format: "TEXT" };
}

/** Archive le visuel dans Cloud Storage (audit). Non bloquant. */
async function archiveDailyCard(png, dateKey) {
    try {
        const filePath = `social/facebook/daily/${dateKey}.png`;
        await admin.storage().bucket().file(filePath).save(png, {
            contentType: "image/png",
            resumable: false
        });
        return filePath;
    } catch (e) {
        console.warn("[NexusAtlas Auto-Publish] Archivage du visuel impossible (non bloquant) :", e.message);
        return null;
    }
}

/**
 * Lit le coupe-circuit `config/social_automation` (écrit par un admin) :
 *   { facebookDailyEnabled: boolean (défaut true), facebookDailyDryRun: boolean (défaut false) }
 */
async function getAutomationConfig() {
    try {
        const snap = await db.collection("config").doc("social_automation").get();
        const cfg = snap.exists ? snap.data() : {};
        return {
            enabled: cfg.facebookDailyEnabled !== false,
            dryRun: cfg.facebookDailyDryRun === true
        };
    } catch (e) {
        console.warn("[NexusAtlas Auto-Publish] Config illisible, valeurs par défaut :", e.message);
        return { enabled: true, dryRun: false };
    }
}

exports.autoPublishFacebookNexusAtlas = onSchedule(
    {
        schedule: "every day 10:00", // Tous les jours à 10h00
        timeZone: DAILY_TZ,
        secrets: [FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, GEMINI_API_KEY],
        region: "europe-west1",
        memory: "512MiB",
        timeoutSeconds: 300,
        retryCount: 3,
        minBackoffSeconds: 120
    },
    async () => {
        const now = new Date();
        const dateKey = parisDateKey(now);
        const tag = `[NexusAtlas Auto-Publish][${dateKey}]`;
        const runRef = db.collection("facebook_daily_runs").doc(dateKey);
        const serverTs = admin.firestore.FieldValue.serverTimestamp;

        // ─── 0. COUPE-CIRCUIT (supervision humaine) ───
        const config = await getAutomationConfig();
        if (!config.enabled) {
            console.log(`${tag} Désactivé via config/social_automation — aucune publication.`);
            return;
        }

        // ─── 1. VERROU IDEMPOTENT (transaction) ───
        const claim = await db.runTransaction(async (tx) => {
            const snap = await tx.get(runRef);
            const run = snap.exists ? snap.data() : {};
            if (["PUBLISHED", "UNCERTAIN", "DRY_RUN"].includes(run.status)) return { skip: true, reason: run.status };
            if (run.status === "IN_PROGRESS" && Date.now() - (run.startedAtMs || 0) < RUN_LOCK_TTL_MS) {
                return { skip: true, reason: "IN_PROGRESS" };
            }
            if ((run.attempts || 0) >= MAX_DAILY_ATTEMPTS) return { skip: true, reason: "MAX_ATTEMPTS" };

            tx.set(runRef, {
                status: "IN_PROGRESS",
                startedAtMs: Date.now(),
                attempts: (run.attempts || 0) + 1,
                updated_at: serverTs()
            }, { merge: true });
            return { skip: false };
        });

        if (claim.skip) {
            console.log(`${tag} Exécution ignorée (${claim.reason}).`);
            return;
        }

        // ─── 2. SECRETS ───
        const pageToken = FB_PAGE_ACCESS_TOKEN.value();
        const pageId = FB_PAGE_ID.value();
        if (!pageToken || !pageId) {
            console.error(`${tag} CRITIQUE : FB_PAGE_ACCESS_TOKEN ou FB_PAGE_ID non configuré.`);
            await runRef.set({ status: "FAILED", error: "Secrets Facebook manquants", retryable: false, updated_at: serverTs() }, { merge: true });
            return;
        }

        try {
            // ─── 3. GÉNÉRATION (texte + visuel) ───
            const post = await buildDailyPost(now);
            console.log(`${tag} Contenu prêt (thème: ${post.theme.key}, source: ${post.content.source}, visuel: ${post.png ? "oui" : "non"}).`);

            if (config.dryRun) {
                const imagePath = post.png ? await archiveDailyCard(post.png, dateKey) : null;
                await runRef.set({
                    status: "DRY_RUN", message: post.message, imagePath,
                    theme: post.theme.key, contentSource: post.content.source, updated_at: serverTs()
                }, { merge: true });
                console.log(`${tag} Mode dry-run : post généré et archivé, non publié.`);
                return;
            }

            // ─── 4. PUBLICATION ───
            const result = await publishDailyPost(post, { pageId, pageToken });
            console.log(`${tag} ✅ Publié (${result.format}) : ${result.postId}`);

            // ─── 5. AUDIT — aucune exception ne doit remonter ici (sinon rejeu = doublon) ───
            try {
                const imagePath = post.png ? await archiveDailyCard(post.png, dateKey) : null;
                const batch = db.batch();
                batch.set(runRef, {
                    status: "PUBLISHED",
                    postId: result.postId,
                    photoId: result.photoId,
                    format: result.format,
                    error: admin.firestore.FieldValue.delete(),
                    finished_at: serverTs(),
                    updated_at: serverTs()
                }, { merge: true });
                batch.set(db.collection("facebook_posts").doc(), {
                    postId: result.postId,
                    photoId: result.photoId,
                    format: result.format,
                    message: post.message,
                    headline: post.content.headline,
                    theme: post.theme.key,
                    contentSource: post.content.source,
                    imagePath,
                    stats: post.stats,
                    activityIndex: post.activityIndex.score,
                    authorUid: "NEXUS_ATLAS_BOT",
                    isAutomated: true,
                    aiGenerated: post.content.source === "gemini",
                    status: "PUBLISHED",
                    created_at: serverTs()
                });
                await batch.commit();
            } catch (auditErr) {
                console.error(`${tag} Post publié mais audit Firestore en échec :`, auditErr.message);
            }
        } catch (err) {
            const isFb = err instanceof FacebookPublishError;
            const uncertain = isFb && err.uncertain;
            const retryable = isFb ? err.retryable : true;
            const status = uncertain ? "UNCERTAIN" : "FAILED";

            console.error(`${tag} ❌ ${status}`, { message: err.message, fbCode: isFb ? err.code : null, retryable });
            try {
                await runRef.set({
                    status,
                    error: String(err.message).slice(0, 500),
                    fbCode: isFb ? err.code : null,
                    retryable,
                    updated_at: serverTs()
                }, { merge: true });
            } catch (e) {
                console.error(`${tag} Impossible d'enregistrer l'échec :`, e.message);
            }

            // Exception propagée → Cloud Scheduler rejoue (retryCount). Jamais si état incertain.
            if (retryable && !uncertain) throw err;
        }
    }
);

/**
 * PRÉVISUALISATION ADMIN du post quotidien (aucune publication).
 * Retourne le texte final et le visuel PNG (data URL) tels qu'ils seraient publiés.
 */
exports.previewFacebookDailyPost = onRequest(
    { secrets: [GEMINI_API_KEY], region: "europe-west1", memory: "512MiB", timeoutSeconds: 120 },
    async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        // ─── Authentification + autorisation Zero-Trust ───
        const authUser = await verifyAuthToken(req);
        if (!authUser) return res.status(401).json({ error: "Authentification requise." });

        try {
            const userDoc = await db.collection("users").doc(authUser.uid).get();
            if (!userDoc.exists || userDoc.data().role !== "admin") {
                console.warn(`[Facebook Preview] Accès refusé pour ${authUser.uid}`);
                return res.status(403).json({ error: "Réservé aux administrateurs." });
            }
        } catch (e) {
            console.error("[Facebook Preview] Erreur vérification rôle :", e.message);
            return res.status(500).json({ error: "Erreur interne lors de la vérification des droits." });
        }

        // ─── Rate limiting : 10 prévisualisations / heure (coût Gemini) ───
        const rateLimitRef = db.collection("rate_limits").doc(`fbpreview_${authUser.uid}`);
        const nowMs = Date.now();
        try {
            const rl = await rateLimitRef.get();
            const rate = rl.exists ? rl.data() : null;
            if (rate && rate.windowStart && nowMs - rate.windowStart < 3600000) {
                if (rate.count >= 10) return res.status(429).json({ error: "Limite atteinte : 10 prévisualisations par heure." });
                await rateLimitRef.update({ count: admin.firestore.FieldValue.increment(1) });
            } else {
                await rateLimitRef.set({ windowStart: nowMs, count: 1 });
            }
        } catch (rlErr) {
            console.warn("[Facebook Preview Rate Limit] Erreur non bloquante :", rlErr.message);
        }

        try {
            const post = await buildDailyPost(new Date());
            return res.status(200).json({
                success: true,
                dateKey: post.dateKey,
                theme: post.theme.label,
                headline: post.content.headline,
                contentSource: post.content.source,
                message: post.message,
                stats: post.stats,
                activityIndex: post.activityIndex,
                format: post.png ? "PHOTO" : "TEXT",
                image: post.png ? `data:image/png;base64,${post.png.toString("base64")}` : null
            });
        } catch (err) {
            console.error("[Facebook Preview] Exception :", err);
            return res.status(500).json({ error: "Erreur interne lors de la prévisualisation." });
        }
    }
);

// Exports internes pour les tests et le script de prévisualisation locale
exports._internal = { buildFacebookMessage, pickDailyTheme, parisDateKey, parisDateLabel, sanitizeGeneratedText, DAILY_THEMES };
