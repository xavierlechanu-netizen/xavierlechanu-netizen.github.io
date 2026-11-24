/**
 * @jest-environment jsdom
 *
 * « Petit Stop » (Garage du Petit Fontenay) : éteint tant que le garage n'a pas accepté par écrit ;
 * allumé, un marqueur avec un panneau qui raconte, sans HTML injecté et sans promettre de service.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.resolve(__dirname, "../src/js/petit-stop.js");

function loadModule() {
  const code = fs.readFileSync(SRC, "utf8").replace(/export\s+/g, "")
    + "\n;({ PETIT_STOP, buildPetitStopPopup, initPetitStop })";
  return vm.runInNewContext(code, { document, Object, console });
}

/** Leaflet minimal : enregistre ce qu'on lui demande. */
function fakeLeaflet() {
  const calls = { markers: [] };
  const L = {
    divIcon: (o) => o,
    marker: (latlng, opts) => {
      const m = { latlng, opts, addTo: (map) => { m.map = map; return m; }, bindPopup: (node) => { m.popup = node; return m; } };
      calls.markers.push(m);
      return m;
    },
  };
  return { L, calls };
}

describe("Petit Stop", () => {
  const M = loadModule();

  test("livré éteint : aucun marqueur tant que le garage n'a pas accepté par écrit", () => {
    expect(M.PETIT_STOP.ENABLED).toBe(false);
    const { L, calls } = fakeLeaflet();
    expect(M.initPetitStop({ map: {}, L })).toBe(false);
    expect(calls.markers).toHaveLength(0);
  });

  test("allumé : un marqueur au garage, avec la distance annoncée et sans promesse de service", () => {
    const { L, calls } = fakeLeaflet();
    const map = {};
    expect(M.initPetitStop({ map, L, stop: { ...M.PETIT_STOP, ENABLED: true } })).toBe(true);
    const [marker] = calls.markers;
    expect(marker.latlng).toEqual([48.516713, 4.513603]);
    expect(marker.map).toBe(map);
    const text = marker.popup.textContent;
    expect(text).toMatch(/Garage du Petit Fontenay/);
    expect(text).toMatch(/environ 15 km/);
    expect(text).toMatch(/Ce n'est pas un service de dépannage/);
  });

  test("sans carte ou sans Leaflet : rien, sans erreur", () => {
    expect(M.initPetitStop({ stop: { ...M.PETIT_STOP, ENABLED: true } })).toBe(false);
    expect(M.initPetitStop({ map: {}, L: null, stop: { ...M.PETIT_STOP, ENABLED: true } })).toBe(false);
  });

  test("le panneau n'est que du texte : une balise dans un champ ne devient pas du HTML", () => {
    const node = M.buildPetitStopPopup({ ...M.PETIT_STOP, NAME: "<img src=x onerror=alert(1)>" });
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toContain("<img src=x");
  });

  test("la page de la carte charge le module", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../src/app.html"), "utf8");
    expect(html).toMatch(/src="\/js\/petit-stop\.js"/);
  });
});
