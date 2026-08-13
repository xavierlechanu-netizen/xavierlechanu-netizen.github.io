#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h> // Make sure to install ArduinoJson via Library Manager
#include <TinyGPSPlus.h> // Make sure to install TinyGPSPlus via Library Manager
#include <HardwareSerial.h>
#include "mbedtls/aes.h"

// ─────────────────────────────────────────────────────────────
// CONFIGURATION GPS (NEO-6M)
// ─────────────────────────────────────────────────────────────
TinyGPSPlus gps;
HardwareSerial GPS_Serial(1); // Utilisation de l'UART 1
const int RXPin = 16;
const int TXPin = 17;
const uint32_t GPSBaud = 9600;


// ─────────────────────────────────────────────────────────────
// CONFIGURATION MPU6050 (Accéléromètre / Gyroscope)
// ─────────────────────────────────────────────────────────────
const int MPU_ADDR = 0x68;
int16_t AcX, AcY, AcZ;

// ─────────────────────────────────────────────────────────────
// CONFIGURATION BLE
// ─────────────────────────────────────────────────────────────
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// UUIDs définis avec l'agent IA (doivent correspondre au Frontend PWA)
#define SERVICE_UUID        "0000bb01-0000-1000-8000-00805f9b34fb"
#define CHARACTERISTIC_UUID "0000bb02-0000-1000-8000-00805f9b34fb"

// ─────────────────────────────────────────────────────────────
// CALLBACKS BLE
// ─────────────────────────────────────────────────────────────
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("📱 PWA (Smartphone) Connecté !");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("📱 PWA Déconnecté !");
    }
};

void setupMPU() {
  Wire.begin();
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);  // PWR_MGMT_1 register
  Wire.write(0);     // Set to zero (wakes up the MPU-6050)
  Wire.endTransmission(true);
  Serial.println("✅ Capteur MPU6050 initialisé.");
}

String deviceMAC = "";

void setupBLE() {
  // Initialisation du BLE
  BLEDevice::init("mon50cc"); // Nom visible lors du scan Web Bluetooth
  
  // Récupération de l'adresse MAC (utilisé comme Identifiant Unique / IMEI / FIDO)
  deviceMAC = BLEDevice::getAddress().toString().c_str();
  
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Création du Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Création de la Caractéristique (Notify)
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
                    
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  // Démarrage du Broadcast (Advertising)
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
  Serial.println("✅ Boîte Noire BLE Prête ! En attente du smartphone...");
}

void setupGPS() {
  GPS_Serial.begin(GPSBaud, SERIAL_8N1, RXPin, TXPin);
  Serial.println("✅ Module GPS initialisé (RX: 16, TX: 17).");
}

void setup() {
  Serial.begin(115200);
  Serial.println("🚀 Démarrage de la Boîte Noire mon50ccetmoi...");
  setupMPU();
  setupGPS();
  setupBLE();
}

void loop() {
  // Lecture continue des trames NMEA du GPS
  while (GPS_Serial.available() > 0) {
    gps.encode(GPS_Serial.read());
  }

  if (deviceConnected) {
    // 1. Lire le capteur I2C
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B);  // Starting with register 0x3B (ACCEL_XOUT_H)
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, 6, true);  // Request a total of 6 registers
    
    // Si on obtient bien 6 bytes
    if(Wire.available() == 6) {
      AcX = Wire.read()<<8|Wire.read();
      AcY = Wire.read()<<8|Wire.read();
      AcZ = Wire.read()<<8|Wire.read();

      // Convertir en Force G (MPU6050 défaut +-2g = 16384 LSB/g)
      float gX = AcX / 16384.0;
      float gY = AcY / 16384.0;
      float gZ = AcZ / 16384.0;

      // Calcul de la Force G Totale (Vecteur 3D)
      float gTotal = sqrt((gX * gX) + (gY * gY) + (gZ * gZ));

      // Calcul de l'angle d'inclinaison grossier (Roll)
      float leanAngle = atan2(gY, gZ) * 180 / PI;

      // 2. Extraire les données GPS
      float speedKmh = 0;
      float latitude = 0;
      float longitude = 0;

      if (gps.location.isValid()) {
        latitude = gps.location.lat();
        longitude = gps.location.lng();
      }
      if (gps.speed.isValid()) {
        speedKmh = gps.speed.kmph();
      }

      // 3. Préparer le payload JSON
      StaticJsonDocument<256> doc;
      doc["id"] = deviceMAC; // Identifiant unique du boîtier (IMEI/MAC)
      doc["g"] = gTotal;
      doc["lean"] = leanAngle;
      doc["spd"] = speedKmh;
      doc["lat"] = latitude;
      doc["lng"] = longitude;

      char jsonBuffer[256];
      size_t jsonLen = serializeJson(doc, jsonBuffer);

      // 4. Chiffrement AES-256-CBC du JSON (Zero-Knowledge / E2EE)
      // (En production, cette clé doit être unique par boîtier et stockée en zone sécurisée)
      const uint8_t aes_key[32] = {
         0x01,0x23,0x45,0x67,0x89,0xAB,0xCD,0xEF,0x01,0x23,0x45,0x67,0x89,0xAB,0xCD,0xEF,
         0x01,0x23,0x45,0x67,0x89,0xAB,0xCD,0xEF,0x01,0x23,0x45,0x67,0x89,0xAB,0xCD,0xEF
      };
      uint8_t iv[16] = {0}; // IV statique pour le MVP (à randomiser en prod)
      
      // Padding PKCS#7
      uint8_t pad_val = 16 - (jsonLen % 16);
      size_t paddedLen = jsonLen + pad_val;
      for (size_t i = jsonLen; i < paddedLen; i++) {
          jsonBuffer[i] = pad_val;
      }
      
      uint8_t encryptedPayload[256];
      mbedtls_aes_context aes;
      mbedtls_aes_init(&aes);
      mbedtls_aes_setkey_enc(&aes, aes_key, 256);
      mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_ENCRYPT, paddedLen, iv, (uint8_t*)jsonBuffer, encryptedPayload);
      mbedtls_aes_free(&aes);

      // 5. Création de la Trame Hybride (16 octets Clair + Payload Chiffré)
      uint8_t blePacket[256 + 16];
      
      uint32_t timestamp = millis(); 
      int32_t latE7 = latitude * 1e7;
      int32_t lonE7 = longitude * 1e7;
      uint16_t speed10 = speedKmh * 10;
      
      // En-tête en clair pour le Smartphone (Dashboard)
      memcpy(blePacket + 0, &timestamp, 4);
      memcpy(blePacket + 4, &latE7, 4);
      memcpy(blePacket + 8, &lonE7, 4);
      memcpy(blePacket + 12, &speed10, 2);
      blePacket[14] = 0; // padding
      blePacket[15] = 0; // padding
      
      // Concaténation de la preuve chiffrée
      memcpy(blePacket + 16, encryptedPayload, paddedLen);
      size_t totalLen = 16 + paddedLen;

      // 6. Envoyer la télémétrie en BLE
      pCharacteristic->setValue(blePacket, totalLen);
      pCharacteristic->notify();
    }
    
    // Fréquence d'envoi : 10 Hz (100ms) pour éviter de saturer le BLE
    delay(100); 
  }

  // Gestion des déconnexions (Restart Advertising)
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); 
      pServer->startAdvertising(); 
      Serial.println("🔄 Redémarrage du broadcast BLE...");
      oldDeviceConnected = deviceConnected;
  }
  
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
  }
}
