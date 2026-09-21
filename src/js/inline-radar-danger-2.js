import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';
import { registerAction } from './actionRegistry.js';

// Pré-rendu des types de danger (avant l'init de la carte)
      const TYPES_PRE = [
        { id: 'POTHOLE',    icon: '🕳️', label: 'Nid-de-poule' },
        { id: 'GRAVEL',     icon: '⚠️', label: 'Gravillons' },
        { id: 'SLIPPERY',   icon: '🌧️', label: 'Glissant' },
        { id: 'ROADWORKS',  icon: '🚧', label: 'Travaux' },
        { id: 'ACCIDENT',   icon: '🚨', label: 'Accident' },
        { id: 'BLIND_SPOT', icon: '🚛', label: 'Angle mort' },
        { id: 'POLICE',     icon: '👮', label: 'Contrôle' },
        { id: 'ANIMAL',     icon: '🦊', label: 'Animal' },
      ];
      const grid = document.getElementById('types-grid');
      if (grid) {
        // eslint-disable-next-line no-restricted-syntax
grid.innerHTML = TYPES_PRE.map(t => `
          <button class="type-btn" data-id="${t.id}" data-action="selectDangerType('${t.id}')">
            <span class="t-icon">${t.icon}</span>
            <span class="t-label">${t.label}</span>
          </button>
        `).join('');
      }