# 🔒 Firmware Boîte Noire — mon 50cc et moi

Firmware embarqué pour le boîtier IoT inviolable "Boîte Noire", destiné à être monté sous le bac à batterie d'un véhicule 50 cc.

## 🎯 Cible Matérielle

| Composant | Référence |
|---|---|
| MCU | ESP32-C3-MINI-1 (RISC-V 32-bit, BLE 5.0) |
| GPS | Quectel L76-LB (UART, 9600 baud) |
| Capteur Tamper | Vishay TEMD6200FX01 (Photodiode) + Tamper Mesh |
| Flash | 4 Mo intégrée |

## 📁 Structure du Projet

```
hardware/firmware/
├── CMakeLists.txt              # Build system ESP-IDF
├── partitions.csv              # Table de partitions (OTA + blackbox_data)
├── sdkconfig.defaults          # Config matérielle par défaut
├── main/
│   ├── CMakeLists.txt
│   ├── main.c                  # Point d'entrée (boot + boucle 1 Hz)
│   └── blackbox_pins.h         # Assignation des GPIOs
└── components/
    ├── tamper/
    │   ├── tamper.h             # API Anti-Tamper & Zeroization
    │   └── tamper.c             # ISR + effacement clés + eFuse brick
    ├── blackbox/
    │   ├── blackbox_storage.h   # API stockage chiffré AES-256
    │   └── blackbox_storage.c   # Ring buffer Flash + AES-256-CBC
    ├── ble_comm/                # (À implémenter) Serveur GATT BLE
    └── gps/                     # (À implémenter) Parseur NMEA complet
```

## 🔐 Architecture de Sécurité

```
[ Capteur déclenché ] → [ ISR GPIO (IRAM) ] → [ tamper_zeroize() ]
    │                                               │
    │                                    ┌──────────┴──────────┐
    │                                    │ 1. Efface clé AES   │
    │                                    │ 2. Efface NVS       │
    │                                    │ 3. Efface Flash data │
    │                                    │ 4. Burn eFuse BRICK  │
    │                                    │ 5. Reboot mort       │
    │                                    └─────────────────────┘
    ▼
 [ Double lecture anti-glitch (parasites moteur 50cc filtré) ]
```

## 🛠️ Prérequis

1. **ESP-IDF v5.x** : [Installation officielle](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/get-started/)
2. **Python 3.8+** (pour les outils ESP-IDF)

## 🚀 Build & Flash

```bash
# Configurer l'environnement ESP-IDF
. $IDF_PATH/export.sh

# Build
cd hardware/firmware
idf.py set-target esp32c3
idf.py build

# Flash (via test pads UART0 — avant résinage !)
idf.py -p /dev/ttyUSB0 flash monitor
```

## ⚠️ Notes de Production

- **Avant résinage** : Flasher le firmware, vérifier le fonctionnement, puis couler la résine PU.
- **Après résinage** : Seules les mises à jour FOTA (BLE) sont possibles.
- **eFuse JTAG** : Brûler les eFuses de désactivation JTAG **après** validation du prototype.
