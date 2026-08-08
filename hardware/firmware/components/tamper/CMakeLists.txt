idf_component_register(
    SRCS "tamper.c"
    INCLUDE_DIRS "."
    REQUIRES driver esp_system nvs_flash esp_efuse mbedtls
    PRIV_REQUIRES esp_partition
)
