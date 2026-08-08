/**
 * ============================================================================
 * main.c — Point d'entrée du Firmware "Boîte Noire" V1
 * ============================================================================
 * Cible : ESP32-C3-MINI-1 (ESP-IDF v5.x)
 *
 * Boucle principale :
 *   1. Vérification eFuse (boîtier brické ?)
 *   2. Initialisation Anti-Tamper (ISR sur GPIO 2 & 3)
 *   3. Initialisation stockage chiffré (AES-256)
 *   4. Initialisation GPS (UART1)
 *   5. Initialisation BLE (GATT Server)
 *   6. Boucle d'acquisition télémétrique (1 Hz)
 *   7. Deep Sleep si alimentation externe coupée
 *
 * CONFORMITÉ :
 *   - OWASP A11  : Code modulaire, pas de boucle infinie sans garde.
 *   - CIS 4      : Configuration sécurisée par défaut.
 *   - CIS 16.10  : Validation de toutes les entrées.
 *   - FIDO FDO   : Surface d'attaque minimale (pas de port physique).
 * ============================================================================
 */

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/uart.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_sleep.h"
#include "esp_timer.h"
#include "nvs_flash.h"

/* ---- Modules internes ---- */
#include "blackbox_pins.h"
#include "tamper.h"
#include "blackbox_storage.h"
#include "ble_comm.h"
#include "gps_parser.h"

/* ---- Tag de log ---- */
static const char *TAG = "MAIN";

/* ---- Constantes ---- */
#define GPS_UART_NUM        UART_NUM_1
#define GPS_BAUD_RATE       9600
#define GPS_BUF_SIZE        512
#define TELEMETRY_PERIOD_MS 1000    /* 1 Hz */
#define DEEP_SLEEP_TIMEOUT  (5 * 60 * 1000000ULL)  /* 5 min en µs */

/* ---- Prototypes ---- */
static void init_nvs(void);
static void init_gps_uart(void);
static void gps_power_on(void);
static void gps_power_off(void);
static bool is_external_power_present(void);
static void telemetry_task(void *pvParameters);
static void enter_deep_sleep(void);
static void on_export_request(uint32_t start_index, uint32_t count);

/* ============================================================================
 * app_main() — Point d'entrée (remplace main() sur ESP-IDF)
 * ============================================================================
 */
void app_main(void)
{
    ESP_LOGI(TAG, "╔═══════════════════════════════════════════════╗");
    ESP_LOGI(TAG, "║   BOÎTE NOIRE v1.0 — mon 50cc et moi        ║");
    ESP_LOGI(TAG, "║   Firmware ESP32-C3 (RISC-V, BLE 5.0)       ║");
    ESP_LOGI(TAG, "╚═══════════════════════════════════════════════╝");

    /* ================================================================
     * ÉTAPE 0 : Initialisation NVS (Non-Volatile Storage)
     * ================================================================ */
    init_nvs();

    /* ================================================================
     * ÉTAPE 1 : Vérification Anti-Tamper (avant toute autre chose !)
     * ================================================================
     * Si le boîtier a été compromis (eFuse brûlé), on refuse de
     * démarrer. Le firmware entre dans une boucle morte.
     * ================================================================ */
    if (tamper_is_bricked()) {
        ESP_LOGE(TAG, "████████████████████████████████████████████");
        ESP_LOGE(TAG, "█  BOÎTIER NEUTRALISÉ — TAMPER DÉTECTÉ    █");
        ESP_LOGE(TAG, "█  Toutes les données ont été effacées.    █");
        ESP_LOGE(TAG, "█  Ce boîtier est définitivement hors      █");
        ESP_LOGE(TAG, "█  service. Contactez le support.           █");
        ESP_LOGE(TAG, "████████████████████████████████████████████");

        /* Boucle infinie avec watchdog — le boîtier ne fait plus rien */
        while (1) {
            vTaskDelay(pdMS_TO_TICKS(10000));
        }
    }

    /* ================================================================
     * ÉTAPE 2 : Armement du système Anti-Tamper (ISR sur GPIO)
     * ================================================================ */
    ESP_LOGI(TAG, "[2/5] Armement du système Anti-Tamper...");
    esp_err_t err = tamper_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ERREUR CRITIQUE : Anti-Tamper non initialisé !");
        esp_restart();
    }
    ESP_LOGI(TAG, "  ✓ Capteur photodiode (GPIO %d) — armé", PIN_TAMPER_LIGHT);
    ESP_LOGI(TAG, "  ✓ Grille Tamper Mesh (GPIO %d) — armé", PIN_TAMPER_MESH);

    /* ================================================================
     * ÉTAPE 3 : Initialisation du stockage chiffré (AES-256)
     * ================================================================ */
    ESP_LOGI(TAG, "[3/5] Initialisation du stockage chiffré...");
    err = blackbox_storage_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ERREUR : Stockage chiffré non disponible.");
        /* On continue quand même — le tamper reste actif */
    } else {
        ESP_LOGI(TAG, "  ✓ AES-256-CBC actif — %lu trames en mémoire.",
                 (unsigned long)blackbox_storage_count());
    }

    /* ================================================================
     * ÉTAPE 4 : Initialisation du GPS (UART1)
     * ================================================================ */
    ESP_LOGI(TAG, "[4/5] Initialisation du module GPS...");
    init_gps_uart();
    gps_power_on();
    ESP_LOGI(TAG, "  ✓ GPS alimenté — acquisition en cours...");

    /* ================================================================
     * ÉTAPE 5 : Initialisation BLE (GATT Server)
     * ================================================================ */
    ESP_LOGI(TAG, "[5/5] Initialisation BLE...");
    gps_parser_init();
    err = ble_comm_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ERREUR : BLE non initialisé.");
    } else {
        ble_comm_set_export_callback(on_export_request);
        ESP_LOGI(TAG, "  ✓ BLE GATT Server actif.");
    }

    /* ================================================================
     * LANCEMENT DE LA BOUCLE TÉLÉMÉTRIQUE (1 Hz)
     * ================================================================ */
    ESP_LOGI(TAG, "═══════════════════════════════════════════════");
    ESP_LOGI(TAG, "  Boîte Noire opérationnelle. Acquisition 1 Hz.");
    ESP_LOGI(TAG, "═══════════════════════════════════════════════");

    xTaskCreate(
        telemetry_task,
        "telemetry",
        4096,
        NULL,
        5,   /* Priorité moyenne */
        NULL
    );
}

