idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES
        driver
        esp_event
        esp_system
        esp_timer
        esp_sleep
        nvs_flash
        esp_partition
        mbedtls
        tamper
        blackbox
        ble_comm
        gps
        imu
)
