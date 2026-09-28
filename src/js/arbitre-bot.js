import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

/**
 * L ARBITRE DE LA ROUTE - Logic System (MULTILINGUAL & INTERNATIONAL)
 * Based on French Law, EU Directives, and Vienna Convention.
 *
 * CONFORMITE GOOGLE PLAY - Misleading Claims Policy :
 * - Cette application N EST PAS une entite gouvernementale.
 * - Chaque reponse inclut un lien vers la source officielle du gouvernement.
 * - Sources officielles : legifrance.gouv.fr (FR), eur-lex.europa.eu (EU),
 *   unece.org (UNECE)
 */

window.processArbitreQuery = async function (query) {
  const q = query.toLowerCase();
  const lang = window.currentLang || "fr";

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // ─── DISCLAIMER GOOGLE PLAY COMPLIANT ─────────────────────────────────────
  // Obligatoire : application independante, non affiliee au gouvernement,
  // avec lien vers la source officielle. (Google Play Misleading Claims Policy)
  const DISCLAIMER_FR =
    '<br><br><div style="background:rgba(255,183,3,0.08);border:1px solid rgba(255,183,3,0.3);border-radius:8px;padding:8px 12px;margin-top:10px;font-size:0.72rem;color:#aaa;font-family:Inter,sans-serif;">' +
    '&#x26A0;&#xFE0F; <strong style="color:#ffb703;">Application independante &mdash; Non affiliee au gouvernement.</strong> ' +
    'Ces informations sont fournies a titre indicatif, basees sur les textes officiels du Code de la Route. Elles ne constituent pas un conseil juridique professionnel. ' +
    'Source officielle : <a href="https://www.legifrance.gouv.fr" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">legifrance.gouv.fr</a>' +
    '</div>';

  const DISCLAIMER_EN =
    '<br><br><div style="background:rgba(255,183,3,0.08);border:1px solid rgba(255,183,3,0.3);border-radius:8px;padding:8px 12px;margin-top:10px;font-size:0.72rem;color:#aaa;font-family:Inter,sans-serif;">' +
    '&#x26A0;&#xFE0F; <strong style="color:#ffb703;">Independent app &mdash; Not affiliated with any government entity.</strong> ' +
    'This information is provided for guidance only, based on official legal texts. It does not constitute professional legal advice. ' +
    'Official sources: <a href="https://eur-lex.europa.eu" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">eur-lex.europa.eu</a> | ' +
    '<a href="https://www.legifrance.gouv.fr" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">legifrance.gouv.fr</a>' +
    '</div>';

  // Content Database - each entry cites the official government source URL
  const legalContent = {
    fr: {
      disclaimer: DISCLAIMER_FR,
      notFound: '<strong>Verdict de l\'Arbitre :</strong> Je n\'ai pas trouve de texte de loi specifique.<br><br>&#x1F50D; <em>Precisez (ex: gants, casque, debridage...).</em>',
      scenarios: [
        {
          keywords: ["accident", "debride", "assurance", "responsable"],
          response: '<strong>&#x26A0;&#xFE0F; CAS CRITIQUE : Accident &amp; Conformite</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Loi :</strong> <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006797194" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. L211-1 Code des Assurances</a> (Legifrance).<br>' +
            '&#x1F30D; <strong>International :</strong> Directive 2009/103/CE &mdash; <a href="https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32009L0103" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">EUR-Lex</a>.<br>' +
            '&#x1F539; <strong>Verdict :</strong> L\'assureur peut exercer un "Droit de Recours" et vous reclamer le remboursement des dommages verses aux tiers.',
        },
        {
          keywords: ["debridage", "vitesse", "45", "km/h", "moteur"],
          response: '<strong>&#x1F680; REGLE : Vitesse &amp; Categorie AM (45 km/h)</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Loi :</strong> <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006841443" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. R311-1 du Code de la Route</a> (Legifrance).<br>' +
            '&#x1F30D; <strong>International :</strong> <a href="https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32006L0126" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Directive 2006/126/CE</a> (EUR-Lex) : categorie AM limitee a <strong>45 km/h</strong>.<br>' +
            '&#x1F539; <strong>Sanction :</strong> Amende (135 EUR en FR) et confiscation du vehicule.',
        },
        {
          keywords: ["casque", "gants", "protection", "homologue", "ce"],
          response: '<strong>&#x1FAA6; EQUIPEMENT : Normes de securite</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Loi :</strong> <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033399483" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. R431-1 et R431-1-2 du Code de la Route</a> (Legifrance).<br>' +
            '&#x1F30D; <strong>International :</strong> Norme <a href="https://www.unece.org/trans/main/wp29/wp29regs1-20.html" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;"><strong>ECE 22.06</strong></a> (UNECE) pour les casques et <strong>EN 13594</strong> pour les gants.<br>' +
            '&#x1F539; <strong>Obligation :</strong> Le marquage CE est obligatoire pour circuler en Europe.',
        },
        {
          keywords: ["controle technique", "ct", "visite"],
          response: '<strong>&#x1F527; REGLEMENTATION : Controle Technique</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>France :</strong> Obligatoire depuis le 15 avril 2024 &mdash; <a href="https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047342064" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Decret n°2023-283</a> (Legifrance).<br>' +
            '&#x1F30D; <strong>International :</strong> <a href="https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32014L0045" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Directive 2014/45/UE</a> (EUR-Lex).<br>' +
            '&#x1F539; <strong>Defaut :</strong> Amende de 135 EUR et immobilisation.',
        },
        {
          keywords: ["interfiles", "remontee", "file"],
          response: '<strong>&#x1F6E3;&#xFE0F; REGLE : Circulation Inter-Files</strong><br><br>' +
            '&#x1F30D; <strong>Convention de Vienne :</strong> Le depassement doit se faire par la gauche.<br>' +
            '&#x2696;&#xFE0F; <strong>Specificite France :</strong> La CIF est en experimentation sur certaines voies rapides (50 km/h max). Interdite partout ailleurs &mdash; <a href="https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006177101" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. R412 et suivants</a> (Legifrance).',
        },
        {
          keywords: ["pot", "echappement", "bruit", "chicane", "db"],
          response: '<strong>&#x1F50A; NUISANCE : Echappement &amp; Bruit</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Loi :</strong> <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006841770" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. R318-3 du Code de la Route</a> (Legifrance).<br>' +
            '&#x1F539; <strong>Regle :</strong> Tout dispositif reduisant le bruit (chicane) doit etre present. Amende de 135 EUR et immobilisation possible.',
        },
        {
          keywords: ["passager", "duo", "place", "selle"],
          response: '<strong>&#x1F465; DUO : Transport d\'un passager</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Loi :</strong> <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033399496" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. R431-5 du Code de la Route</a> (Legifrance).<br>' +
            '&#x1F539; <strong>Condition :</strong> Le cyclomoteur doit posseder une selle biplace et des repose-pieds. Le passager doit obligatoirement porter un casque et des gants homologues.',
        },
        {
          keywords: ["feu", "eclairage", "phare", "clignotant"],
          response: '<strong>&#x1F4A1; VISIBILITE : Eclairage obligatoire</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Loi :</strong> <a href="https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006177076" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. R313-1 a R313-32 du Code de la Route</a> (Legifrance).<br>' +
            '&#x1F539; <strong>Obligation :</strong> Feux de croisement allumes de jour comme de nuit. Tout feu non fonctionnel est passible d\'une contravention de 3eme classe (68 EUR).',
        },
        {
          keywords: ["autocollant", "reflechissant", "nuit"],
          response: '<strong>&#x2728; SECURITE : Stickers reflechissants</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Loi :</strong> <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033399483" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. R431-1 du Code de la Route</a> (Legifrance) et homologation ECE 22.05/22.06.<br>' +
            '&#x1F539; <strong>Regle :</strong> 4 stickers reflechissants (un sur chaque face) sont obligatoires sur le casque. Absence = 3 points de moins et 135 EUR d\'amende.',
        },
        {
          keywords: ["telephone", "ecouteur", "musique", "kit", "main libre"],
          response: '<strong>&#x1F4F1; USAGE : Telephone et Ecouteurs</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Loi :</strong> <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000034680155" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">Art. R412-6-1 du Code de la Route</a> (Legifrance).<br>' +
            '&#x1F539; <strong>Interdiction :</strong> Tout dispositif porte a l\'oreille (ecouteurs, casque audio) est interdit. Seuls les systemes integres au casque (Bluetooth) sont toleres.',
        },
      ],
    },
    en: {
      disclaimer: DISCLAIMER_EN,
      notFound: '<strong>Referee\'s Verdict:</strong> I couldn\'t find a specific law for this.<br><br>&#x1F50D; <em>Please clarify (e.g., helmet, gloves, tuning...).</em>',
      scenarios: [
        {
          keywords: ["accident", "tuned", "insurance", "liable"],
          response: '<strong>&#x26A0;&#xFE0F; CRITICAL CASE: Accident &amp; Compliance</strong><br><br>' +
            '&#x2696;&#xFE0F; <strong>Law:</strong> <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0103" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">EU Directive 2009/103/EC</a> (EUR-Lex).<br>' +
            '&#x1F30D; <strong>International:</strong> Modifying performance voids the vehicle\'s type-approval (homologation) worldwide.<br>' +
            '&#x1F539; <strong>Verdict:</strong> The insurer may exercise a "Right of Recourse" and demand you repay all damages paid to third parties.',
        },
        {
          keywords: ["tuning", "speed", "45", "km/h", "unrestricted"],
          response: '<strong>&#x1F680; RULE: Speed &amp; AM Category</strong><br><br>' +
            '&#x1F30D; <strong>International:</strong> <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0126" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">EU Directive 2006/126/EC</a> (EUR-Lex): AM category strictly limited to <strong>45 km/h (28 mph)</strong>.<br>' +
            '&#x1F539; <strong>Sanction:</strong> Heavy fines and vehicle impoundment in most countries.',
        },
        {
          keywords: ["helmet", "gloves", "protection", "certified", "ce"],
          response: '<strong>&#x1FAA6; EQUIPMENT: Safety Standards</strong><br><br>' +
            '&#x1F30D; <strong>International:</strong> <a href="https://www.unece.org/trans/main/wp29/wp29regs1-20.html" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;"><strong>ECE 22.06</strong></a> (UNECE) standard for helmets and <strong>EN 13594</strong> for gloves.<br>' +
            '&#x1F539; <strong>Obligation:</strong> CE marking is mandatory for riding in Europe and many international territories.',
        },
        {
          keywords: ["inspection", "technical", "mot"],
          response: '<strong>&#x1F527; REGULATION: Technical Inspection</strong><br><br>' +
            '&#x1F30D; <strong>International:</strong> <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0045" target="_blank" rel="noopener noreferrer" style="color:#00f0ff;text-decoration:underline;">EU Directive 2014/45/EU</a> (EUR-Lex) mandating roadworthiness tests for powered two-wheelers.<br>' +
            '&#x1F539; <strong>Note:</strong> Rules vary by country (e.g., MOT in UK, CT in France). Always check local dates.',
        },
      ],
    },
  };

  // Fallback logic for other languages (use English as base)
  const content = legalContent[lang] || legalContent["en"];

  // Search for match
  for (const entry of content.scenarios) {
    if (entry.keywords.some((k) => q.includes(k))) {
      return entry.response + content.disclaimer;
    }
  }

  return content.notFound + content.disclaimer;
};