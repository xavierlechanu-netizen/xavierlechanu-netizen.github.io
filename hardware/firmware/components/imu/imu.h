#ifndef IMU_H
#define IMU_H

#include <stdint.h>

/**
 * Structure contenant les données calculées de la centrale inertielle
 */
typedef struct {
    float accel_g;      // Accélération totale en G (ex: 1.0 = repos)
    float lean_angle;   // Angle d'inclinaison en degrés (0 = droit, 90 = couché)
} imu_data_t;

/**
 * Initialise le bus I2C et le capteur IMU (MPU6050)
 */
void imu_init(void);

/**
 * Lit les données brutes, calcule les G et l'inclinaison, puis les stocke dans `out_data`
 * @param out_data Pointeur vers la structure à remplir
 */
void imu_read_data(imu_data_t *out_data);

#endif // IMU_H
