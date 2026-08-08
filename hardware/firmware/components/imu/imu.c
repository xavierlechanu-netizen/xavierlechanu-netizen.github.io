#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <math.h>
#include "esp_log.h"
#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"
#include "imu.h"
#include "../../main/blackbox_pins.h"

static const char *TAG = "IMU";

#define I2C_MASTER_SCL_IO           PIN_IMU_SCL
#define I2C_MASTER_SDA_IO           PIN_IMU_SDA
#define I2C_MASTER_NUM              I2C_NUM_0
#define I2C_MASTER_FREQ_HZ          400000
#define MPU6050_ADDR                0x68
#define MPU6050_REG_PWR_MGMT_1      0x6B
#define MPU6050_REG_ACCEL_XOUT_H    0x3B

// Constante pour diviser la valeur brute (±2g = 16384 LSB/g)
#define ACCEL_SCALE                 16384.0f

static bool imu_ready = false;

/**
 * Lit les registres de l'accéléromètre via I2C
 */
static esp_err_t mpu6050_read_accel(int16_t *accel_x, int16_t *accel_y, int16_t *accel_z) {
    uint8_t data[6];
    
    // Positionner le pointeur de registre sur ACCEL_XOUT_H
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (MPU6050_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, MPU6050_REG_ACCEL_XOUT_H, true);
    
    // Redémarrer en mode lecture
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (MPU6050_ADDR << 1) | I2C_MASTER_READ, true);
    i2c_master_read(cmd, data, 5, I2C_MASTER_ACK);
    i2c_master_read_byte(cmd, data + 5, I2C_MASTER_NACK);
    i2c_master_stop(cmd);
    
    esp_err_t ret = i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, pdMS_TO_TICKS(1000));
    i2c_cmd_link_delete(cmd);
    
    if (ret == ESP_OK) {
        *accel_x = (data[0] << 8) | data[1];
        *accel_y = (data[2] << 8) | data[3];
        *accel_z = (data[4] << 8) | data[5];
    }
    return ret;
}

void imu_init(void) {
    ESP_LOGI(TAG, "Initialisation du bus I2C pour l'IMU...");
    
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = I2C_MASTER_SDA_IO,
        .scl_io_num = I2C_MASTER_SCL_IO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_MASTER_FREQ_HZ,
    };
    
    esp_err_t ret = i2c_param_config(I2C_MASTER_NUM, &conf);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Erreur i2c_param_config");
        return;
    }
    
    ret = i2c_driver_install(I2C_MASTER_NUM, conf.mode, 0, 0, 0);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Erreur i2c_driver_install");
        return;
    }
    
    // Sortir le MPU6050 du mode veille (écrire 0 dans PWR_MGMT_1)
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (MPU6050_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, MPU6050_REG_PWR_MGMT_1, true);
    i2c_master_write_byte(cmd, 0x00, true);
    i2c_master_stop(cmd);
    ret = i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, pdMS_TO_TICKS(1000));
    i2c_cmd_link_delete(cmd);
    
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "IMU MPU6050 détecté et initialisé.");
        imu_ready = true;
    } else {
        ESP_LOGW(TAG, "IMU MPU6050 non trouvé sur le bus I2C (Mode simulation activé).");
        // On ne bloque pas si le capteur n'est pas physiquement branché (devkit)
    }
}

void imu_read_data(imu_data_t *out_data) {
    if (!out_data) return;
    
    if (!imu_ready) {
        // En l'absence de vrai capteur, on simule une conduite normale (1G, droit)
        out_data->accel_g = 1.0f;
        out_data->lean_angle = 0.0f;
        return;
    }
    
    int16_t raw_x = 0, raw_y = 0, raw_z = 0;
    if (mpu6050_read_accel(&raw_x, &raw_y, &raw_z) == ESP_OK) {
        // Convertir en G
        float x_g = (float)raw_x / ACCEL_SCALE;
        float y_g = (float)raw_y / ACCEL_SCALE;
        float z_g = (float)raw_z / ACCEL_SCALE;
        
        // 1. Force G totale (Norme du vecteur d'accélération)
        out_data->accel_g = sqrt(x_g * x_g + y_g * y_g + z_g * z_g);
        
        // 2. Angle d'inclinaison par rapport à la gravité
        // On suppose que l'axe Z pointe vers le haut lorsque la moto est droite
        // L'angle de gite (Roll) s'obtient généralement avec atan2(Y, Z)
        float angle_rad = atan2(y_g, sqrt(x_g * x_g + z_g * z_g));
        out_data->lean_angle = fabs(angle_rad * (180.0 / M_PI));
        
    } else {
        out_data->accel_g = 1.0f;
        out_data->lean_angle = 0.0f;
    }
}
