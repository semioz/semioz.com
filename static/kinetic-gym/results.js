(() => {
  const root = document.querySelector("[data-passk-results]");
  if (!root) return;
  const tabs = [...root.querySelectorAll("[data-passk-select]")];
  const panels = [...root.querySelectorAll("[data-passk-heatmap]")];
  const models = [...root.querySelectorAll("[data-passk-focus]")];

  function focusModel(event) {
    if (event.type === "pointerenter" || event.type === "focus") event.currentTarget.removeAttribute("data-tooltip-dismissed");
    const keyboard = root.querySelector("button[data-passk-focus]:focus-visible");
    const hovered = root.querySelector("[data-passk-focus]:hover");
    const current = event.type === "focus" && keyboard ? keyboard : hovered || keyboard;
    models.forEach((node) => {
      const active = node.dataset.passkFocus === current?.dataset.passkFocus;
      node.classList.toggle("is-muted", current !== null && !active);
      node.classList.toggle("is-focused", active);
    });
  }

  for (const model of models) {
    for (const type of ["pointerenter", "pointerleave", "focus", "blur"]) {
      model.addEventListener(type, focusModel);
    }
  }

  function select(tab, focus = false) {
    tabs.forEach((button) => {
      const active = button === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.passkHeatmap !== tab.dataset.passkSelect;
    });
    if (focus) tab.focus();
  }

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      root.querySelectorAll("[data-passk-point]").forEach((point) => point.setAttribute("data-tooltip-dismissed", ""));
    }
  });

  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-passk-select]");
    if (tab) select(tab);
  });
  root.querySelector("[role=tablist]").addEventListener("keydown", (event) => {
    const index = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
    const indices = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(indices, event.key)) return;
    event.preventDefault();
    select(tabs[indices[event.key]], true);
  });

  // Draw the curves and fill the heatmap once, the first time the section scrolls into view.
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    root.classList.add("is-armed");
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      root.classList.add("is-drawn");
      observer.disconnect();
      // Hand the chart back to its normal styles (hover dimming) once the draw-in is over.
      setTimeout(() => root.classList.remove("is-armed", "is-drawn"), 3500);
    }, { threshold: 0.2 });
    observer.observe(root);
  }
})();