/* ============================================================================
 * telemetry_task() — Boucle d'acquisition principale (1 Hz)
 * ============================================================================
 * Lit le GPS, construit une trame, la chiffre et la stocke en Flash.
 * Si l'alimentation externe est coupée depuis > 5 min, passe en Deep Sleep.
 * ============================================================================
 */
static void telemetry_task(void *pvParameters)
{
    (void)pvParameters;
    uint8_t gps_buf[GPS_BUF_SIZE];
    int64_t last_ext_power_time = esp_timer_get_time();

    while (1) {
        /* ---- Vérifier le tamper à chaque cycle (paranoïa) ---- */
        if (tamper_get_state() != TAMPER_STATE_SAFE) {
            ESP_LOGE(TAG, "TAMPER DÉTECTÉ EN BOUCLE — arrêt immédiat.");
            tamper_zeroize();  /* Ne reviendra jamais */
        }

        /* ---- Lire les trames NMEA du GPS ---- */
        int len = uart_read_bytes(
            GPS_UART_NUM, gps_buf, GPS_BUF_SIZE - 1,
            pdMS_TO_TICKS(500)
        );

        if (len > 0) {
            /* Alimenter le parseur NMEA (buffering interne) */
            gps_parser_feed(gps_buf, (uint16_t)len);
        }

        /* ---- Construire la trame depuis les données GPS ---- */
        const gps_data_t *gps = gps_parser_get_data();
        blackbox_frame_t frame;
        memset(&frame, 0, sizeof(frame));

        if (gps->valid) {
            gps_parser_to_frame(gps, &frame);
        }

        /* ---- Compléter la trame avec les données système ---- */
        frame.timestamp_utc = (uint32_t)(esp_timer_get_time() / 1000000);
        frame.tamper_state = (uint8_t)tamper_get_state();
        frame.flags = is_external_power_present() ? 0x01 : 0x00;

        /* TODO : Lire ADC pour tension batterie */
        frame.battery_mv = 3700;  /* Placeholder */

        /* Mettre à jour les valeurs BLE */
        ble_comm_update_battery(frame.battery_mv);
        ble_comm_update_tamper_state(frame.tamper_state);

        /* ---- Enregistrer la trame chiffrée ---- */
        esp_err_t err = blackbox_storage_write(&frame);
        if (err == ESP_OK) {
            ESP_LOGD(TAG, "Trame #%lu enregistrée.",
                     (unsigned long)blackbox_storage_count());
        }

        /* ---- Gestion Deep Sleep (économie d'énergie) ---- */
        if (is_external_power_present()) {
            last_ext_power_time = esp_timer_get_time();
        } else {
            int64_t elapsed = esp_timer_get_time() - last_ext_power_time;
            if (elapsed > DEEP_SLEEP_TIMEOUT) {
                ESP_LOGW(TAG, "Alimentation ext. absente > 5 min → Deep Sleep.");
                gps_power_off();
                enter_deep_sleep();
            }
        }

        vTaskDelay(pdMS_TO_TICKS(TELEMETRY_PERIOD_MS));
    }
}

