/**
 * NEXUS ATLAS — Générateur de visuel pour la publication quotidienne Facebook
 * ─────────────────────────────────────────────────────────────────────────────
 * Produit une "carte de télémétrie" 1080x1080 (format carré optimal pour le
 * fil Facebook mobile) à partir de statistiques AGRÉGÉES et ANONYMISÉES :
 *   - Jauge "Indice d'activité" (indicateur de statut 0–100)
 *   - Histogramme des signalements communautaires des dernières 24 h
 *   - Tuiles KPI (signalements, sessions boîte noire, trames analysées)
 *
 * RGPD : aucune coordonnée GPS, aucun identifiant utilisateur n'est rendu.
 * Le module est volontairement indépendant de Firebase pour être testable
 * en local (cf. functions/scripts/preview-daily-post.js).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require("path");

const CARD_SIZE = 1080;
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const FONT_FILES = [
    path.join(FONT_DIR, "Outfit-Regular.ttf"),
    path.join(FONT_DIR, "Outfit-Bold.ttf"),
    path.join(FONT_DIR, "JetBrainsMono-Bold.ttf")
];

// Palette alignée sur css/design-system.css
const COLORS = {
    bg: "#05070d",
    panel: "#0b1220",
    track: "#1e293b",
    cyan: "#00f2ff",
    gold: "#ffb703",
    red: "#ff0055",
    green: "#00e676",
    purple: "#b700ff",
    text: "#f8fafc",
    muted: "#94a3b8",
    dim: "#64748b"
};

const HAZARD_LABELS = {
    accident: "Accidents",
    pothole: "Nids-de-poule",
    roadwork: "Travaux",
    obstacle: "Obstacles",
    weather: "Météo",
    police: "Contrôles",
    other: "Autres"
};

// Pondération : un accident pèse plus lourd qu'un nid-de-poule dans l'indice
const HAZARD_WEIGHTS = { accident: 3, weather: 2, obstacle: 1.5, roadwork: 1, pothole: 1, police: 0.5, other: 1 };

// Sensibilité de l'indice : nombre de "signalements pondérés" donnant ~63/100.
// À ajuster quand le volume réel de signalements quotidiens sera connu.
const ACTIVITY_SCALE = 15;

const LEVELS = [
    { max: 24, label: "CALME", color: COLORS.green },
    { max: 49, label: "MODÉRÉ", color: COLORS.cyan },
    { max: 74, label: "SOUTENU", color: COLORS.gold },
    { max: 100, label: "ÉLEVÉ", color: COLORS.red }
];

/**
 * Calcule l'indice d'activité communautaire (0–100) et son niveau.
 * Courbe exponentielle saturante : évite qu'un pic isolé écrase l'échelle.
 * @param {{hazardsByType: Object<string, number>}} stats
 * @returns {{score: number, label: string, color: string}}
 */
function computeActivityIndex(stats) {
    const byType = (stats && stats.hazardsByType) || {};
    const weighted = Object.entries(byType).reduce(
        (sum, [type, count]) => sum + (HAZARD_WEIGHTS[type] || 1) * (Number(count) || 0), 0
    );
    const score = Math.min(100, Math.round(100 * (1 - Math.exp(-weighted / ACTIVITY_SCALE))));
    const level = LEVELS.find(l => score <= l.max) || LEVELS[LEVELS.length - 1];
    return { score, label: level.label, color: level.color };
}

/** Échappement XML strict (le titre provient de l'IA → jamais injecté brut). */
function escapeXml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** Supprime les emojis / pictogrammes (absents des polices embarquées → carrés vides). */
function stripEmoji(text) {
    return String(text)
        .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

/** Formatage FR des nombres, espace insécable fine remplacée (glyphe absent des polices). */
function formatNumber(n) {
    return new Intl.NumberFormat("fr-FR").format(Number(n) || 0).replace(/[\u202F\u00A0]/g, " ");
}

/** Découpe un texte en lignes de `maxChars` caractères max, avec ellipse si débordement. */
function wrapText(text, maxChars, maxLines) {
    const words = stripEmoji(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
        }
        if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && current) lines.push(current);
    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    }
    return lines;
}

/**
 * Construit le SVG de la carte de télémétrie.
 * @param {object} data
 * @param {string} data.headline     - Accroche courte (générée par Nexus Atlas)
 * @param {string} data.themeLabel   - Thème du jour (ex: "SÉCURITÉ")
 * @param {string} data.dateLabel    - Date affichée (ex: "LUN. 05 OCT. 2026")
 * @param {object} data.stats        - { hazardsTotal, hazardsByType, telemetrySessions, telemetryFrames }
 * @returns {string} SVG
 */
