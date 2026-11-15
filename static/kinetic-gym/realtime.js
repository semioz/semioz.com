(() => {
  const root = document.querySelector("[data-realtime-demo]");
  if (!root) return;

  // Sweep a playhead across the timing figure in real seconds, hold on the outcome, repeat.
  const span = Number(root.dataset.rtSpan), x0 = Number(root.dataset.rtX0), x1 = Number(root.dataset.rtX1);
  const HOLD = 2.4;
  const future = root.querySelector("[data-rt-future]");
  const playhead = root.querySelector("[data-rt-playhead]");
  const clock = root.querySelector("[data-rt-clock]");
  const outcomes = [...root.querySelectorAll("[data-rt-outcome]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function render(t) {
    const px = x0 + (Math.min(t, span) / span) * (x1 - x0);
    future.setAttribute("x", px.toFixed(1));
    playhead.setAttribute("transform", `translate(${(px - x0).toFixed(1)} 0)`);
    clock.textContent = `${Math.min(t, span).toFixed(1)} s`;
    outcomes.forEach((node) => node.classList.toggle("is-shown", t >= Number(node.dataset.rtOutcome)));
  }

  let inView = false, start = null, frame = null;
  function tick(now) {
    if (start === null) start = now;
    render(((now - start) / 1000) % (span + HOLD));
    frame = inView && !document.hidden ? requestAnimationFrame(tick) : null;
  }
  function update() {
    if (reducedMotion.matches) return render(span);
    if (inView && !document.hidden && frame === null) frame = requestAnimationFrame(tick);
  }
  new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    update();
  }).observe(root);
  document.addEventListener("visibilitychange", update);
  reducedMotion.addEventListener("change", update);
  render(reducedMotion.matches ? span : 0);
})();
