/**
 * NEXUS ATLAS INSIGHTS & AUTO-EVOLUTION ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Moteur autonome d'analyse des logs, de détection d'anomalies, de synthèse des
 * conversations et de génération continue de recommandations d'architecture.
 * 
 * Norme : ISO/IEC 27001:2022 (A.5.29 Résilience & A.8.28 Audit des logs)
 * Régulation : AI Act UE 2024/1689 (Art. 50 - Transparence & Traçabilité IA)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
    onRequest, admin, db, googleAuth, Client,
    GEMINI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID, SMTP_PASSWORD,
    setCorsHeaders, verifyAuthToken
} = require("./shared");
const nodemailer = require("nodemailer");

const SYSTEM_PROMPT_ANALYST = `Tu es Nexus Atlas, l'Architecte Logiciel et Ingénieur Principal autonome du projet mon50ccetmoi.
Ton rôle est d'analyser les logs techniques récents (crashs, rejections, échecs d'API, cartographie, réseau) et les interactions / conversations des utilisateurs.
Tu dois :
1. Identifier la cause racine (RCA) des incidents récurrents et isoler les points de fragilité (ex: dépendances CDN bloquantes, quotas Google Maps, restrictions Referer, timeouts).
2. Extraire les besoins sous-jacents, les idées innovantes et les signaux faibles formulés dans les échanges.
3. Formuler des recommandations concrètes d'architecture et de fonctionnalités, classées par priorité stricte :
   - P0 : Critique / Stabilité & Sécurité (bugs bloquants en production ou démo).
   - P1 : Évolution majeure / Robustesse logicielle.
   - P2 : Optimisation / Confort développeur & UX.

Réponds STRICTEMENT sous format JSON valide avec la structure suivante :
{
  "summary": "Synthèse exécutive claire en 2-3 phrases",
  "systemHealthScore": 85,
  "incidentClusters": [
    {
      "title": "Titre du groupe d'incidents",
      "rootCause": "Explication technique détaillée de la cause racine",
      "occurrences": 3,
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "affectedModule": "cartography | auth | payment | navigation | network"
    }
  ],
  "topUserInsights": [
    {
      "theme": "Thématique",
      "insight": "Idée ou besoin formulé par l'utilisateur",
      "businessValue": "Valeur ajoutée pour mon50ccetmoi"
    }
  ],
  "actionableRecommendations": [
    {
      "priority": "P0 | P1 | P2",
      "title": "Titre de l'action",
      "description": "Détails techniques de l'implémentation",
      "targetFiles": ["chemin/fichier.js"],
      "expectedImpact": "Bénéfice mesurable"
    }
  ]
}`;

/**
 * Récupère et nettoie les logs de crash récents (anonymisation RGPD)
 */
async function fetchRecentCrashReports(windowHours = 48, limitCount = 50) {
    const since = new Date(Date.now() - windowHours * 3600 * 1000);
    try {
        const snapshot = await db.collection("crash_reports")
            .where("timestamp", ">=", since)
            .limit(limitCount)
            .get();

        if (snapshot.empty) {
            // Fallback : récupérer les derniers sans filtre de date si la base est peu volumineuse
            const latest = await db.collection("crash_reports").limit(20).get();
            return latest.docs.map(doc => sanitizeLog(doc.data(), doc.id));
        }

        return snapshot.docs.map(doc => sanitizeLog(doc.data(), doc.id));
    } catch (e) {
        console.warn("[Nexus Insights] Erreur lecture crash_reports (index manquant ?) :", e.message);
        try {
            const fallbackSnap = await db.collection("crash_reports").limit(20).get();
            return fallbackSnap.docs.map(doc => sanitizeLog(doc.data(), doc.id));
        } catch {
            return [];
        }
    }
}

/**
 * Récupère les sessions et conversations récentes de Nexus Atlas
 */
async function fetchRecentConversations(windowHours = 48, limitCount = 30) {
    const since = new Date(Date.now() - windowHours * 3600 * 1000);
    try {
        const snapshot = await db.collection("nexus_conversations")
            .where("updated_at", ">=", since)
            .limit(limitCount)
            .get();

        if (snapshot.empty) {
            const latest = await db.collection("nexus_conversations").limit(15).get();
            return latest.docs.map(doc => sanitizeConversation(doc.data(), doc.id));
        }

        return snapshot.docs.map(doc => sanitizeConversation(doc.data(), doc.id));
    } catch (e) {
        console.warn("[Nexus Insights] Erreur lecture nexus_conversations :", e.message);
        try {
            const fallback = await db.collection("nexus_conversations").limit(10).get();
            return fallback.docs.map(doc => sanitizeConversation(doc.data(), doc.id));
        } catch {
            return [];
        }
    }
}

