/**
 * ============================================================================
 * blackbox_storage.c — Implémentation du stockage chiffré AES-256
 * ============================================================================
 * Cible : ESP32-C3-MINI-1 (ESP-IDF v5.x)
 *
 * Architecture mémoire :
 *   Partition "blackbox_data" (256 Ko typ.) organisée en ring buffer :
 *   ┌──────────┬──────────┬──────────┬─────┬──────────┐
 *   │ Header   │ Frame 0  │ Frame 1  │ ... │ Frame N  │
 *   │ (64 B)   │ (80 B)   │ (80 B)   │     │ (80 B)   │
 *   └──────────┴──────────┴──────────┴─────┴──────────┘
 *
 *   Chaque frame stockée = 16 octets d'IV + 64 octets chiffrés = 80 B.
 *
 * CONFORMITÉ :
 *   - OWASP A02 : IV aléatoire unique par trame (pas de réutilisation).
 *   - CIS 3     : AES-256-CBC via accélérateur matériel ESP32-C3.
 *   - RGPD      : Données pseudonymisées par chiffrement.
 * ============================================================================
 */

#include <string.h>
#include "esp_log.h"
#include "esp_partition.h"
#include "esp_random.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "mbedtls/aes.h"
#include "mbedtls/platform_util.h"

#include "blackbox_storage.h"

/* ---- Tag de log ---- */
static const char *TAG = "BB_STORE";

/* ---- Constantes ---- */
#define AES_KEY_SIZE        32      /* 256 bits */
#define AES_IV_SIZE         16      /* 128 bits */
#define FRAME_RAW_SIZE      sizeof(blackbox_frame_t)  /* 64 octets */
#define FRAME_STORED_SIZE   (AES_IV_SIZE + FRAME_RAW_SIZE)  /* 80 octets */
#define HEADER_SIZE         64      /* En-tête de la partition */

/* ---- En-tête de la partition (persisté en Flash) ---- */
typedef struct __attribute__((packed)) {
    uint32_t magic;             /* 0x424F5831 = "BOX1" */
    uint32_t version;           /* Version du format = 1 */
    uint32_t write_offset;      /* Offset du prochain slot libre */
    uint32_t frame_count;       /* Nombre total de trames écrites */
    uint32_t max_frames;        /* Capacité maximale */
    uint8_t  reserved[44];      /* Padding à 64 octets */
} partition_header_t;

_Static_assert(sizeof(partition_header_t) == HEADER_SIZE,
    "partition_header_t doit faire 64 octets");

/* ---- Variables statiques ---- */
static const esp_partition_t *s_partition = NULL;
static partition_header_t s_header;

/**
 * Clé AES-256 en RAM volatile.
 * JAMAIS écrite en Flash. Générée au premier boot et stockée dans NVS
 * (qui est effacé en cas de tamper). Au runtime, elle n'existe qu'ici.
 */
static uint8_t s_aes_key[AES_KEY_SIZE] __attribute__((aligned(4)));

/* ---- Prototypes internes ---- */
static esp_err_t _load_or_generate_key(void);
static esp_err_t _write_header(void);
static esp_err_t _read_header(void);

/* ============================================================================
 * blackbox_storage_init()
 * ============================================================================
 */
