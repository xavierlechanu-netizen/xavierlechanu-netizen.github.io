// PWA Installation Logic
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btnInstall = document.getElementById("btn-install-pwa");
  if (btnInstall) btnInstall.classList.remove("hidden");
});

window.installPWA = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    const btnInstall = document.getElementById("btn-install-pwa");
    if (btnInstall) btnInstall.classList.add("hidden");
  }
  deferredPrompt = null;
};

// Gestion de la touche "Retour" sur Android (PWA)
window.addEventListener("popstate", (e) => {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("screen-overlay");
  if (sidebar && !sidebar.classList.contains("sidebar-hidden")) {
    toggleMenu();
    history.pushState(null, null, window.location.pathname);
  } else if (overlay && !overlay.classList.contains("hidden")) {
    closeScreen();
    history.pushState(null, null, window.location.pathname);
  }
});
history.pushState(null, null, window.location.pathname);
