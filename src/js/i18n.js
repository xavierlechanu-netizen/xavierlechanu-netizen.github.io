// --- I18N SYSTEM ---
window.updateI18N = function () {
  const t = window.t || ((k) => k);
  const setHtml = (el, str) => {
    if (window.DOMSecurity && window.DOMSecurity.safeHTML) {
      window.DOMSecurity.safeHTML(el, str);
    } else {
      // eslint-disable-next-line no-restricted-syntax
      el.innerHTML = str;
    }
  };
  const mGarage = document.getElementById("menu-garage");
  if (mGarage)
    setHtml(mGarage, `<i class="fa-solid fa-warehouse"></i> ${t("garage")}`);
  const mRoadbooks = document.getElementById("menu-roadbooks");
  if (mRoadbooks)
    setHtml(mRoadbooks, `<i class="fa-solid fa-map-location-dot"></i> Roadbooks`);
  const mSafety = document.getElementById("menu-rodage");
  if (mSafety)
    setHtml(mSafety, `<i class="fa-solid fa-gauge-high"></i> ${t("safety")}`);
  const mInsurance = document.getElementById("menu-insurance");
  if (mInsurance)
    setHtml(mInsurance, `<i class="fa-solid fa-shield-halved"></i> ${t("insurance")}`);
  const mMechanic = document.getElementById("menu-mechanic");
  if (mMechanic)
    setHtml(mMechanic, `<i class="fa-solid fa-robot"></i> ${t("maintenance")}`);
  const mArbitre = document.getElementById("menu-arbitre");
  if (mArbitre)
    setHtml(mArbitre, `<i class="fa-solid fa-scale-balanced"></i> ${t("arbitre")}`);
  const lStop = document.getElementById("label-stop-nav");
  if (lStop) lStop.textContent = t("stop");
  const lReroute = document.getElementById("label-reroute");
  if (lReroute) lReroute.textContent = t("reroute");

  const gasLabel =
    document.querySelector("[onclick=\"scanRadar('fuel')\"] span") ||
    document.querySelector("[onclick=\"scanRadar('fuel')\"]");
  if (gasLabel)
    setHtml(gasLabel, `<i class="fa-solid fa-gas-pump"></i> ${t("gas")}`);
  const emergencyLabel =
    document.querySelector("[onclick=\"scanRadar('doctors')\"] span") ||
    document.querySelector("[onclick=\"scanRadar('doctors')\"]");
  if (emergencyLabel)
    setHtml(emergencyLabel, `<i class="fa-solid fa-hospital"></i> ${t("emergency")}`);
  const bankLabel =
    document.querySelector("[onclick=\"scanRadar('atm')\"] span") ||
    document.querySelector("[onclick=\"scanRadar('atm')\"]");
  if (bankLabel)
    setHtml(bankLabel, `<i class="fa-solid fa-money-bill-1"></i> ${t("bank")}`);
};