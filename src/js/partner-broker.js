/**
 * Bouton « Trouver mon assurance » — courtier partenaire (option A : mise en relation simple).
 *
 * L'appli ne collecte AUCUNE donnée personnelle : le bouton ouvre la page de devis du cabinet
 * ou appelle le cabinet, et affiche un code partenaire que le client donne au courtier
 * (avec ce code, le cabinet réduit ses frais de dossier).
 * Ce code permet au courtier de compter les contrats signés venus de mon50ccetmoi
 * (rémunération de la mise en relation prévue par la convention de partenariat).
 *
 * ⚠️ Masqué tant que la convention n'est pas signée : passer ENABLED à true ce jour-là.
 */

export const PARTNER_BROKER = Object.freeze({
  ENABLED: false,
  NAME: "National Assurance Courtage",
  CITY: "Roubaix",
  ORIAS: "23003285",
  PHONE_E164: "+33184807464",
  PHONE_DISPLAY: "01 84 80 74 64",
  QUOTE_URL: "https://www.nacourtage.com/",
  PARTNER_CODE: "mon50ccetmoi.com",
  // Avantage accordé par le cabinet aux clients qui donnent le code (prévu par la convention)
  CODE_BENEFIT: "frais de dossier réduits",
});

/** Lien de devis avec la source et le code partenaire (le cabinet voit d'où vient la demande). */
export function buildQuoteUrl(broker = PARTNER_BROKER) {
  const url = new URL(broker.QUOTE_URL);
  url.searchParams.set("utm_source", "mon50ccetmoi");
  url.searchParams.set("utm_medium", "app");
  url.searchParams.set("partenaire", broker.PARTNER_CODE);
  return url.toString();
}

/** Lien d'appel direct ; refuse tout numéro qui n'est pas au format international. */
export function buildTelHref(broker = PARTNER_BROKER) {
  if (!/^\+\d{8,15}$/.test(broker.PHONE_E164)) {
    throw new Error("Numéro du cabinet invalide (format +33…).");
  }
  return `tel:${broker.PHONE_E164}`;
}

/**
 * Affiche le bloc du courtier si le partenariat est actif ; sinon le laisse caché.
 * Aucune donnée n'est injectée en HTML : seulement textContent et attributs.
 */
export function initPartnerBroker(doc = document, broker = PARTNER_BROKER) {
  const box = doc.getElementById("partner-broker");
  if (!box) return false;
  if (!broker.ENABLED) {
    box.hidden = true;
    return false;
  }
  const set = (id, text) => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  set("pb-name", broker.NAME);
  set("pb-city", broker.CITY);
  set("pb-orias", broker.ORIAS);
  set("pb-code", broker.PARTNER_CODE);
  set("pb-phone", broker.PHONE_DISPLAY);
  set("pb-benefit", broker.CODE_BENEFIT);

  const quote = doc.getElementById("pb-quote");
  if (quote) quote.setAttribute("href", buildQuoteUrl(broker));
  const call = doc.getElementById("pb-call");
  if (call) call.setAttribute("href", buildTelHref(broker));

  box.hidden = false;
  return true;
}

if (typeof document !== "undefined" && document.getElementById("partner-broker")) {
  initPartnerBroker();
}
