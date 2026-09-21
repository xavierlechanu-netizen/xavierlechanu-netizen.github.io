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
}

// Support pour les appels namespace (ex: "Auth.login")
export function getAction(path) {
    const parts = path.split('.');
    let fn = Actions;
    for (const part of parts) {
        if (fn) fn = fn[part];
    }
    return fn;
}
