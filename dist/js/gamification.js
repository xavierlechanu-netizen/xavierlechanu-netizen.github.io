/**
 * GAMIFICATION ENGINE
 * Gère l'expérience (XP), les Rangs et l'affichage des Avatars.
 */

window.Gamification = {
    xp: 0,
    RANKS: [
        { name: "Novice", minXp: 0, icon: "fa-motorcycle", color: "#a0a0a0" }, // Casque standard
        { name: "Explorateur", minXp: 500, icon: "fa-compass", color: "#00d2ff" }, // Casque Jet
        { name: "Vétéran", minXp: 2000, icon: "fa-shield-halved", color: "#ffaa00" }, // Intégral Carbone
        { name: "Légende 50cc", minXp: 5000, icon: "fa-crown", color: "#ffcf00" } // Couronne Or
    ],
    
    init: function() {
        // Chargement local
        this.xp = parseInt(localStorage.getItem('mon50cc_xp')) || 0;
        this.updateHUD();
    },

    getCurrentRank: function() {
        let current = this.RANKS[0];
        for (let i = 0; i < this.RANKS.length; i++) {
            if (this.xp >= this.RANKS[i].minXp) {
                current = this.RANKS[i];
            }
        }
        return current;
    },

    getNextRank: function() {
        for (let i = 0; i < this.RANKS.length; i++) {
            if (this.xp < this.RANKS[i].minXp) {
                return this.RANKS[i];
            }
        }
        return null; // Niveau Max atteint
    },

    /**
     * Attribue de l'XP à la fin d'une action (ex: Roadbook)
     */
    awardXP: function(baseXP, context = {}) {
        let totalXp = baseXP;
        let reasons = [];

        // 1. Bonus Conduite Prudente (Driving Score > 80)
        let drivingScore = window.DrivingScore ? window.DrivingScore.currentScore : 100;
        if (drivingScore >= 80) {
            totalXp += 50;
            reasons.push("Conduite Prudente (+50)");
        }

        // 2. Bonus Communauté (Ghost Mode désactivé)
        let ghostMode = window.RadarSocial ? window.RadarSocial.isGhostMode : true;
        if (!ghostMode) {
            totalXp += 20;
            reasons.push("Partage Communauté (+20)");
        }

        // 3. Multiplicateur Boîte Noire (Si le boîtier physique est connecté)
        let blackboxConnected = document.getElementById('bb-batt') && document.getElementById('bb-batt').innerText !== '-- mV';
        if (blackboxConnected) {
            totalXp *= 2;
            reasons.push("Bonus Boîte Noire (x2)");
        }

        const oldRank = this.getCurrentRank();
        this.xp += totalXp;
        localStorage.setItem('mon50cc_xp', this.xp.toString());
        
        // Sauvegarde Cloud si connecté
        this.syncToCloud();

        const newRank = this.getCurrentRank();

        // Animation de Récompense
        this.showRewardAnimation(totalXp, reasons);

        if (newRank.name !== oldRank.name) {
            this.showLevelUpAnimation(newRank);
        }

        this.updateHUD();
    },

    syncToCloud: function() {
        if (typeof firebase !== 'undefined' && firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser) {
            try {
                const db = firebase.firestore();
                db.collection('users').doc(firebase.auth().currentUser.uid).set({
                    gamification: {
                        xp: this.xp,
                        rank: this.getCurrentRank().name
                    }
                }, { merge: true });
            } catch(e) {
                console.warn("Gamification: Firestore sync failed", e);
            }
        }
    },

    updateHUD: function() {
        const hud = document.getElementById('gamification-hud');
        if (!hud) return;

        const rank = this.getCurrentRank();
        const nextRank = this.getNextRank();

        document.getElementById('gami-icon').className = `fa-solid ${rank.icon}`;
        document.getElementById('gami-icon').style.color = rank.color;
        document.getElementById('gami-rank-name').innerText = rank.name;
        document.getElementById('gami-xp-text').innerText = `${this.xp} XP`;

        const bar = document.getElementById('gami-progress-bar');
        if (nextRank) {
            const range = nextRank.minXp - rank.minXp;
            const progress = this.xp - rank.minXp;
            const percent = Math.min(100, Math.max(0, (progress / range) * 100));
            bar.style.width = `${percent}%`;
        } else {
            bar.style.width = '100%';
            bar.style.backgroundColor = '#ffcf00'; // Gold pour niveau max
        }
    },

    showRewardAnimation: function(xpGained, reasons) {
        // Petite pop-up temporaire
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.top = '30%';
        toast.style.left = '50%';
        toast.style.transform = 'translate(-50%, -50%)';
        toast.style.background = 'rgba(0, 210, 255, 0.9)';
        toast.style.color = '#fff';
        toast.style.padding = '20px';
        toast.style.borderRadius = '15px';
        toast.style.zIndex = '10005';
        toast.style.textAlign = 'center';
        toast.style.boxShadow = '0 0 20px rgba(0, 210, 255, 0.5)';
        toast.style.fontFamily = "'Inter', sans-serif";
        toast.style.transition = 'opacity 0.5s';
        
        toast.innerHTML = `
            <h2 style="margin: 0 0 10px; font-size: 2rem;">+${xpGained} XP !</h2>
            <div style="font-size: 0.9rem; opacity: 0.9;">
                ${reasons.join('<br>')}
            </div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    },

    showLevelUpAnimation: function(newRank) {
        // Simple pop-up for level up
        alert(`Félicitations ! Vous avez atteint le rang : ${newRank.name} !`);
    }
};

// Auto-init
window.addEventListener('DOMContentLoaded', () => {
    // Petit délai pour s'assurer que le HUD HTML est chargé
    setTimeout(() => {
        window.Gamification.init();
    }, 500);
});
