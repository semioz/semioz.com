import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderMarkdown } from "../scripts/build.js";

test("task gallery reuses five recordings with level counts and no player controls", async () => {
  const { families } = JSON.parse(await readFile(new URL("../static/kinetic-gym/families.json", import.meta.url), "utf8"));
  const html = renderMarkdown("[[task-gallery]]");
  const videos = html.match(/<video\b[^>]*>/g) || [];
  assert.equal(videos.length, 5);
  assert.equal((html.match(/class="task-gallery-card"/g) || []).length, 5);
  assert.equal((html.match(/8 catalog levels/g) || []).length, 5);
  assert.equal((html.match(/data-gallery-motion/g) || []).length, 5);
  for (const video of videos) {
    assert.match(video, /muted loop playsinline preload="none"/);
    assert.doesNotMatch(video, /\bcontrols\b|\sautoplay\b|\ssrc=/);
  }
  for (const family of families) {
    assert.ok(html.includes(`data-video-src="${family.video.src}"`));
    assert.ok(!html.includes(family.video.caption));
  }
  assert.match(html, /gallery\.js/);
  assert.doesNotMatch(html, /role="tab"|data-workshop-task/);
  assert.doesNotMatch(renderMarkdown("```text\n[[task-gallery]]\n```"), /data-task-gallery/);
});

test("gallery playback is lazy, respects motion preferences and retains manual pauses", async () => {
  let intersect;
  const attributes = {};
  const errorMessage = { hidden: true };
  const video = Object.assign(new EventTarget(), {
    paused: true,
    dataset: { videoSrc: "/preview.mp4" },
    hasAttribute(name) { return name === "src" && Boolean(this.src); },
    pause() { this.paused = true; this.dispatchEvent(new Event("pause")); },
    play() { this.paused = false; this.dispatchEvent(new Event("play")); return Promise.resolve(); },
  });
  const button = Object.assign(new EventTarget(), {
    disabled: true,
    querySelector: () => video,
    closest: () => ({ querySelector: () => errorMessage }),
    setAttribute: (name, value) => { attributes[name] = value; },
  });
  const media = Object.assign(new EventTarget(), { matches: true });
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: () => ({ querySelectorAll: () => [button] }),
  });
  runInNewContext(await readFile(new URL("../static/kinetic-gym/gallery.js", import.meta.url), "utf8"), {
    document,
    window: { matchMedia: () => media },
    IntersectionObserver: class {
      constructor(callback) { intersect = callback; }
      observe() {}
    },
  });
  assert.equal(button.disabled, false);
  intersect([{ target: button, isIntersecting: true }]);
  assert.equal(video.src, undefined);
  media.matches = false;
  media.dispatchEvent(new Event("change"));
  assert.equal(video.src, "/preview.mp4");
  assert.equal(video.muted, true);
  assert.equal(attributes["aria-pressed"], "true");

  button.dispatchEvent(new Event("click"));
  intersect([{ target: button, isIntersecting: false }]);
  intersect([{ target: button, isIntersecting: true }]);
  assert.equal(video.paused, true);
  button.dispatchEvent(new Event("click"));
  assert.equal(video.paused, false);
  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(video.paused, true);
  document.hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(video.paused, false);

  button.dispatchEvent(new Event("click"));
  video.play = () => Promise.reject(Object.assign(new Error("Autoplay blocked"), { name: "NotAllowedError" }));
  button.dispatchEvent(new Event("click"));
  await Promise.resolve();
  assert.equal(button.disabled, false);
  assert.equal(errorMessage.hidden, true);

  video.play = () => Promise.reject(new Error("Decode failure"));
  button.dispatchEvent(new Event("click"));
  await Promise.resolve();
  assert.equal(button.disabled, true);
  assert.equal(errorMessage.hidden, false);
  assert.equal(attributes["aria-pressed"], "false");
});
