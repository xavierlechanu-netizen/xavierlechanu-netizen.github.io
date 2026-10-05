// --- LITE MODE (PERFORMANCE) ---
window.isLiteMode = localStorage.getItem("liteMode") === "true";

window.promptLiteMode = function () {
  const modal = document.createElement("div");
  modal.id = "lite-modal";
  modal.style =
    "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(10,10,10,0.95); backdrop-filter:blur(5px); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; padding:30px; text-align:center;";
  // eslint-disable-next-line no-restricted-syntax
modal.innerHTML = `
        <i class="fa-solid fa-gauge-high" style="font-size:3rem; color:#00d2ff; margin-bottom:20px;"></i>
        <h2 style="margin-bottom:15px; color:#00d2ff;">Optimisation Suggérée</h2>
        <p style="font-size:0.9rem; line-height:1.4; margin-bottom:25px; color:#ccc;">
            Nous avons détecté que votre appareil pourrait être ralenti par certaines animations 3D et effets visuels de la carte.
            <br><br>
            Voulez-vous activer le <strong>Mode Éco / Performances</strong> pour une meilleure fluidité et préserver votre batterie ?
        </p>
        <button id="btn-accept-lite" style="width:100%; padding:15px; background:linear-gradient(135deg, #00d2ff, #0077b6); color:white; border:none; border-radius:30px; font-weight:bold; font-size:1rem; margin-bottom:15px;">ACTIVER LE MODE ÉCO (Recommandé)</button>
        <button id="btn-refuse-lite" style="background:transparent; border:1px solid #444; width:100%; padding:15px; border-radius:30px; color:#aaa; font-weight:bold; font-size:0.9rem;">NON, GARDER LA HAUTE QUALITÉ</button>
    `;
  document.body.appendChild(modal);

  document.getElementById("btn-accept-lite").onclick = () => {
    window.isLiteMode = true;
    localStorage.setItem("liteMode", "true");
    document.body.classList.add("lite-mode");
    modal.remove();
    if (typeof speak === "function")
      speak("Mode Éco activé pour des performances optimales.");
    setTimeout(() => location.reload(), 500);
  };

  document.getElementById("btn-refuse-lite").onclick = () => {
    window.isLiteMode = false;
    localStorage.setItem("liteMode", "false");
    modal.remove();
  };
};

if (localStorage.getItem("liteMode") === null) {
  const cores = navigator.hardwareConcurrency || 4;
  const ram = navigator.deviceMemory || 4; // deviceMemory is often undefined on iOS

  const ua = navigator.userAgent.toLowerCase();
  const isOldAndroid =
    ua.includes("android 6") ||
    ua.includes("android 7") ||
    ua.includes("android 8") ||
    ua.includes("android 9");
  const isOldIOS =
    ua.includes("iphone os 11") ||
    ua.includes("iphone os 12") ||
    ua.includes("iphone os 13");
  const isOldOS = isOldAndroid || isOldIOS;

  // We consider it an old device if it has <= 4 cores, OR <= 3GB of RAM, OR an old OS version
  if (cores <= 4 || ram <= 3 || isOldOS) {
    const showPrompt = () => {
      setTimeout(window.promptLiteMode, 500);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showPrompt);
    } else {
      showPrompt();
    }
  } else {
    window.isLiteMode = false;
    localStorage.setItem("liteMode", "false");
  }
}

window.toggleLiteMode = function () {
  window.isLiteMode = !window.isLiteMode;
  localStorage.setItem("liteMode", window.isLiteMode ? "true" : "false");
  if (window.ESGManager) {
    window.ESGManager.setEcoMode(window.isLiteMode);
  }
  if (window.isLiteMode) {
    document.body.classList.add("lite-mode");
    if (typeof speak === "function") speak("Mode Éco Performances activé.");
  } else {
    document.body.classList.remove("lite-mode");
    if (typeof speak === "function")
      speak("Mode Performances Maximales activé.");
  }
  setTimeout(() => location.reload(), 1500);
};

// Écoute des bascules automatiques ESG (ex: batterie faible <= 20% ou save-data)
window.addEventListener("esg-mode-change", (e) => {
  if (e.detail && e.detail.isLiteMode !== undefined) {
    window.isLiteMode = e.detail.isLiteMode;
    if (window.isLiteMode) {
      document.body.classList.add("lite-mode");
    } else {
      document.body.classList.remove("lite-mode");
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  if (window.isLiteMode) document.body.classList.add("lite-mode");
});