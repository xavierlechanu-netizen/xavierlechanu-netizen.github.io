/**
 * @jest-environment jsdom
 *
 * Bouton « Trouver mon assurance » (courtier partenaire, mise en relation simple).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.resolve(__dirname, "../src/js/partner-broker.js");

/** Charge le module ES dans un bac à sable (même méthode que les autres tests du front). */
function loadModule() {
  const code = fs.readFileSync(SRC, "utf8").replace(/export\s+/g, "")
    + "\n;({ PARTNER_BROKER, buildQuoteUrl, buildTelHref, initPartnerBroker })";
  return vm.runInNewContext(code, { document, URL, Object, Error });
}

function mountMarkup() {
  const html = `<div id="partner-broker" hidden>
    <strong id="pb-name"></strong><span id="pb-city"></span><strong id="pb-code"></strong>
    <strong id="pb-benefit"></strong><a id="pb-quote"></a>
    <a id="pb-call"><span id="pb-phone"></span></a><span id="pb-orias"></span></div>`;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren(...parsed.body.childNodes);
}

describe("Courtier partenaire", () => {
  let M;
  beforeEach(() => {
    mountMarkup();
    M = loadModule();
  });

  test("masqué tant que la convention n'est pas signée (réglage livré à false)", () => {
    expect(M.PARTNER_BROKER.ENABLED).toBe(false);
    expect(M.initPartnerBroker(document)).toBe(false);
    expect(document.getElementById("partner-broker").hidden).toBe(true);
  });

  test("une fois activé : nom, code partenaire, avantage, lien de devis et appel corrects", () => {
    const broker = { ...M.PARTNER_BROKER, ENABLED: true };
    expect(M.initPartnerBroker(document, broker)).toBe(true);
    expect(document.getElementById("partner-broker").hidden).toBe(false);
    expect(document.getElementById("pb-name").textContent).toBe("National Assurance Courtage");
    expect(document.getElementById("pb-code").textContent).toBe("mon50ccetmoi.com");
    expect(document.getElementById("pb-benefit").textContent).toBe("frais de dossier réduits");
    expect(document.getElementById("pb-orias").textContent).toBe("23003285");
    expect(document.getElementById("pb-call").getAttribute("href")).toBe("tel:+33184807464");
    const quote = new URL(document.getElementById("pb-quote").getAttribute("href"));
    expect(quote.origin).toBe("https://www.nacourtage.com");
    expect(quote.searchParams.get("partenaire")).toBe("mon50ccetmoi.com");
    expect(quote.searchParams.get("utm_source")).toBe("mon50ccetmoi");
  });

  test("aucun HTML injecté : un nom piégé reste du texte", () => {
    const broker = { ...M.PARTNER_BROKER, ENABLED: true, NAME: "<img src=x onerror=alert(1)>" };
    M.initPartnerBroker(document, broker);
    expect(document.querySelector("#pb-name img")).toBeNull();
    expect(document.getElementById("pb-name").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  test("numéro de téléphone invalide refusé", () => {
    expect(() => M.buildTelHref({ ...M.PARTNER_BROKER, PHONE_E164: "javascript:alert(1)" })).toThrow();
    expect(M.buildQuoteUrl()).toMatch(/^https:\/\/www\.nacourtage\.com\/\?/);
  });

  test("la page n'affiche plus de fausse offre (prix, remise, « Souscrire »)", () => {
    const html = fs.readFileSync(path.join(__dirname, "../src/insurance.html"), "utf8");
    expect(html).not.toMatch(/19\.99/);
    expect(html).not.toMatch(/Souscrire maintenant/);
    expect(html).not.toMatch(/Nationale de Courtage/);
    expect(html).toMatch(/id="partner-broker" hidden/);
  });
});
