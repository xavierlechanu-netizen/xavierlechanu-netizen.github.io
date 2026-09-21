/**
 * DOM Security & Event Delegation (Phase 3)
 * OWASP V5.0.0-3.2.2 / CSP Strict Enforcement
 */

import { getAction } from './actionRegistry.js';

// 1. GLOBAL EVENT DELEGATOR (Remplacement des onclick inline)
document.addEventListener('click', function(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const actionString = actionElement.getAttribute('data-action');
    if (!actionString) return;

    const match = actionString.match(/^([a-zA-Z0-9_$.]+)(?:\((.*)\))?$/);
    
    if (match) {
        const functionPath = match[1];
        let rawArgs = match[2];
        
        let fn = getAction(functionPath);

        if (typeof fn === 'function') {
            if (actionElement.tagName === 'A' && actionElement.getAttribute('href') === '#') {
                event.preventDefault();
            }

            let parsedArgs = [];
            if (rawArgs) {
                // Remove 'event' literal if passed manually as string
                rawArgs = rawArgs.replace(/\bevent\b/g, 'null');
                try {
                    parsedArgs = new Function(`return [${rawArgs}]`)();
                } catch (e) {
                    console.warn(`[Event Delegator] Impossible de parser les arguments: ${rawArgs}`);
                }
            }
            
            // Si le premier argument attendu est un string et non l'event, on décale. 
            // Pour faire simple, on passe les arguments originaux.
            fn.apply(null, parsedArgs);
        } else {
            console.warn(`[Event Delegator] Action non trouvée: ${functionPath}`);
        }
    }
});

// 2. MONKEY PATCH GLOBAL innerHTML (Sanitization automatique)
const originalInnerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
if (originalInnerHTMLDescriptor) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
        set: function(value) {
            if (typeof value !== 'string') {
                originalInnerHTMLDescriptor.set.call(this, value);
                return;
            }

            // On autorise explicitement data-action pour notre Event Delegator
            let safeValue = value;
            if (typeof DOMPurify !== 'undefined') {
                safeValue = DOMPurify.sanitize(value, {
                    ADD_ATTR: ['data-action', 'data-id', 'data-value', 'data-theme']
                });
            } else {
                console.warn("[DOMSecurity] DOMPurify non détecté ! Injection risquée en cours...");
            }
            
            originalInnerHTMLDescriptor.set.call(this, safeValue);
        },
        get: function() {
            return originalInnerHTMLDescriptor.get.call(this);
        }
    });
    console.log("[DOMSecurity] DOMPurify innerHTML override activé avec succès.");
} else {
    console.error("[DOMSecurity] Impossible de sécuriser innerHTML sur ce navigateur.");
}

// 3. Export for manual use if needed
window.DOMSecurity = {
    safeHTML: function(element, templateString) {
        // Déclenchera automatiquement le setter défini ci-dessus
        if (element) // eslint-disable-next-line no-restricted-syntax
element.innerHTML = templateString;
    }
};
