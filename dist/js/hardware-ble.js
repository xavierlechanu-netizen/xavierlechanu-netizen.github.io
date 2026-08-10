/**
 * HARDWARE BLE (Bluetooth Low Energy) - ESP32 Blackbox Link
 * Connects the PWA to the ESP32 hardware via Web Bluetooth API.
 * Receives continuous telemetry but ONLY stores it locally in window.Blackbox.
 */

window.HardwareBLE = {
  device: null,
  server: null,
  telemetryCharacteristic: null,
  
  // Custom UUIDs for ESP32 Firmware
  SERVICE_UUID: "0000bb01-0000-1000-8000-00805f9b34fb", // Blackbox Service
  CHAR_TELEMETRY_UUID: "0000bb02-0000-1000-8000-00805f9b34fb", // TX Characteristic

  isConnected: false,

  connect: async function () {
    if (!navigator.bluetooth) {
      alert("Votre navigateur ne supporte pas le Bluetooth Web (API WebBLE). Utilisez Chrome sur Android ou un PC.");
      return false;
    }

    try {
      console.log("Demande de connexion BLE pour la Blackbox ESP32...");
      
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "mon50cc" }],
        optionalServices: [this.SERVICE_UUID]
      });

      this.device.addEventListener("gattserverdisconnected", this.onDisconnected.bind(this));

      this.server = await this.device.gatt.connect();
      console.log("Connecté au serveur GATT de l'ESP32.");

      const service = await this.server.getPrimaryService(this.SERVICE_UUID);
      this.telemetryCharacteristic = await service.getCharacteristic(this.CHAR_TELEMETRY_UUID);

      await this.telemetryCharacteristic.startNotifications();
      this.telemetryCharacteristic.addEventListener("characteristicvaluechanged", this.handleTelemetry.bind(this));
      
      this.isConnected = true;
      console.log("Notifications de télémétrie BLE activées.");
      
      // UI Update
      if (typeof speak === "function") speak("Boîte noire matérielle connectée et synchronisée.");
      
      return true;
    } catch (error) {
      console.error("Erreur de connexion BLE:", error);
      return false;
    }
  },

  disconnect: function () {
    if (!this.device) {
      return;
    }
    console.log("Déconnexion du périphérique Bluetooth...");
    if (this.device.gatt.connected) {
      this.device.gatt.disconnect();
    } else {
      console.log("Déjà déconnecté.");
    }
  },

  onDisconnected: function () {
    this.isConnected = false;
    console.warn("L'ESP32 s'est déconnecté.");
    if (typeof speak === "function") speak("Alerte: Perte de connexion avec la boîte noire.");
    // Optionnel : Tentative de reconnexion automatique
  },

  handleTelemetry: function (event) {
    const value = event.target.value;
    const decoder = new TextDecoder("utf-8");
    const dataString = decoder.decode(value);
    
    try {
      // Ex: {"g": 1.2, "spd": 45, "lean": 12}
      const data = JSON.parse(dataString);
      
      // Injecte les données dans le buffer logiciel local de la Blackbox
      if (window.Blackbox) {
        window.Blackbox.push({
            event: "BLE_TELEMETRY",
            gForce: data.g || 1.0,
            speed: data.spd || 0,
            leanAngle: data.lean || 0,
            timestamp: Date.now()
        });
      }

    } catch (err) {
      console.error("Erreur parsing BLE:", err);
    }
  }
};