function buildDailyCardSvg({ headline, themeLabel, dateLabel, stats }) {
    const s = stats || {};
    const byType = s.hazardsByType || {};
    const index = computeActivityIndex(s);

    // ─── Jauge circulaire (indicateur de statut) ───
    const gaugeCx = 270, gaugeCy = 620, gaugeR = 125;
    const circumference = 2 * Math.PI * gaugeR;
    const arc = Math.max(0.001, (index.score / 100) * circumference);

    // ─── Histogramme des signalements ───
    const types = Object.keys(HAZARD_LABELS);
    const maxCount = Math.max(1, ...types.map(t => Number(byType[t]) || 0));
    const barX = 720, barW = 230, rowH = 44, barsTop = 492;
    const hasHazards = types.some(t => (Number(byType[t]) || 0) > 0);

    const bars = types.map((type, i) => {
        const count = Number(byType[type]) || 0;
        const y = barsTop + i * rowH;
        const w = count > 0 ? Math.max(8, Math.round((count / maxCount) * barW)) : 0;
        const color = type === "accident" ? COLORS.red : (type === "weather" ? COLORS.gold : COLORS.cyan);
        return `
        <text x="520" y="${y + 13}" font-family="Outfit" font-size="24" fill="${COLORS.text}">${escapeXml(HAZARD_LABELS[type])}</text>
        <rect x="${barX}" y="${y - 2}" width="${barW}" height="14" rx="7" fill="${COLORS.track}"/>
        ${w > 0 ? `<rect x="${barX}" y="${y - 2}" width="${w}" height="14" rx="7" fill="${color}" filter="url(#glow)"/>` : ""}
        <text x="1004" y="${y + 13}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${count > 0 ? COLORS.text : COLORS.dim}">${count}</text>`;
    }).join("");

    const barsEmptyNote = hasHazards ? "" : `
        <text x="762" y="${barsTop + 7 * rowH + 18}" text-anchor="middle" font-family="Outfit" font-size="22" fill="${COLORS.green}">RAS — route dégagée sur 24 h</text>`;

    // ─── Accroche (2 lignes max) ───
    const headlineLines = wrapText(headline || "La route se partage, la sécurité aussi.", 34, 2);
    const headlineSvg = headlineLines.map((line, i) =>
        `<text x="72" y="${318 + i * 56}" font-family="Outfit" font-weight="700" font-size="46" fill="${COLORS.text}">${escapeXml(line)}</text>`
    ).join("");

    // ─── Tuiles KPI ───
    const kpis = [
        { value: formatNumber(s.hazardsTotal), label: "Signalements 24 h", color: COLORS.cyan },
        { value: formatNumber(s.telemetrySessions), label: "Sessions boîte noire", color: COLORS.gold },
        { value: formatNumber(s.telemetryFrames), label: "Trames analysées", color: COLORS.purple }
    ];
    const tileW = 296, tileGap = 24, tileY = 850, tileH = 112;
    const tiles = kpis.map((k, i) => {
        const x = 72 + i * (tileW + tileGap);
        return `
        <rect x="${x}" y="${tileY}" width="${tileW}" height="${tileH}" rx="18" fill="${COLORS.panel}" stroke="${k.color}" stroke-opacity="0.35"/>
        <rect x="${x}" y="${tileY + 20}" width="4" height="${tileH - 40}" rx="2" fill="${k.color}"/>
        <text x="${x + 28}" y="${tileY + 58}" font-family="JetBrains Mono" font-weight="700" font-size="44" fill="${k.color}">${escapeXml(k.value)}</text>
        <text x="${x + 28}" y="${tileY + 90}" font-family="Outfit" font-size="22" fill="${COLORS.muted}">${escapeXml(k.label)}</text>`;
    }).join("");

    const theme = escapeXml(stripEmoji(themeLabel || "SÉCURITÉ").toUpperCase());
    const themeChipW = Math.max(150, 28 + theme.length * 15);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}">
  <defs>
    <radialGradient id="glowCyan" cx="15%" cy="10%" r="70%">
      <stop offset="0%" stop-color="${COLORS.cyan}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${COLORS.cyan}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowPurple" cx="90%" cy="95%" r="65%">
      <stop offset="0%" stop-color="${COLORS.purple}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${COLORS.purple}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse">
      <path d="M 54 0 L 0 0 0 54" fill="none" stroke="${COLORS.cyan}" stroke-opacity="0.06" stroke-width="1"/>
    </pattern>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Fond -->
  <rect width="100%" height="100%" fill="${COLORS.bg}"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <rect width="100%" height="100%" fill="url(#glowCyan)"/>
  <rect width="100%" height="100%" fill="url(#glowPurple)"/>
  <rect x="36" y="36" width="1008" height="1008" rx="28" fill="none" stroke="${COLORS.cyan}" stroke-opacity="0.3" stroke-width="2"/>
  <path d="M36 110 V64 a28 28 0 0 1 28 -28 H110" fill="none" stroke="${COLORS.cyan}" stroke-width="5" stroke-linecap="round"/>
  <path d="M1044 970 V1016 a28 28 0 0 1 -28 28 H970" fill="none" stroke="${COLORS.cyan}" stroke-width="5" stroke-linecap="round"/>

  <!-- En-tête -->
  <text x="72" y="112" font-family="JetBrains Mono" font-weight="700" font-size="22" letter-spacing="4" fill="${COLORS.cyan}">NEXUS ATLAS // TÉLÉMÉTRIE</text>
  <text x="1008" y="112" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" letter-spacing="2" fill="${COLORS.muted}">${escapeXml(dateLabel || "")}</text>
  <text x="72" y="188" font-family="Outfit" font-weight="700" font-size="66" fill="${COLORS.text}">Bulletin du jour</text>
  <rect x="72" y="214" width="${themeChipW}" height="40" rx="20" fill="${COLORS.gold}" fill-opacity="0.14" stroke="${COLORS.gold}" stroke-opacity="0.6"/>
  <text x="${72 + themeChipW / 2}" y="241" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" letter-spacing="2" fill="${COLORS.gold}">${theme}</text>

  <!-- Accroche -->
  ${headlineSvg}

  <!-- Séparateur -->
  <line x1="72" y1="412" x2="1008" y2="412" stroke="${COLORS.cyan}" stroke-opacity="0.18" stroke-width="2"/>

  <!-- Indicateur de statut -->
  <text x="${gaugeCx}" y="458" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" letter-spacing="3" fill="${COLORS.muted}">INDICE D'ACTIVITÉ</text>
  <circle cx="${gaugeCx}" cy="${gaugeCy}" r="${gaugeR}" fill="none" stroke="${COLORS.track}" stroke-width="22"/>
  <circle cx="${gaugeCx}" cy="${gaugeCy}" r="${gaugeR}" fill="none" stroke="${index.color}" stroke-width="22" stroke-linecap="round"
          stroke-dasharray="${arc.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 ${gaugeCx} ${gaugeCy})" filter="url(#glow)"/>
  <text x="${gaugeCx}" y="${gaugeCy + 18}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="88" fill="${index.color}">${index.score}</text>
  <text x="${gaugeCx}" y="${gaugeCy + 58}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${COLORS.dim}">/ 100</text>
  <rect x="${gaugeCx - 95}" y="${gaugeCy + gaugeR + 22}" width="190" height="46" rx="23" fill="${index.color}" fill-opacity="0.15" stroke="${index.color}"/>
  <text x="${gaugeCx}" y="${gaugeCy + gaugeR + 54}" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="26" letter-spacing="2" fill="${index.color}">${escapeXml(index.label)}</text>

  <!-- Histogramme -->
  <text x="520" y="458" font-family="JetBrains Mono" font-weight="700" font-size="20" letter-spacing="3" fill="${COLORS.muted}">SIGNALEMENTS · 24 H</text>
  ${bars}
  ${barsEmptyNote}

  <!-- KPI -->
  ${tiles}

  <!-- Pied de page (mention AI Act art. 50) -->
  <text x="72" y="1010" font-family="Outfit" font-weight="700" font-size="24" fill="${COLORS.cyan}">mon50ccetmoi.com</text>
  <text x="1008" y="1010" text-anchor="end" font-family="Outfit" font-size="19" fill="${COLORS.dim}">Visuel généré par IA · données agrégées et anonymisées</text>
</svg>`;
}

/**
 * Rend la carte en PNG.
 * `@resvg/resvg-js` est chargé à la demande : si le binaire natif est indisponible,
 * l'appelant reçoit une exception et peut basculer en publication texte seule.
 * @param {object} data - cf. buildDailyCardSvg
 * @returns {Buffer} PNG
 */
function renderDailyCardPng(data) {
    const { Resvg } = require("@resvg/resvg-js");
    const svg = buildDailyCardSvg(data);
    const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: CARD_SIZE },
        font: {
            fontFiles: FONT_FILES,
            loadSystemFonts: false,
            defaultFontFamily: "Outfit"
        }
    });
    return resvg.render().asPng();
}

module.exports = {
    buildDailyCardSvg,
    renderDailyCardPng,
    computeActivityIndex,
    stripEmoji,
    HAZARD_LABELS
};
