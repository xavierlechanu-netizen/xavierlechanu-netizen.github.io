/**
 * @jest-environment node
 *
 * Veille du serveur (24/11/2026) : un SMS au début d'une panne, un rappel toutes les 3 h, un au retour ;
 * jamais un SMS toutes les 5 minutes. Les secrets du workflow, du script et de l'outil de saisie concordent.
 */
const fs = require("fs");
const path = require("path");
const { decide, texte, smsConfigure } = require("../scripts/veille-serveur");

const racine = path.join(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(racine, f), "utf8");
const at = (h, m) => new Date(Date.UTC(2026, 10, 24, h, m));

describe("Quel SMS envoyer ?", () => {
  test("début de panne : un SMS, quelle que soit l'heure (jour et nuit)", () => {
    for (const precedent of ["success", null, "cancelled"]) {
      expect(decide({ pannes: ["le site"], precedent, date: at(3, 17) })).toBe("panne");
    }
  });

  test("panne qui dure : rien toutes les 5 minutes, un rappel toutes les 3 h seulement", () => {
    const d = (h, m) => decide({ pannes: ["l'API (SOS)"], precedent: "failure", date: at(h, m) });
    expect(d(4, 2)).toBeNull();
    expect(d(3, 2)).toBe("rappel");
    expect(d(3, 7)).toBeNull();
    expect(d(6, 0)).toBe("rappel");
    expect(d(7, 0)).toBeNull();
  });

  test("retour : un seul SMS « de nouveau en ligne », puis le silence", () => {
    expect(decide({ pannes: [], precedent: "failure", date: at(10, 0) })).toBe("retabli");
    expect(decide({ pannes: [], precedent: "success", date: at(10, 5) })).toBeNull();
    expect(decide({ pannes: [], precedent: null, date: at(10, 10) })).toBeNull();
  });
});

describe("SMS facultatif", () => {
  test("sans ses secrets, pas de SMS (l'e-mail de GitHub prévient) ; avec, oui", () => {
    expect(smsConfigure({})).toBe(false);
    expect(smsConfigure({ OVH_SMS_APP_KEY: "k" })).toBe(false);
    expect(smsConfigure({ OVH_SMS_APP_KEY: "k", ALERTE_SMS_NUMERO: "0612345678" })).toBe(true);
  });
});

describe("Textes", () => {
  test("nomment ce qui est en panne et tiennent dans un SMS (160 caractères, sans accent)", () => {
    for (const sorte of ["panne", "rappel", "retabli", "essai"]) {
      const t = texte(sorte, ["le site", "l'API (SOS)"]);
      expect(t.length).toBeLessThanOrEqual(160);
      expect(t).not.toMatch(/[^\x20-\x7E]/);
    }
    expect(texte("panne", ["l'API (SOS)"])).toMatch(/API/);
  });
});

describe("Branchement", () => {
  const workflow = lire(".github/workflows/veille-serveur.yml");

  test("le workflow lance le script avec ses 5 secrets, sans autre service que GitHub et OVHcloud", () => {
    expect(workflow).toMatch(/run: node scripts\/veille-serveur\.js/);
    expect(workflow).toMatch(/cron: "\*\/5 \* \* \* \*"/);
    expect(workflow).not.toMatch(/ntfy/i);
    for (const nom of ["OVH_SMS_APP_KEY", "OVH_SMS_APP_SECRET", "OVH_SMS_CONSUMER_KEY", "OVH_SMS_SERVICE", "ALERTE_SMS_NUMERO"]) {
      expect(workflow).toContain(`secrets.${nom}`);
      expect(lire("sovereign-core/deploy/windows/saisir-cles-github.ps1")).toContain(nom);
    }
  });

  test("l'outil de saisie n'écrit ni n'affiche rien : entrée standard de gh, jamais en argument", () => {
    const ps1 = lire("sovereign-core/deploy/windows/saisir-cles-github.ps1");
    expect(ps1).toMatch(/RedirectStandardInput = \$true/);
    expect(ps1).not.toMatch(/--body|-b \$/);
    expect(ps1).toMatch(/-AsSecureString/);
  });
});
