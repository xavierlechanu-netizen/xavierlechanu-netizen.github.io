const {
    onRequest, onCall, HttpsError, admin, db,
    setCorsHeaders, verifyAuthToken
} = require("./shared");

exports.sendEmergencySOS = onCall(
    { region: "europe-west1" },
    async (request) => {
        if (!request.auth || !request.auth.uid) {
            throw new HttpsError('unauthenticated', 'Authentification requise.');
        }

        const uid = request.auth.uid;
        const { location, contacts, message, blackboxReportId } = request.data;

        if (!contacts || contacts.length === 0) {
            console.log(`[SOS] Aucun contact d'urgence défini pour ${uid}`);
            return { success: false, message: "Aucun contact défini." };
        }

        try {
            const batch = db.batch();

            const alertRef = db.collection("sos_alerts").doc();
            batch.set(alertRef, {
                user_id: uid,
                location: location || "Unknown",
                contacts: contacts,
                message: message || "SOS Alert",
                blackbox_id: blackboxReportId || null,
                status: "processing",
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            let finalMessage = message + ` Position: ${location}`;
            if (blackboxReportId) {
                finalMessage += ` [Preuve Blackbox Télémétrie Sécurisée générée]`;
            }

            for (const contact of contacts) {
                if (contact.phone) {
                    const smsRef = db.collection("sms_outbox").doc();
                    batch.set(smsRef, {
                        to: contact.phone,
                        body: finalMessage,
                        user_id: uid,
                        status: "PENDING",
                        created_at: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            await batch.commit();

            console.log(`[SOS] Alert sent to ${contacts.length} contacts for user ${uid} via sms_outbox`);
            return { success: true, message: "SOS transmis à la passerelle SMS avec succès." };
        } catch(e) {
            console.error("[SOS] Error", e);
            throw new HttpsError('internal', 'Erreur interne lors de la création du SOS.');
        }
    }
);

exports.triggerAntiTheftAlert = onRequest(
    { region: "europe-west1" },
    async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        const authUser = await verifyAuthToken(req);
        if (!authUser) {
            return res.status(401).json({ error: "Authentification requise." });
        }

        const { force, location } = req.body;

        try {
            await db.collection("theft_alerts").add({
                user_id: authUser.uid,
                force: force || 0,
                location: location || "Unknown",
                status: "active",
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[ANTI-THEFT] Alert registered for user ${authUser.uid} with force ${force}G`);
            return res.status(200).json({ success: true, message: "Alerte de vol transmise aux serveurs avec succès." });
        } catch(e) {
            console.error("[ANTI-THEFT] Error", e);
            return res.status(500).json({ error: "Internal Error" });
        }
    }
);

exports.createHazardReport = onCall(
    { region: "europe-west1" },
    async (request) => {
        if (!request.auth || !request.auth.uid) {
            throw new HttpsError("unauthenticated", "Authentification requise.");
        }

        const uid = request.auth.uid;
        const { type, lat, lng, description } = request.data || {};

        if (!type || !lat || !lng) {
            throw new HttpsError("invalid-argument", "Type, latitude et longitude requis.");
        }
        const allowedTypes = ["pothole", "accident", "police", "roadwork", "obstacle", "weather", "other"];
        if (!allowedTypes.includes(type)) {
            throw new HttpsError("invalid-argument", "Type de danger non reconnu.");
        }
        if (typeof lat !== "number" || typeof lng !== "number" || 
            lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new HttpsError("invalid-argument", "Coordonnées GPS invalides.");
        }

        const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
        const RATE_LIMIT_MAX = 5;
        const rateLimitRef = db.collection("rate_limits").doc(`hazard_${uid}`);

        try {
            const rateLimitDoc = await rateLimitRef.get();
            const now = Date.now();

            if (rateLimitDoc.exists) {
                const data = rateLimitDoc.data();
                const windowStart = data.windowStart || 0;
                const count = data.count || 0;

                if (now - windowStart < RATE_LIMIT_WINDOW_MS && count >= RATE_LIMIT_MAX) {
                    throw new HttpsError(
                        "resource-exhausted",
                        `Limite atteinte : maximum ${RATE_LIMIT_MAX} signalements par ${RATE_LIMIT_WINDOW_MS / 60000} minutes.`
                    );
                }

                if (now - windowStart >= RATE_LIMIT_WINDOW_MS) {
                    await rateLimitRef.set({ windowStart: now, count: 1 });
                } else {
                    await rateLimitRef.update({ count: admin.firestore.FieldValue.increment(1) });
                }
            } else {
                await rateLimitRef.set({ windowStart: now, count: 1 });
            }

            const hazardData = {
                type,
                lat,
                lng,
                description: typeof description === "string" ? description.substring(0, 500) : "",
                userId: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                votes: 0,
                active: true
            };

            const docRef = await db.collection("hazards").add(hazardData);
            console.log(`[Hazard] Signalement ${type} créé par ${uid.substring(0, 6)}... (${docRef.id})`);

            return { success: true, hazardId: docRef.id };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("[Hazard] Erreur création signalement:", error);
            throw new HttpsError("internal", "Erreur lors de la création du signalement.");
        }
    }
);