/* ============================================================================
 * Initialisation NVS
 * ============================================================================
 */
static void init_nvs(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
}

/* ============================================================================
 * Initialisation UART1 pour le GPS (Quectel L76-LB)
 * ============================================================================
 */
static void init_gps_uart(void)
{
    uart_config_t uart_cfg = {
        .baud_rate  = GPS_BAUD_RATE,
        .data_bits  = UART_DATA_8_BITS,
        .parity     = UART_PARITY_DISABLE,
        .stop_bits  = UART_STOP_BITS_1,
        .flow_ctrl  = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_param_config(GPS_UART_NUM, &uart_cfg));
    ESP_ERROR_CHECK(uart_set_pin(
        GPS_UART_NUM,
        PIN_GPS_TX,     /* ESP TX → GPS RX */
        PIN_GPS_RX,     /* ESP RX ← GPS TX */
        UART_PIN_NO_CHANGE,
        UART_PIN_NO_CHANGE
    ));
    ESP_ERROR_CHECK(uart_driver_install(
        GPS_UART_NUM,
        GPS_BUF_SIZE * 2,
        0, 0, NULL, 0
    ));
}

/* ============================================================================
 * Contrôle alimentation GPS (via MOSFET sur PIN_GPS_POWER)
 * ============================================================================
 */
static void gps_power_on(void)
{
    gpio_set_direction(PIN_GPS_POWER, GPIO_MODE_OUTPUT);
    gpio_set_level(PIN_GPS_POWER, 1);  /* MOSFET ON */
}

static void gps_power_off(void)
{
    gpio_set_level(PIN_GPS_POWER, 0);  /* MOSFET OFF */
}

/* ============================================================================
 * Détection alimentation externe (pont diviseur 12V → GPIO)
 * ============================================================================
 */
static bool is_external_power_present(void)
{
    return gpio_get_level(PIN_VEXT_SENSE) == 1;
}

/* ============================================================================
 * Deep Sleep — Réveil par capteur Anti-Tamper ou timer
 * ============================================================================
 */
static void enter_deep_sleep(void)
{
    ESP_LOGI(TAG, "Entrée en Deep Sleep...");

    /*
     * Configurer le wake-up par GPIO (capteurs anti-tamper).
     * Même en Deep Sleep, une tentative d'ouverture réveille l'ESP32
     * qui exécute immédiatement la zeroization.
     */
    esp_deep_sleep_enable_gpio_wakeup(
        (1ULL << PIN_TAMPER_LIGHT) | (1ULL << PIN_TAMPER_MESH),
        ESP_GPIO_WAKEUP_GPIO_HIGH
    );

    /* Réveil périodique toutes les 30 minutes pour envoyer un "heartbeat" */
    esp_sleep_enable_timer_wakeup(30 * 60 * 1000000ULL);

    esp_deep_sleep_start();
}

/* ============================================================================
 * on_export_request() — Callback BLE d'export des trames
 * ============================================================================
 * Appelé par le composant ble_comm lorsque l'app mobile demande
 * à récupérer les trames enregistrées.
 *
 * Les trames sont déchiffrées en RAM, envoyées via BLE notification,
 * puis effacées de la RAM. Elles ne sont JAMAIS écrites en clair
 * sur la Flash (RGPD Art.32 / CIS Control 3).
 * ============================================================================
 */
static void on_export_request(uint32_t start_index, uint32_t count)
{
    uint32_t total = blackbox_storage_count();

    if (start_index >= total) {
        ESP_LOGW(TAG, "Export : index de départ invalide (%lu >= %lu)",
                 (unsigned long)start_index, (unsigned long)total);
        return;
    }

    if (count == 0 || start_index + count > total) {
        count = total - start_index;
    }

    ESP_LOGI(TAG, "Export BLE : trames %lu à %lu (%lu trames)...",
             (unsigned long)start_index,
             (unsigned long)(start_index + count - 1),
             (unsigned long)count);

    for (uint32_t i = start_index; i < start_index + count; i++) {
        blackbox_frame_t frame;
        esp_err_t err = blackbox_storage_read(i, &frame);

        if (err == ESP_OK) {
            /* Envoyer la trame déchiffrée via notification BLE */
            ble_comm_notify_frame((const uint8_t *)&frame, sizeof(frame));

            /* Petit délai pour ne pas saturer le buffer BLE */
            vTaskDelay(pdMS_TO_TICKS(50));
        } else {
            ESP_LOGW(TAG, "Export : erreur lecture trame #%lu", (unsigned long)i);
        }

        /* Effacer la trame de la RAM après envoi (RGPD / CIS 3) */
        memset(&frame, 0, sizeof(frame));
    }

    ESP_LOGI(TAG, "Export BLE terminé.");
}
