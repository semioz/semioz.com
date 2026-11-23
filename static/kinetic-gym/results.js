document.querySelectorAll("[data-passk-results]").forEach((root) => {
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

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      root.querySelectorAll("[data-passk-point]").forEach((point) => point.setAttribute("data-tooltip-dismissed", ""));
    }
  });

  // Draw the curves once, the first time the section scrolls into view.
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
});
