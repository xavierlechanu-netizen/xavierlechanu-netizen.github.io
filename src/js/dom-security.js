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

    const trimmed = actionString.trim();

    // 1.1 Support direct pour les redirections d'URL (ex: window.location.href = 'assureur.html' ou location.href='...')
    const navMatch = trimmed.match(/^(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]\s*;?$/);
    if (navMatch) {
        if (actionElement.tagName === 'A') event.preventDefault();
        window.location.href = navMatch[1];
        return;
    }

    // 1.2 Support pour les instructions simples d'historique ou rechargement
    if (trimmed === 'history.back()' || trimmed === 'window.history.back()') {
        if (actionElement.tagName === 'A') event.preventDefault();
        window.history.back();
        return;
    }
    if (trimmed === 'location.reload()' || trimmed === 'window.location.reload()') {
        if (actionElement.tagName === 'A') event.preventDefault();
        window.location.reload();
        return;
    }

    // 1.3 Regex pour extraire fonction et arguments (ex: doLogin(), toggleForm('register'), alert('...'))
    const match = trimmed.match(/^([a-zA-Z0-9_$.]+)(?:\((.*)\))?;?$/);
    
    if (match) {
        const functionPath = match[1];
        let rawArgs = match[2];
        
        let fn = getAction(functionPath);

        if (typeof fn === 'function') {
            if (actionElement.tagName === 'A' && (actionElement.getAttribute('href') === '#' || !actionElement.getAttribute('href'))) {
                event.preventDefault();
            }

            let parsedArgs = [];
            if (rawArgs && rawArgs.trim().length > 0) {
                // Remplacer 'event' par null si passé explicitement
                rawArgs = rawArgs.replace(/\bevent\b/g, 'null');
                try {
                    parsedArgs = new Function('currentElement', `return (function(){ return [${rawArgs}]; }).call(currentElement);`)(actionElement);
                } catch (e) {
                    try {
                        parsedArgs = new Function(`return [${rawArgs}]`)();
                    } catch (err) {
                        console.warn(`[Event Delegator] Impossible de parser les arguments: ${rawArgs}`);
                    }
                }
            }
            
            try {
                fn.apply(actionElement, parsedArgs);
            } catch (err) {
                console.error(`[Event Delegator] Erreur lors de l'exécution de ${functionPath}:`, err);
            }
        } else {
            console.warn(`[Event Delegator] Action non trouvée: ${functionPath}`);
        }
    } else {
        // 1.4 Support pour les actions conditionnelles (ex: "if(window.GaragePro) GaragePro.initRegistration()")
        const condMatch = trimmed.match(/^if\s*\([^)]+\)\s*([a-zA-Z0-9_$.]+)\((.*)\);?$/);
        if (condMatch) {
            const func = getAction(condMatch[1]);
            if (typeof func === 'function') {
                try {
                    func.call(actionElement);
                } catch (e) {
                    console.error(`[Event Delegator] Erreur action conditionnelle:`, e);
                }
                return;
            }
        }
        console.warn(`[Event Delegator] Action non trouvée: ${trimmed}`);
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