function sanitizeLog(data, id) {
    return {
        id,
        type: data.type || "Error",
        message: String(data.message || "").slice(0, 300),
        url: data.url || "N/A",
        appVersion: data.appVersion || "N/A",
        online: data.online ?? true,
        stackSnippet: data.stack ? String(data.stack).split("\n").slice(0, 3).join(" | ") : "N/A"
    };
}

function sanitizeConversation(data, id) {
    return {
        id,
        summary: data.summary || "Interaction Nexus Atlas",
        topics: data.topics || [],
        userIntents: (data.intents || []).slice(0, 5),
        messagesSample: (data.messages || []).slice(-4).map(m => ({
            role: m.role,
            text: String(m.text || m.content || "").slice(0, 200)
        }))
    };
}

/**
 * Interroge Gemini (Vertex AI puis fallback AI Studio) pour générer l'analyse
 */
async function generateNexusReportWithAI(logs, conversations, apiKey) {
    const payloadPrompt = `LOGS RÉCENTS EXTRAITS :
${JSON.stringify(logs, null, 2)}

CONVERSATIONS & INTERACTIONS RÉCENTES :
${JSON.stringify(conversations, null, 2)}

Analyse l'ensemble et génère le rapport au format JSON spécifié.`;

    const contents = [{
        role: "user",
        parts: [{ text: payloadPrompt }]
    }];

    try {
        const client = await googleAuth.getClient();
        const tokenResponse = await client.getAccessToken();
        const accessToken = tokenResponse.token;

        const vertexEndpoint = "https://europe-west1-aiplatform.googleapis.com/v1/projects/mon50ccetmoi/locations/europe-west1/publishers/google/models/gemini-2.5-flash:generateContent";
        const vertexResponse = await fetch(vertexEndpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT_ANALYST }] },
                contents,
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: "application/json"
                }
            })
        });

        if (vertexResponse.ok) {
            const data = await vertexResponse.json();
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return JSON.parse(raw);
        }
    } catch (vertexErr) {
        console.warn("[Nexus Insights] Vertex AI fallback to AI Studio :", vertexErr.message);
    }

    if (apiKey) {
        const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const fallbackRes = await fetch(fallbackEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: SYSTEM_PROMPT_ANALYST }] },
                contents,
                generationConfig: { temperature: 0.2, response_mime_type: "application/json" }
            })
        });

        if (fallbackRes.ok) {
            const data = await fallbackRes.json();
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return JSON.parse(raw);
        }
    }

    // Fallback déterministe si aucune IA n'est disponible
    return {
        summary: "Rapport généré en mode secours déterministe (IA indisponible).",
        systemHealthScore: logs.length > 10 ? 60 : 90,
        incidentClusters: logs.length ? [{
            title: "Incidents non analysés par IA",
            rootCause: "Volume d'erreurs en attente de tri automatique",
            occurrences: logs.length,
            severity: "MEDIUM",
            affectedModule: "general"
        }] : [],
        topUserInsights: [{
            theme: "Stabilité générale",
            insight: "Poursuivre la surveillance active",
            businessValue: "Fiabilité opérationnelle"
        }],
        actionableRecommendations: [{
            priority: "P1",
            title: "Vérifier le quota et les restrictions de l'API cartographique",
            description: "Contrôler les restrictions de referer Google Cloud et le mode hors-ligne Leaflet",
            targetFiles: ["src/js/inline-app-1.js", "src/js/config.js"],
            expectedImpact: "Élimination des erreurs cartographiques en démo"
        }]
    };
}

/**
 * Transmission des idées et recommandations à Notion
 */
async function syncReportToNotion(report, notionKey, notionDbId) {
    if (!notionKey || !notionDbId) return false;

    try {
        const notion = new Client({ auth: notionKey });
        
        // Créer une page de synthèse globale
        await notion.pages.create({
            parent: { database_id: notionDbId },
            properties: {
                "Name": {
                    title: [{ text: { content: `[NEXUS AUTO-REPORT] Santé: ${report.systemHealthScore}% — ${new Date().toLocaleDateString("fr-FR")}` } }]
                },
                "Tags": { multi_select: [{ name: "Nexus Insight" }] },
                "Priority": { select: { name: report.systemHealthScore < 70 ? "High" : "Medium" } }
            },
            children: [
                {
                    object: "block",
                    type: "heading_2",
                    heading_2: { rich_text: [{ text: { content: "📋 Synthèse d'analyse autonome" } }] }
                },
                {
                    object: "block",
                    type: "paragraph",
                    paragraph: { rich_text: [{ text: { content: report.summary || "Aucune anomalie majeure." } }] }
                },
                {
                    object: "block",
                    type: "heading_3",
                    heading_3: { rich_text: [{ text: { content: "💡 Idées & Suggestions d'Amélioration" } }] }
                },
                ...((report.actionableRecommendations || []).slice(0, 5).map(rec => ({
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                        rich_text: [{ text: { content: `[${rec.priority}] ${rec.title} : ${rec.description} (Cible : ${(rec.targetFiles || []).join(', ')})` } }]
                    }
                })))
            ]
        });
        return true;
    } catch (err) {
        console.warn("[Nexus Insights] Erreur synchronisation Notion :", err.message);
        return false;
    }
}

