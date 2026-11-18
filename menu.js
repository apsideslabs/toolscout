/* Drawer navigation — hamburger, slide-in panel, backdrop, Escape to close. */
(function () {
  "use strict";
  var toggle = document.getElementById("menuToggle");
  var drawer = document.getElementById("drawer");
  var backdrop = document.getElementById("drawerBackdrop");
  var closeBtn = document.getElementById("drawerClose");
  if (!toggle || !drawer) return;

  function open() {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    if (backdrop) backdrop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    document.documentElement.style.overflow = "hidden";
    if (closeBtn) closeBtn.focus();
  }

  function shut() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    if (backdrop) backdrop.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.documentElement.style.overflow = "";
    toggle.focus();
  }

  toggle.addEventListener("click", function () {
    if (drawer.classList.contains("is-open")) shut(); else open();
  });
  if (closeBtn) closeBtn.addEventListener("click", shut);
  if (backdrop) backdrop.addEventListener("click", shut);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) shut();
  });
})();
