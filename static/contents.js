(() => {
  const toc = document.querySelector("[data-article-toc]");
  if (!toc) return;

  const links = [...toc.querySelectorAll("a[href^='#']")];
  const headings = links.map((link) => document.getElementById(link.hash.slice(1)));
  const desktop = window.matchMedia("(min-width: 1280px)");
  let pending = false;

  function update() {
    pending = false;
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > 96) break;
      current = heading;
    }
    if (scrollY > 0 && Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2) {
      current = headings.at(-1);
    }
    for (const link of links) {
      if (link.hash === "#" + current.id) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }

  function syncLayout() {
    toc.open = desktop.matches;
    schedule();
  }

  toc.addEventListener("click", (event) => {
    if (!desktop.matches && event.target.closest("a")) toc.open = false;
  });
  desktop.addEventListener("change", syncLayout);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  new ResizeObserver(schedule).observe(document.querySelector(".article"));
  syncLayout();
})();
