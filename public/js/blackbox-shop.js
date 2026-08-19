/**
 * BLACK BOX SHOP - Gestion des Ventes de Boîtiers Matériels
 * Intégration Tarification Dynamique et Garantie à Vie.
 */

window.BlackBoxShop = {
  // Configuration des prix
  pricing: {
    first10: 49.99, // Offre lancement (garantie à vie)
    standard: 89.99, // Tarif classique
    duo: 161.98, // Pack Duo (standard x2 remisé, sans garantie)
  },

  // Stock et statistiques
  salesCount: 0,
  maxPrototypeLifetime: 10,

  /**
   * Initialisation : Récupérer le nombre de ventes depuis Firestore
   */
  init: async function () {
    try {
      if (typeof db !== "undefined") {
        const statsRef = db.collection("stats").doc("blackbox_sales");
        const doc = await statsRef.get();
        
        if (doc.exists) {
          this.salesCount = doc.data().count || 0;
        } else {
          await statsRef.set({ count: 0 });
          this.salesCount = 0;
        }
      } else {
        this.salesCount = parseInt(localStorage.getItem('sim_bb_sales') || '0');
      }
      this.updateUI();
    } catch (error) {
      console.warn("Erreur chargement stats Black Box", error);
    }
  },

  /**
   * Met à jour l'interface avec le bon prix
   */
  updateUI: function () {
    const isPromo = this.salesCount < this.maxPrototypeLifetime;
    const currentPrice = isPromo ? this.pricing.first10 : this.pricing.standard;
    const remaining = Math.max(0, this.maxPrototypeLifetime - this.salesCount);

    const btnUnit = document.getElementById("bb-buy-unit-btn");
    if (btnUnit) {
        if (isPromo) {
            btnUnit.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Commander (${currentPrice.toFixed(2).replace('.', ',')} €) - Reste ${remaining} Protos`;
        } else {
            btnUnit.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Commander ma Boîte Noire (${currentPrice.toFixed(2).replace('.', ',')} €)`;
        }
    }
  },

  /**
   * Achat Unitaire
   */
  buyUnit: async function () {
    const isPromo = this.salesCount < this.maxPrototypeLifetime;
    const price = isPromo ? this.pricing.first10 : this.pricing.standard;
    const msg = isPromo 
      ? `Offre de Lancement ! Vous achetez un Prototype garanti à vie.\nMontant: ${price} €\nConfirmer le paiement ?` 
      : `Achat Boîte Noire Standard.\nMontant: ${price} €\nConfirmer le paiement ?`;

    if (confirm(msg)) {
      await this.processPayment("UNIT", price, isPromo);
    }
  },

  /**
   * Achat Pack Duo
   */
  buyPack: async function () {
    const price = this.pricing.duo;
    if (confirm(`Achat Pack Duo (2 Boîtiers Standard).\nMontant: ${price} €\nConfirmer le paiement ?`)) {
      await this.processPayment("DUO", price, false); // Pas de garantie à vie pour le Duo
    }
  },

  /**
   * Processus d'achat
   */
  processPayment: async function (type, amount, isLifetimeGuaranteed) {
    // 1. Simulation du SDK Paiement (Stripe / Revolut)
    alert(`[Paiement Simulé] Transaction de ${amount} € validée avec succès !`);

    // 2. Enregistrement Firestore
    try {
        const userId = window.session?.uid || 'guest_' + Date.now();
        const quantity = type === "DUO" ? 2 : 1;
        
        if (typeof db !== "undefined") {
            const batch = db.batch();
            
            // a) Historique des ventes
            const orderRef = db.collection("blackbox_sales").doc();
            batch.set(orderRef, {
                userId: userId,
                type: type,
                amount: amount,
                quantity: quantity,
                lifetimeWarranty: isLifetimeGuaranteed,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            // b) Incrément du compteur global (Agrégation)
            const statsRef = db.collection("stats").doc("blackbox_sales");
            batch.update(statsRef, {
                count: firebase.firestore.FieldValue.increment(quantity)
            });

            await batch.commit();
        } else {
            // Local fallback
            this.salesCount += quantity;
            localStorage.setItem('sim_bb_sales', this.salesCount);
        }

        // 3. Félicitations
        if (isLifetimeGuaranteed) {
            alert("✅ Félicitations ! Votre prototype est enregistré. Il bénéficie de la GARANTIE À VIE.");
        } else {
            alert("✅ Commande confirmée ! Vos boîtiers seront expédiés sous 48h.");
        }

        // Mise à jour de l'UI
        if (typeof db !== "undefined") {
            await this.init(); // Recharger le compteur exact depuis le serveur
        } else {
            this.updateUI();
        }

    } catch (err) {
        console.error("Erreur de transaction :", err);
        alert("Erreur lors de l'enregistrement de la commande.");
    }
  },

  /**
   * Abonnement Premium
   */
  subscribePremium: async function () {
    if (confirm("Abonnement Premium (1er mois) - 4,99 €\nConfirmer l'abonnement ?")) {
      alert(`[Paiement Simulé] Abonnement Premium validé avec succès !`);
      if (window.session) {
        window.session.isPremium = true;
        localStorage.setItem("session", JSON.stringify(window.session));
      }
    }
  }
};

// Initialisation automatique si la page charge
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("blackbox-shop-section")) {
        BlackBoxShop.init();
    }
});
