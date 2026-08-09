/**
 * ============================================================================
 * blackbox_pins.h — Assignation des broches GPIO (Boîte Noire V1)
 * ============================================================================
 * Cible : ESP32-C3-MINI-1
 *
 * SÉCURITÉ : Conformité OWASP A02 (pas de secrets codés en dur).
 *            Conformité CIS Control 4 (configuration sécurisée par défaut).
 * ============================================================================
 */

#ifndef BLACKBOX_PINS_H
#define BLACKBOX_PINS_H

/* ---- Capteurs Anti-Tamper (Non câblés pour le moment) ---- */
#define PIN_TAMPER_LIGHT        -1
#define PIN_TAMPER_MESH         -1

/* ---- Module GPS (Connecté sur IO16 / IO17) ---- */
/** GPS TX → ESP32 RX (IO16) */
#define PIN_GPS_RX              GPIO_NUM_16

/** GPS RX ← ESP32 TX (IO17) */
#define PIN_GPS_TX              GPIO_NUM_17

/** Contrôle alimentation GPS (Non câblé, direct 3V3) */
#define PIN_GPS_POWER           -1

/* ---- UART0 — Réservé flashage initial ---- */
#define PIN_UART0_TX            GPIO_NUM_1
#define PIN_UART0_RX            GPIO_NUM_3

/* ---- LED de statut ---- */
#define PIN_LED_STATUS          -1

/* ---- Détection alimentation externe 12V ---- */
#define PIN_VEXT_SENSE          -1

/* ---- Niveau de batterie LiPo ---- */
#define PIN_VBAT_ADC            -1

/* ---- Capteur IMU (Non câblé pour le moment) ---- */
#define PIN_IMU_SDA             -1
#define PIN_IMU_SCL             -1

#endif /* BLACKBOX_PINS_H */
