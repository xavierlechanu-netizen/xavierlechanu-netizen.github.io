# Performance Baseline - Sprint 0 (Octobre 2026)

## Build (dist/assets)
- `vendor-firebase-*.js` : 726.69 kB (gzip: 212.41 kB)
- `app-*.js` : 552.39 kB (gzip: 160.98 kB)

## Objectifs Sprint 2 (Lazy-loading & Firebase modular)
- Remplacer le Firebase compat massif par les imports modulaires. Cible `vendor-firebase` : ~250 kB.
- Découper `app.html` et implémenter des imports dynamiques. Cible `app` initial : < 350 kB.
