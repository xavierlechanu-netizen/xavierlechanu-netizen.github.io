// --- CORE NAVIGATION (SAFE ZONE) ---
window.toggleMenu = function () {
  try {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
    if (sidebar) {
      sidebar.classList.toggle("active");
      if (overlay) overlay.classList.toggle("active");
    }
  } catch (e) {
    console.error("Menu Crash:", e);
  }
};

window.closeMenu = function () {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  if (sidebar) sidebar.classList.remove("active");
  if (overlay) overlay.classList.remove("active");
};