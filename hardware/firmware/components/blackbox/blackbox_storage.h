/**
 * ============================================================================
 * blackbox_storage.h — Stockage chiffré des données télémétriques
 * ============================================================================
 * Gère l'écriture et la lecture de trames GPS / capteurs dans une
 * partition Flash dédiée, chiffrées en AES-256-CBC.
 *
 * SÉCURITÉ :
 *   - CIS 3       : Chiffrement AES-256 au repos.
 *   - OWASP A02   : IV unique par trame (pas de réutilisation).
 *   - RGPD Art.32 : Pseudonymisation par chiffrement.
 * ============================================================================
 */

#ifndef BLACKBOX_STORAGE_H
#define BLACKBOX_STORAGE_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Structure d'une trame télémétrique (Boîte Noire).
 *
 * Chaque trame est horodatée (UTC) et contient les données brutes
 * du GPS et des capteurs. Elle est chiffrée avant écriture en Flash.
 *
 * Taille fixe : 64 octets (aligné sur un bloc AES de 16 octets).
 */
typedef struct __attribute__((packed)) {
    uint32_t timestamp_utc;      /**< Epoch UNIX (secondes) */
    int32_t  latitude;           /**< Latitude × 1e7 (précision ~1 cm) */
    int32_t  longitude;          /**< Longitude × 1e7 */
    uint16_t speed_kmh_x10;     /**< Vitesse en km/h × 10 (ex: 455 = 45.5 km/h) */
    uint16_t heading_deg;        /**< Cap en degrés (0-359) */
    uint8_t  satellites;         /**< Nombre de satellites GPS */
    uint8_t  hdop_x10;          /**< HDOP × 10 (qualité du fix) */
    uint16_t battery_mv;        /**< Tension batterie LiPo en mV */
    uint8_t  tamper_state;       /**< État anti-tamper (0 = OK) */
    uint8_t  flags;              /**< Drapeaux (bit 0 = alimentation ext.) */
    uint8_t  reserved[42];       /**< Réservé pour extensions futures */
} blackbox_frame_t;

_Static_assert(sizeof(blackbox_frame_t) == 64,
    "blackbox_frame_t doit faire exactement 64 octets (4 blocs AES)");

/**
 * @brief Initialise le module de stockage (partition Flash + clé AES).
 *        Génère la clé AES-256 au premier boot et la charge en RAM.
 *
 * @return ESP_OK ou ESP_FAIL.
 */
esp_err_t blackbox_storage_init(void);

/**
 * @brief Écrit une trame chiffrée en AES-256-CBC dans la Flash.
 *
 * @param frame Pointeur vers la trame à enregistrer.
 * @return ESP_OK ou ESP_ERR_NO_MEM si la Flash est pleine.
 */
esp_err_t blackbox_storage_write(const blackbox_frame_t *frame);

/**
 * @brief Lit et déchiffre une trame depuis la Flash.
 *
 * @param index  Index de la trame (0 = la plus ancienne).
 * @param frame  Pointeur de sortie.
 * @return ESP_OK, ESP_ERR_NOT_FOUND si l'index est invalide.
 */
esp_err_t blackbox_storage_read(uint32_t index, blackbox_frame_t *frame);

/**
 * @brief Retourne le nombre de trames enregistrées.
 */
uint32_t blackbox_storage_count(void);

/**
 * @brief Transfère les trames déchiffrées vers l'app mobile via BLE.
 *        Les trames sont déchiffrées en RAM puis envoyées par morceaux.
 *        Elles ne sont JAMAIS écrites en clair sur la Flash.
 *
 * @param max_frames Nombre maximum de trames à transférer (0 = toutes).
 * @return ESP_OK.
 */
esp_err_t blackbox_storage_export_ble(uint32_t max_frames);

#ifdef __cplusplus
}
#endif

#endif /* BLACKBOX_STORAGE_H */
