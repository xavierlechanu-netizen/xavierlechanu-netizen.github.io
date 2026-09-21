/**
 * Action Registry
 * Permet de remplacer l'usage de 'window' pour l'Event Delegator (dom-security.js).
 * En mode ES Modules, les fonctions ne sont plus attachées à window par défaut.
 * Chaque module doit enregistrer ses fonctions publiques ici via registerAction().
 */

export const Actions = {};

export function registerAction(name, fn) {
    if (typeof fn !== 'function') {
        console.warn(`[ActionRegistry] Tentative d'enregistrement d'une action invalide : ${name}`);
        return;
    }
    Actions[name] = fn;
    if (typeof window !== 'undefined' && !window[name]) {
        try {
            window[name] = fn;
        } catch (e) {}
    }
}

// Support pour les appels namespace (ex: "Auth.login" ou fonction globale "window.doLogin")
export function getAction(path) {
    if (!path || typeof path !== 'string') return undefined;
    const parts = path.trim().split('.');
    
    // 1. Chercher dans Actions
    let fn = Actions;
    let ctx = Actions;
    for (const part of parts) {
        if (fn != null) {
            ctx = fn;
            fn = fn[part];
        } else {
            fn = undefined;
            break;
        }
    }
    if (typeof fn === 'function') return fn.bind(ctx);

    // 2. Fallback transparent sur window (OWASP & standard JS compatibility)
    if (typeof window !== 'undefined') {
        let winFn = window;
        let winCtx = window;
        for (const part of parts) {
            if (winFn != null) {
                winCtx = winFn;
                winFn = winFn[part];
            } else {
                winFn = undefined;
                break;
            }
        }
        if (typeof winFn === 'function') return winFn.bind(winCtx);
    }

    return undefined;
}

if (typeof window !== 'undefined') {
    window.Actions = Actions;
    window.registerAction = registerAction;
    window.getAction = getAction;
}

