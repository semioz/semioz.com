(() => {
  const root = document.querySelector("[data-workshop-showcase]");
  if (!root) return;

  const tabs = [...root.querySelectorAll("[data-workshop-family]")];
  const panels = [...root.querySelectorAll("[data-workshop-panel]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let selected = 0;
  let inView = false;
  let wasVisible = false;
  let resumePlayback = true;

  function showVideoError(video) {
    video.hidden = true;
    video.parentElement.querySelector(".workshop-video-error").hidden = false;
  }

  function updatePlayback() {
    const video = panels[selected].querySelector("video");
    if (!video) return;
    if (!inView || document.hidden) {
      if (wasVisible) resumePlayback = !video.paused;
      wasVisible = false;
      video.pause();
      return;
    }
    wasVisible = true;
    if (!video.hasAttribute("src")) {
      video.muted = true;
      video.autoplay = false;
      video.src = video.dataset.videoSrc;
    }
    if (resumePlayback && !reducedMotion.matches) {
      video.play().catch((error) => {
        if (!["NotAllowedError", "AbortError"].includes(error.name)) showVideoError(video);
      });
    }
  }

  function selectFamily(index, focus = false) {
    if (selected === index) {
      if (focus) tabs[index].focus({ preventScroll: true });
      return;
    }
    const previousVideo = panels[selected].querySelector("video");
    if (previousVideo) {
      previousVideo.pause();
      previousVideo.removeAttribute("src");
      previousVideo.load();
    }
    selected = index;
    wasVisible = false;
    resumePlayback = true;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === selected));
      tab.tabIndex = i === selected ? 0 : -1;
      panels[i].hidden = i !== selected;
    });
    tabs[selected].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    if (focus) tabs[selected].focus({ preventScroll: true });
    observer.disconnect();
    inView = false;
    observer.observe(panels[selected].querySelector(".workshop-media-frame"));
    updatePlayback();
  }

  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-workshop-family]");
    if (tab) selectFamily(Number(tab.dataset.workshopFamily));
    const task = event.target.closest("[data-workshop-task]");
    if (!task) return;
    const panel = panels[selected];
    panel.querySelectorAll("[data-workshop-task]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button === task));
    });
    panel.querySelectorAll("[data-workshop-detail]").forEach((detail) => {
      detail.hidden = detail.dataset.workshopDetail !== task.dataset.workshopTask;
    });
  });

  root.querySelector("[role=tablist]").addEventListener("keydown", (event) => {
    const indices = { ArrowRight: (selected + 1) % tabs.length, ArrowLeft: (selected - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(indices, event.key)) return;
    event.preventDefault();
    selectFamily(indices[event.key], true);
  });

  root.querySelectorAll("video").forEach((video) => {
    video.addEventListener("error", () => showVideoError(video));
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) panels[selected].querySelector("video")?.pause();
  });
  document.addEventListener("visibilitychange", updatePlayback);
  const observer = new IntersectionObserver((entries) => {
    const entry = entries.find((item) => item.target === panels[selected].querySelector(".workshop-media-frame"));
    if (!entry || inView === entry.isIntersecting) return;
    inView = entry.isIntersecting;
    updatePlayback();
  });
  observer.observe(panels[selected].querySelector(".workshop-media-frame"));
})();
