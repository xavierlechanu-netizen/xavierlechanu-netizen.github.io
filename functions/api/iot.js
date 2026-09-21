const {
    onRequest, onCall, HttpsError, admin, db, crypto,
    setCorsHeaders, verifyAuthToken
} = require("./shared");

exports.iotFdoRendezvous = onRequest({ region: "europe-west1" }, async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const authUser = await verifyAuthToken(req);
    if (!authUser) {
        return res.status(401).json({ error: "Authentification requise pour l'onboarding IoT." });
    }

    const { hardware_id, signature } = req.body;
    if (!hardware_id || !signature) {
        return res.status(400).json({ error: "Voucher incomplet. hardware_id et signature requis." });
    }

    try {
        const voucherDoc = await db.collection("fdo_vouchers").doc(hardware_id).get();
        if (!voucherDoc.exists) {
            return res.status(404).json({ error: "Voucher non reconnu (Non provisionné par le fabricant)." });
        }

        const voucherData = voucherDoc.data();
        if (voucherData.status !== "PENDING_ONBOARDING") {
            return res.status(403).json({ error: "Boîtier déjà onboardé ou révoqué." });
        }

        const targetEndpoint = "https://europe-west1-mon50ccetmoi.cloudfunctions.net/uploadBlackboxTelemetry";
        const customToken = await admin.auth().createCustomToken(hardware_id, { is_iot_device: true });

        await voucherDoc.ref.update({
            status: "ONBOARDED",
            onboarded_at: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[FDO] Onboarding réussi pour le device ${hardware_id}`);
        return res.status(200).json({
            success: true,
            target_cloud: targetEndpoint,
            iot_token: customToken
        });
    } catch (e) {
        console.error("[FDO] Erreur serveur :", e);
        return res.status(500).json({ error: "Internal Error" });
    }
});

exports.uploadBlackboxTelemetry = onCall(
    { region: "europe-west1", timeoutSeconds: 60, memory: "256MiB" },
    async (request) => {
        if (!request.auth || !request.auth.uid) {
            throw new HttpsError("unauthenticated", "Authentification requise.");
        }

        const uid = request.auth.uid;
        const { hardwareId, payloads } = request.data || {};

        if (!Array.isArray(payloads) || payloads.length === 0) {
            throw new HttpsError("invalid-argument", "Le lot de trames est vide ou invalide.");
        }
        if (payloads.length > 5000) {
            throw new HttpsError("invalid-argument", "Taille de lot maximale dépassée (max 5000 trames).");
        }

        try {
            const bucketName = "mon50ccetmoi-telemetry";
            const bucket = admin.storage().bucket(bucketName);
            const timestamp = Date.now();
            const randomSuffix = crypto.randomBytes(4).toString("hex");
            const fileName = `telemetry/${uid}/${timestamp}_${randomSuffix}.json`;
            const file = bucket.file(fileName);

            const sessionData = {
                uid,
                hardwareId: typeof hardwareId === "string" ? hardwareId.substring(0, 64) : "UNKNOWN_HW",
                uploadedAt: new Date().toISOString(),
                frameCount: payloads.length,
                frames: payloads
            };

            await file.save(JSON.stringify(sessionData), {
                contentType: "application/json",
                metadata: {
                    uid,
                    hardwareId: sessionData.hardwareId,
                    frameCount: String(payloads.length)
                }
            });

            const docRef = await db.collection("telemetry_sessions").add({
                uid,
                hardwareId: sessionData.hardwareId,
                frameCount: payloads.length,
                storagePath: fileName,
                storageBucket: bucketName,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`[Telemetry] Batch de ${payloads.length} trames stocké pour ${uid.substring(0, 6)}... (Session ${docRef.id})`);

            return {
                success: true,
                sessionId: docRef.id,
                frameCount: payloads.length
            };
        } catch (error) {
            console.error("[Telemetry] Erreur upload télémétrie:", error);
            throw new HttpsError("internal", "Erreur lors du traitement de la télémétrie.");
        }
    }
);
