/**
 * Veille du serveur (24/11/2026) : lancée toutes les 5 minutes par GitHub (.github/workflows/veille-serveur.yml),
 * donc depuis l'extérieur du VPS. Si le site ou l'API ne répondent plus, un SMS part par OVHcloud (France).
 * Un SMS au début de la panne, un rappel toutes les 3 h, un au retour : pas un SMS toutes les 5 minutes.
 * SMS facultatif : sans les variables ci-dessous, seul l'e-mail de GitHub (veille en échec) prévient.
 * Variables : OVH_SMS_APP_KEY, OVH_SMS_APP_SECRET, OVH_SMS_CONSUMER_KEY, OVH_SMS_SERVICE, ALERTE_SMS_NUMERO,
 * GITHUB_TOKEN + GITHUB_REPOSITORY (pour lire le résultat de la veille précédente), ESSAI=true (SMS d'essai).
 */
"use strict";

const { createOvhSmsClient, normalizeFrenchMobile } = require("../sovereign-core/server/sms-ovh");

const CIBLES = [
    ["le site", "https://mon50ccetmoi.com/"],
    ["l'API (SOS)", "https://api.mon50ccetmoi.com/api/v1/health"],
];
const ESSAIS = 3; // trois essais à 90 s : un redémarrage normal de l'API (≈ 90 s) ne sonne pas
const PAUSE_MS = 90 * 1000;

async function repond(url) {
    try {
        return (await fetch(url, { signal: AbortSignal.timeout(15000) })).ok;
    } catch {
        return false;
    }
}

async function pannes() {
    const res = await Promise.all(CIBLES.map(async ([nom, url]) => ((await repond(url)) ? null : nom)));
    return res.filter(Boolean);
}

/** Quel SMS envoyer ? "panne" au début, "rappel" toutes les 3 h tant que ça dure, "retabli" au retour, sinon null. */
function decide({ pannes: enPanne, precedent, date }) {
    if (enPanne.length) {
        if (precedent !== "failure") return "panne";
        return date.getUTCMinutes() < 5 && date.getUTCHours() % 3 === 0 ? "rappel" : null;
    }
    return precedent === "failure" ? "retabli" : null;
}

function texte(sorte, enPanne) {
    const quoi = enPanne.join(" et ");
    return {
        panne: `mon50ccetmoi EN PANNE : ${quoi} ne repond plus. Verifier le serveur OVH.`,
        rappel: `RAPPEL : mon50ccetmoi toujours en panne (${quoi}).`,
        retabli: "mon50ccetmoi est de nouveau en ligne.",
        essai: "mon50ccetmoi : SMS d'essai de la veille du serveur, tout va bien.",
    }[sorte];
}

/** Résultat de la veille précédente (success, failure…), ou null si illisible. */
async function resultatPrecedent(env) {
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) return null;
    try {
        const res = await fetch(
            `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/veille-serveur.yml/runs?status=completed&per_page=1`,
            { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15000) },
        );
        const data = await res.json();
        return (data.workflow_runs && data.workflow_runs[0] && data.workflow_runs[0].conclusion) || null;
    } catch {
        return null;
    }
}

/** Le SMS est facultatif : sans ses secrets, seul l'e-mail de GitHub (veille en échec) prévient. */
function smsConfigure(env) {
    return Boolean(env.OVH_SMS_APP_KEY && env.ALERTE_SMS_NUMERO);
}

async function envoyer(env, message) {
    const numero = normalizeFrenchMobile(env.ALERTE_SMS_NUMERO);
    if (!numero || !env.OVH_SMS_APP_KEY) throw new Error("Secrets SMS absents ou numéro invalide (voir deploy/README.md, veille du serveur).");
    const client = createOvhSmsClient({
        appKey: env.OVH_SMS_APP_KEY,
        appSecret: env.OVH_SMS_APP_SECRET,
        consumerKey: env.OVH_SMS_CONSUMER_KEY,
        serviceName: env.OVH_SMS_SERVICE,
    });
    const r = await client.send({ receivers: [numero], message });
    if (!r.validReceivers.length) throw new Error("OVHcloud n'a accepté aucun destinataire.");
    console.log("SMS envoyé.");
}

async function main(env = process.env) {
    if (env.ESSAI === "true") return envoyer(env, texte("essai", []));

    let enPanne = [];
    for (let i = 1; i <= ESSAIS; i++) {
        enPanne = await pannes();
        if (!enPanne.length) break;
        if (i < ESSAIS) await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    console.log(enPanne.length ? `En panne : ${enPanne.join(" et ")}` : "Tout répond.");

    const sorte = decide({ pannes: enPanne, precedent: await resultatPrecedent(env), date: new Date() });
    if (sorte && smsConfigure(env)) await envoyer(env, texte(sorte, enPanne));
    else if (sorte) console.log("Pas de SMS configuré : seul l'e-mail de GitHub prévient.");
    if (enPanne.length) process.exitCode = 1; // la veille « échoue » : c'est ce qui la rend visible dans GitHub
}

if (require.main === module) {
    main().catch((e) => {
        console.error("Veille :", e.message);
        process.exit(1);
    });
}

module.exports = { decide, texte, smsConfigure };
