/**
 * Prévisualisation LOCALE du post quotidien Nexus Atlas (aucun appel réseau).
 * Génère le visuel + le texte final avec des statistiques fictives et un
 * aperçu HTML façon Facebook.
 *
 * Usage :  node scripts/preview-daily-post.js [dossier_sortie]
 * Sortie : <dossier>/daily-card.png et <dossier>/daily-post-preview.html
 */
const fs = require("fs");
const path = require("path");

// Stub minimal pour charger social.js sans projet Firebase initialisé
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "mon50ccetmoi";
const { renderDailyCardPng, computeActivityIndex } = require("../api/social-visual");
const { _internal } = require("../api/social");

const outDir = path.resolve(process.argv[2] || path.join(__dirname, "..", ".preview"));
fs.mkdirSync(outDir, { recursive: true });

const now = new Date();
const dateKey = _internal.parisDateKey(now);
const dateLabel = _internal.parisDateLabel(now);
const theme = _internal.pickDailyTheme(dateKey);

const stats = {
    hazardsTotal: 23,
    hazardsByType: { accident: 2, pothole: 7, roadwork: 5, obstacle: 3, weather: 4, police: 1, other: 1 },
    telemetrySessions: 148,
    telemetryFrames: 412870
};

const { headline, text } = theme.fallback;
const message = _internal.buildFacebookMessage(text, [theme.hashtag], { aiGenerated: true });
const png = renderDailyCardPng({ headline, themeLabel: theme.label, dateLabel, stats });
fs.writeFileSync(path.join(outDir, "daily-card.png"), png);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const index = computeActivityIndex(stats);

fs.writeFileSync(path.join(outDir, "daily-post-preview.html"), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Prévisualisation — Post Facebook Nexus Atlas</title>
<style>body{background:#0f1012;display:grid;place-items:center;min-height:100vh;margin:0;font-family:Inter,system-ui,sans-serif}
article{max-width:500px;background:#242526;color:#e4e6eb;border-radius:12px;overflow:hidden;box-shadow:0 10px 40px #0008}
header{display:flex;gap:10px;align-items:center;padding:12px 16px}.av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00f2ff,#b700ff)}
small{color:#b0b3b8}p{white-space:pre-line;margin:0;padding:0 16px 12px;font-size:15px;line-height:1.4}img{display:block;width:100%}
footer{display:flex;justify-content:space-around;padding:8px;border-top:1px solid #3a3b3c;color:#b0b3b8;font-weight:600;font-size:14px}</style></head>
<body><article><header><div class="av"></div><div><strong>mon50ccetmoi</strong><br><small>${esc(dateKey)} à 10:00 · 🌐 · thème ${esc(theme.label)} · indice ${index.score}/100</small></div></header>
<p>${esc(message)}</p><img src="daily-card.png" alt="Carte de télémétrie Nexus Atlas"><footer><span>👍 J'aime</span><span>💬 Commenter</span><span>↗ Partager</span></footer></article></body></html>`);

console.log(`[Preview] Thème : ${theme.label} — fichiers écrits dans ${outDir}`);
