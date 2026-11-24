/**
 * « Petit Stop » : un clin d'œil sur la carte, au Garage du Petit Fontenay (Pars-lès-Chavanges, Aube), qui a
 * dépanné le fondateur en essence en juillet 2025, en pleine campagne. Le panneau raconte, il ne promet aucun service.
 *
 * ⚠️ Éteint tant que le garage n'a pas accepté PAR ÉCRIT d'être affiché sur la carte : son accord oral (23/11/2026)
 * couvre seulement la citation de son nom. Ce jour-là : passer ENABLED à true, monter CACHE_NAME (sw.js), publier.
 *
 * Distance : la station la plus proche (Brienne-le-Château, base officielle des stations) est à 13 km à vol d'oiseau,
 * environ 15 km par la route (24/11/2026).
 */

export const PETIT_STOP = Object.freeze({
  ENABLED: false,
  NAME: "Garage du Petit Fontenay",
  PLACE: "Pars-lès-Chavanges (Aube)",
  LAT: 48.516713,
  LNG: 4.513603,
  STORY: "En juillet 2025, ce garage a dépanné notre fondateur en essence, en pleine campagne.",
  NEXT_STATION: "La prochaine station est à environ 15 km (Brienne-le-Château).",
  ADVICE: "Ce n'est pas un service de dépannage : fais ton plein avant de t'aventurer dans la campagne.",
});

/** Contenu de la fenêtre du marqueur : uniquement du texte (textContent), jamais de HTML. */
export function buildPetitStopPopup(stop = PETIT_STOP, doc = document) {
  const box = doc.createElement("div");
  const title = doc.createElement("strong");
  title.textContent = `⛽ Petit Stop : ${stop.NAME}`;
  const place = doc.createElement("div");
  place.textContent = stop.PLACE;
  const story = doc.createElement("p");
  story.textContent = `${stop.STORY} ${stop.NEXT_STATION}`;
  const advice = doc.createElement("small");
  advice.textContent = stop.ADVICE;
  box.append(title, place, story, advice);
  return box;
}

/** Pose le marqueur si le Petit Stop est actif ; renvoie vrai s'il l'a posé. `map` et `L` : Leaflet. */
export function initPetitStop({ map, L, stop = PETIT_STOP, doc = document } = {}) {
  if (!stop.ENABLED || !map || !L) return false;
  const icon = L.divIcon({
    html: '<div style="font-size:22px; line-height:32px; text-align:center;">⛽</div>',
    className: "petit-stop-marker",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
  L.marker([stop.LAT, stop.LNG], { icon, title: `Petit Stop : ${stop.NAME}` })
    .addTo(map)
    .bindPopup(buildPetitStopPopup(stop, doc));
  return true;
}

// La carte se crée un peu après le chargement de la page : on l'attend (30 s au plus), sans rien faire si éteint.
if (typeof window !== "undefined" && PETIT_STOP.ENABLED) {
  let tries = 0;
  const wait = setInterval(() => {
    if ((window.map && window.L && initPetitStop({ map: window.map, L: window.L })) || ++tries >= 30) clearInterval(wait);
  }, 1000);
}
