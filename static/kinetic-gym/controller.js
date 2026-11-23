(() => {
  const PHASES = {
    scan: ["scan", "watch the belt for a yellow track"],
    approach: ["approach", "hover over where the target will be"],
    descend: ["descend", "go down to the object"],
    close: ["close", "close the gripper, check its width"],
    retry: ["retry", "gripper closed on nothing, back up"],
    lift: ["lift", "lift and check the grip"],
    carry: ["carry", "move over the bin"],
    place: ["place", "lower into the bin"],
    release: ["release", "open the gripper"],
    retreat: ["retreat", "clear the rim, go back to watching"],
  };
  const ORDER = Object.keys(PHASES);
  const SPEEDS = [1, 0.25];
  const fmt = (x) => x.toFixed(3);

  document.querySelectorAll("[data-controller-replay]").forEach(async (root) => {
    const data = await fetch(root.dataset.src).then((r) => r.json());
    const base = root.dataset.frames;
    const frames = data.frames.map((f, i) => {
      const img = new Image();
      img.src = `${base}/f${String(i).padStart(3, "0")}.jpg`;
      return { ...f, img };
    });
    const $ = (sel) => root.querySelector(sel);
    const cam = $(".cr-cam img");
    const boxes = $(".cr-boxes");
    const list = $(".cr-phases");
    const ret = $(".cr-return");
    const clock = $(".cr-clock");
    const timeline = $(".cr-timeline");
    const head = $(".cr-head");
    const playBtn = $(".cr-play");
    const speedBtn = $(".cr-speed");

    list.innerHTML = ORDER.map((p) => `<li data-phase="${p}"><code>${PHASES[p][0]}</code><span>${PHASES[p][1]}</span></li>`).join("");
    const rows = Object.fromEntries([...list.children].map((li) => [li.dataset.phase, li]));

    const pct = (t) => `${(t / data.end) * 100}%`;
    timeline.insertAdjacentHTML("afterbegin",
      data.phases.map((s) => `<span class="cr-band" data-phase="${s.phase}" style="left:${pct(s.t0)};width:${pct(s.t1 - s.t0)}" title="${s.phase}"></span>`).join("") +
      frames.map((f) => `<span class="cr-frame" style="left:${pct(f.t)}"></span>`).join("") +
      data.events.filter((e) => e.kind !== "seen").map((e) => {
        const label = e.kind === "deposit" ? `in the bin (${e.count}/2)` : e.ok ? "grasp held" : `missed grasp (${e.width_mm} mm)`;
        const mark = e.kind === "deposit" ? "✓" : e.ok ? "" : "✕";
        return mark ? `<span class="cr-event" data-kind="${e.kind}" style="left:${pct(e.t)}" title="${label}">${mark}</span>` : "";
      }).join(""));

    let t = 0, playing = !matchMedia("(prefers-reduced-motion: reduce)").matches, speed = 0, last = null, shownFrame = -1, shownTick = -1;

    function phaseAt(time) {
      return data.phases.find((s) => time >= s.t0 && time < s.t1) || data.phases[data.phases.length - 1];
    }

    function render() {
      const tick = Math.min(data.ticks.length - 1, Math.floor(t / data.dt + 1e-6));
      let fi = 0;
      while (fi + 1 < frames.length && frames[fi + 1].tick <= tick) fi++;
      if (fi !== shownFrame) {
        shownFrame = fi;
        const f = frames[fi];
        cam.src = f.img.src;
        boxes.innerHTML = f.tracks.filter(([, , , fresh, done]) => fresh && !done).map(([id, color, [x0, y0, x1, y1]]) =>
          `<g data-id="${id}"><rect x="${x0 - 1}" y="${y0 - 1}" width="${x1 - x0 + 2}" height="${y1 - y0 + 2}" rx="2"/><text x="${x0}" y="${Math.max(9, y0 - 3)}">${color} #${id}</text></g>`).join("");
      }
      if (tick !== shownTick) {
        shownTick = tick;
        const [a, grip, target, done] = data.ticks[tick];
        const phase = phaseAt(tick * data.dt).phase;
        for (const [p, li] of Object.entries(rows)) li.classList.toggle("is-on", p === phase);
        boxes.querySelectorAll("g").forEach((g) => g.classList.toggle("is-target", Number(g.dataset.id) === target));
        ret.textContent = a ? `return [${a.slice(0, 3).map(fmt).join(", ")}, ${a[3].toFixed(0)}]` : "return None";
        const f = frames[shownFrame];
        clock.innerHTML = `<span>tick <b>${tick}</b></span><span>t <b>${(tick * data.dt).toFixed(2)} s</b></span><span>newest frame <b>${f.t.toFixed(1)} s</b></span><span>target <b>${target ? "#" + target : "none"}</b></span><span>in bin <b>${done}/2</b></span>`;
        head.style.left = pct(tick * data.dt);
      }
    }

    function loop(now) {
      if (playing) {
        if (last !== null) t += ((now - last) / 1000) * SPEEDS[speed];
        if (t >= data.end) t = 0;
        render();
      }
      last = now;
      requestAnimationFrame(loop);
    }

    function setPlaying(on) {
      playing = on;
      playBtn.textContent = on ? "Pause" : "Play";
      playBtn.setAttribute("aria-pressed", String(on));
    }

    playBtn.addEventListener("click", () => setPlaying(!playing));
    speedBtn.addEventListener("click", () => {
      speed = (speed + 1) % SPEEDS.length;
      speedBtn.textContent = `${SPEEDS[speed]}×`;
    });
    const seek = (e) => {
      const r = timeline.getBoundingClientRect();
      t = Math.max(0, Math.min(data.end - data.dt, ((e.clientX - r.left) / r.width) * data.end));
      render();
    };
    timeline.addEventListener("pointerdown", (e) => {
      setPlaying(false);
      timeline.setPointerCapture(e.pointerId);
      seek(e);
      timeline.onpointermove = seek;
    });
    timeline.addEventListener("pointerup", () => { timeline.onpointermove = null; });
    timeline.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      setPlaying(false);
      t = Math.max(0, Math.min(data.end - data.dt, t + step * 0.2));
      render();
    });

    setPlaying(playing);
    render();
    requestAnimationFrame(loop);
  });
})();
