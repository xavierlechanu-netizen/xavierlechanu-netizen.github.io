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

/* ---- Capteurs Anti-Tamper (Sécurité Matérielle) ---- */
/** Photodiode Vishay TEMD6200FX01 — Détection de lumière (ouverture coque) */
#define PIN_TAMPER_LIGHT        GPIO_NUM_2

/** Grille de sécurité (Tamper Mesh) — Piste cuivre serpentine sur PCB */
#define PIN_TAMPER_MESH         GPIO_NUM_3

/* ---- Module GPS (Quectel L76-LB) ---- */
/** GPS TX → ESP32 RX (UART1) */
#define PIN_GPS_RX              GPIO_NUM_4

/** GPS RX ← ESP32 TX (UART1) */
#define PIN_GPS_TX              GPIO_NUM_5

/** Contrôle alimentation GPS (MOSFET gate) — HIGH = GPS ON */
#define PIN_GPS_POWER           GPIO_NUM_10

/* ---- UART0 — Réservé flashage initial (Test Pads internes) ---- */
#define PIN_UART0_TX            GPIO_NUM_21
#define PIN_UART0_RX            GPIO_NUM_20

/* ---- LED de statut (Debug — désactivée en production) ---- */
#define PIN_LED_STATUS          GPIO_NUM_8

/* ---- Détection alimentation externe 12V (via pont diviseur) ---- */
#define PIN_VEXT_SENSE          GPIO_NUM_0

/* ---- Niveau de batterie LiPo (ADC via pont diviseur) ---- */
#define PIN_VBAT_ADC            GPIO_NUM_1

/* ---- Capteur IMU (I2C) ---- */
#define PIN_IMU_SDA             GPIO_NUM_6
#define PIN_IMU_SCL             GPIO_NUM_7

#endif /* BLACKBOX_PINS_H */