/**
 * Cœur d'exécution du rapport
 */
async function runNexusAnalysisPipeline({ triggeredBy = "CRON_SCHEDULED" } = {}) {
    const tag = `[Nexus Insights / ${triggeredBy}]`;
    console.log(`${tag} Démarrage du pipeline d'analyse et d'amélioration...`);

    const [logs, conversations] = await Promise.all([
        fetchRecentCrashReports(48, 50),
        fetchRecentConversations(48, 30)
    ]);

    console.log(`${tag} Données collectées : ${logs.length} logs d'erreurs, ${conversations.length} sessions conversations.`);

    const apiKey = GEMINI_API_KEY.value ? GEMINI_API_KEY.value() : null;
    const report = await generateNexusReportWithAI(logs, conversations, apiKey);

    // 1. Sauvegarde dans Firestore
    const reportRef = db.collection("nexus_improvement_reports").doc();
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
    const reportData = {
        id: reportRef.id,
        created_at: serverTimestamp,
        triggeredBy,
        logsAnalyzedCount: logs.length,
        conversationsAnalyzedCount: conversations.length,
        systemHealthScore: report.systemHealthScore ?? 100,
        summary: report.summary,
        incidentClusters: report.incidentClusters || [],
        topUserInsights: report.topUserInsights || [],
        actionableRecommendations: report.actionableRecommendations || [],
        status: "GENERATED"
    };

    await reportRef.set(reportData);

    // 2. Synchronisation Notion
    const notionKey = NOTION_API_KEY.value ? NOTION_API_KEY.value() : null;
    const notionDb = NOTION_DATABASE_ID.value ? NOTION_DATABASE_ID.value() : null;
    if (notionKey && notionDb) {
        await syncReportToNotion(report, notionKey, notionDb);
    }

    // 3. Mise à jour de l'état de santé du système dans config/nexus_status
    await db.collection("config").doc("nexus_status").set({
        lastReportId: reportRef.id,
        lastAnalysisDate: serverTimestamp,
        systemHealthScore: report.systemHealthScore ?? 100,
        activeCriticalIssues: (report.incidentClusters || []).filter(c => c.severity === "CRITICAL").length,
        updated_at: serverTimestamp
    }, { merge: true });

    console.log(`${tag} ✅ Rapport généré avec succès [ID: ${reportRef.id}] - Score: ${report.systemHealthScore}%`);
    return reportData;
}

/**
 * FONCTION PLANIFIÉE (CRON) : Exécution nocturne automatique (02:00 Europe/Paris)
 */
exports.autoAnalyzeNexusInsights = onSchedule(
    {
        schedule: "0 2 * * *", // Chaque jour à 02:00
        timeZone: "Europe/Paris",
        region: "europe-west1",
        memory: "512MiB",
        timeoutSeconds: 300,
        secrets: [GEMINI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID, SMTP_PASSWORD],
        retryCount: 1
    },
    async (event) => {
        try {
            await runNexusAnalysisPipeline({ triggeredBy: "CRON_02H" });
        } catch (err) {
            console.error("[Nexus Insights CRON] Échec critique :", err);
            throw err;
        }
    }
);

/**
 * ENDPOINT ON-DEMAND (Admin uniquement) pour forcer une analyse immédiate
 */
exports.triggerNexusAnalysis = onRequest(
    {
        secrets: [GEMINI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID, SMTP_PASSWORD],
        region: "europe-west1",
        memory: "512MiB",
        timeoutSeconds: 180
    },
    async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        const authUser = await verifyAuthToken(req);
        if (!authUser) {
            return res.status(401).json({ error: "Authentification requise." });
        }

        try {
            const userDoc = await db.collection("users").doc(authUser.uid).get();
            if (!userDoc.exists || userDoc.data().role !== "admin") {
                return res.status(403).json({ error: "Accès restreint aux administrateurs." });
            }
        } catch (e) {
            return res.status(500).json({ error: "Erreur de vérification des droits." });
        }

        try {
            const report = await runNexusAnalysisPipeline({ triggeredBy: `ADMIN_${authUser.uid}` });
            return res.status(200).json({
                success: true,
                message: "Analyse Nexus Atlas exécutée avec succès.",
                report
            });
        } catch (err) {
            console.error("[Nexus Insights On-Demand] Erreur :", err);
            return res.status(500).json({ error: "Erreur interne lors de l'analyse.", message: err.message });
        }
    }
);