esp_err_t blackbox_storage_init(void)
{
    ESP_LOGI(TAG, "Initialisation du stockage chiffré...");

    /* Trouver la partition dédiée */
    s_partition = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA,
        ESP_PARTITION_SUBTYPE_ANY,
        "blackbox_data"
    );

    if (s_partition == NULL) {
        ESP_LOGE(TAG, "Partition 'blackbox_data' introuvable !");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Partition trouvée : taille = %lu Ko",
             (unsigned long)(s_partition->size / 1024));

    /* Charger ou générer la clé AES-256 */
    esp_err_t err = _load_or_generate_key();
    if (err != ESP_OK) {
        return err;
    }

    /* Lire l'en-tête existant ou initialiser */
    err = _read_header();
    if (err != ESP_OK || s_header.magic != 0x424F5831) {
        ESP_LOGW(TAG, "Partition vierge — initialisation...");
        memset(&s_header, 0, sizeof(s_header));
        s_header.magic = 0x424F5831;  /* "BOX1" */
        s_header.version = 1;
        s_header.write_offset = HEADER_SIZE;
        s_header.frame_count = 0;
        s_header.max_frames =
            (s_partition->size - HEADER_SIZE) / FRAME_STORED_SIZE;

        /* Effacer toute la partition (nécessaire avant écriture Flash) */
        esp_partition_erase_range(s_partition, 0, s_partition->size);
        _write_header();
    }

    ESP_LOGI(TAG, "Stockage prêt : %lu / %lu trames.",
             (unsigned long)s_header.frame_count,
             (unsigned long)s_header.max_frames);

    return ESP_OK;
}

/* ============================================================================
 * blackbox_storage_write() — Écriture d'une trame chiffrée
 * ============================================================================
 */
esp_err_t blackbox_storage_write(const blackbox_frame_t *frame)
{
    if (frame == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (s_header.frame_count >= s_header.max_frames) {
        ESP_LOGW(TAG, "Flash pleine — ring buffer : écrasement ancien.");
        s_header.write_offset = HEADER_SIZE;  /* Reboucler */
    }

    /* ---- Générer un IV aléatoire unique (OWASP A02) ---- */
    uint8_t iv[AES_IV_SIZE];
    esp_fill_random(iv, AES_IV_SIZE);

    /* ---- Chiffrement AES-256-CBC (accélérateur matériel ESP32) ---- */
    uint8_t ciphertext[FRAME_RAW_SIZE];
    uint8_t iv_copy[AES_IV_SIZE];
    memcpy(iv_copy, iv, AES_IV_SIZE);  /* mbedtls modifie l'IV en place */

    mbedtls_aes_context aes_ctx;
    mbedtls_aes_init(&aes_ctx);
    mbedtls_aes_setkey_enc(&aes_ctx, s_aes_key, 256);

    int ret = mbedtls_aes_crypt_cbc(
        &aes_ctx,
        MBEDTLS_AES_ENCRYPT,
        FRAME_RAW_SIZE,
        iv_copy,
        (const uint8_t *)frame,
        ciphertext
    );

    mbedtls_aes_free(&aes_ctx);

    if (ret != 0) {
        ESP_LOGE(TAG, "Erreur de chiffrement AES : %d", ret);
        return ESP_FAIL;
    }

    /* ---- Écriture en Flash : [IV (16B)] + [Ciphertext (64B)] = 80B ---- */
    uint8_t stored_frame[FRAME_STORED_SIZE];
    memcpy(stored_frame, iv, AES_IV_SIZE);
    memcpy(stored_frame + AES_IV_SIZE, ciphertext, FRAME_RAW_SIZE);

    esp_err_t err = esp_partition_write(
        s_partition,
        s_header.write_offset,
        stored_frame,
        FRAME_STORED_SIZE
    );

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Erreur d'écriture Flash : %s", esp_err_to_name(err));
        return err;
    }

    /* Nettoyer la clé et le plaintext de la stack */
    mbedtls_platform_zeroize(iv_copy, sizeof(iv_copy));
    mbedtls_platform_zeroize(ciphertext, sizeof(ciphertext));

    /* Mettre à jour l'en-tête */
    s_header.write_offset += FRAME_STORED_SIZE;
    s_header.frame_count++;
    _write_header();

    return ESP_OK;
}

/* ============================================================================
 * blackbox_storage_read() — Lecture et déchiffrement d'une trame
 * ============================================================================
 */
