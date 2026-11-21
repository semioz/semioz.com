(() => {
  const root = document.querySelector("[data-task-gallery]");
  if (!root) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const items = [...root.querySelectorAll("[data-gallery-motion]")].map((button) => ({
    button, video: button.querySelector("video"), enabled: !reducedMotion.matches, visible: false,
  }));

  function showError(item) {
    item.enabled = false;
    item.video.pause();
    item.button.disabled = true;
    item.button.setAttribute("aria-pressed", "false");
    item.button.closest("figure").querySelector("[data-gallery-error]").hidden = false;
  }

  function update(item) {
    if (!item.enabled || !item.visible || document.hidden) {
      item.video.pause();
      return;
    }
    item.video.muted = true;
    if (!item.video.hasAttribute("src")) item.video.src = item.video.dataset.videoSrc;
    item.video.play().catch((error) => {
      if (!["NotAllowedError", "AbortError"].includes(error.name)) showError(item);
    });
  }

  for (const item of items) {
    item.button.disabled = false;
    item.button.addEventListener("click", () => {
      item.enabled = item.video.paused;
      update(item);
    });
    for (const event of ["play", "pause"]) {
      item.video.addEventListener(event, () => {
        item.button.setAttribute("aria-pressed", String(!item.video.paused));
      });
    }
    item.video.addEventListener("error", () => showError(item));
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const item = items.find((item) => item.button === entry.target);
      item.visible = entry.isIntersecting;
      update(item);
    }
  }, { threshold: 0.2 });
  items.forEach((item) => observer.observe(item.button));
  document.addEventListener("visibilitychange", () => items.forEach(update));
  reducedMotion.addEventListener("change", () => {
    items.forEach((item) => {
      item.enabled = !reducedMotion.matches;
      update(item);
    });
  });
})();