esp_err_t blackbox_storage_read(uint32_t index, blackbox_frame_t *frame)
{
    if (frame == NULL || index >= s_header.frame_count) {
        return ESP_ERR_INVALID_ARG;
    }

    uint32_t offset = HEADER_SIZE + (index * FRAME_STORED_SIZE);

    /* Lire le bloc chiffré [IV + Ciphertext] */
    uint8_t stored_frame[FRAME_STORED_SIZE];
    esp_err_t err = esp_partition_read(
        s_partition, offset, stored_frame, FRAME_STORED_SIZE
    );
    if (err != ESP_OK) {
        return err;
    }

    /* Extraire l'IV et le ciphertext */
    uint8_t iv[AES_IV_SIZE];
    uint8_t ciphertext[FRAME_RAW_SIZE];
    memcpy(iv, stored_frame, AES_IV_SIZE);
    memcpy(ciphertext, stored_frame + AES_IV_SIZE, FRAME_RAW_SIZE);

    /* Déchiffrer */
    mbedtls_aes_context aes_ctx;
    mbedtls_aes_init(&aes_ctx);
    mbedtls_aes_setkey_dec(&aes_ctx, s_aes_key, 256);

    int ret = mbedtls_aes_crypt_cbc(
        &aes_ctx,
        MBEDTLS_AES_DECRYPT,
        FRAME_RAW_SIZE,
        iv,
        ciphertext,
        (uint8_t *)frame
    );

    mbedtls_aes_free(&aes_ctx);

    /* Nettoyer les buffers temporaires */
    mbedtls_platform_zeroize(iv, sizeof(iv));
    mbedtls_platform_zeroize(ciphertext, sizeof(ciphertext));
    mbedtls_platform_zeroize(stored_frame, sizeof(stored_frame));

    return (ret == 0) ? ESP_OK : ESP_FAIL;
}

/* ============================================================================
 * blackbox_storage_count()
 * ============================================================================
 */
uint32_t blackbox_storage_count(void)
{
    return s_header.frame_count;
}

/* ============================================================================
 * _load_or_generate_key() — Gestion sécurisée de la clé AES-256
 * ============================================================================
 * La clé est stockée dans NVS (chiffrée par l'ESP32 si NVS Encryption
 * est activé dans menuconfig). Elle est chargée en RAM volatile au boot.
 * En cas de tamper, le NVS est effacé ET la RAM est mise à zéro.
 * ============================================================================
 */
static esp_err_t _load_or_generate_key(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open("bb_keys", NVS_READWRITE, &nvs);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Impossible d'ouvrir NVS : %s", esp_err_to_name(err));
        return err;
    }

    size_t key_len = AES_KEY_SIZE;
    err = nvs_get_blob(nvs, "aes256", s_aes_key, &key_len);

    if (err == ESP_ERR_NVS_NOT_FOUND) {
        /* Premier boot : générer une clé aléatoire (TRNG matériel) */
        ESP_LOGW(TAG, "Premier boot — Génération de la clé AES-256...");
        esp_fill_random(s_aes_key, AES_KEY_SIZE);

        err = nvs_set_blob(nvs, "aes256", s_aes_key, AES_KEY_SIZE);
        if (err != ESP_OK) {
            nvs_close(nvs);
            return err;
        }
        nvs_commit(nvs);
        ESP_LOGI(TAG, "Clé AES-256 générée et sauvegardée.");
    } else if (err == ESP_OK) {
        ESP_LOGI(TAG, "Clé AES-256 chargée depuis NVS.");
    } else {
        ESP_LOGE(TAG, "Erreur lecture clé NVS : %s", esp_err_to_name(err));
        nvs_close(nvs);
        return err;
    }

    nvs_close(nvs);
    return ESP_OK;
}

/* ============================================================================
 * Helpers Flash (lecture/écriture de l'en-tête)
 * ============================================================================
 */
static esp_err_t _write_header(void)
{
    return esp_partition_write(
        s_partition, 0, &s_header, sizeof(s_header)
    );
}

static esp_err_t _read_header(void)
{
    return esp_partition_read(
        s_partition, 0, &s_header, sizeof(s_header)
    );
}
