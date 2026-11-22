import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildSite, readContentFile, renderMarkdown } from "../scripts/build.js";

test("readContentFile parses frontmatter and derives slug from filename", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "semihb-test-"));
  const filePath = join(root, "content", "essays", "my-post.md");
  await mkdir(join(root, "content", "essays"), { recursive: true });
  await writeFile(
    filePath,
    `---
title: Test Post
date: 2026-05-04T00:00:00+00:00
description: Short summary
topics:
  - rl
  - systems
---

# Hello
`,
  );

  const post = await readContentFile(filePath);

  assert.equal(post.slug, "my-post");
  assert.equal(post.title, "Test Post");
  assert.equal(post.description, "Short summary");
  assert.deepEqual(post.topics, ["rl", "systems"]);
  assert.match(post.html, /<h1[^>]*>Hello<\/h1>/);
});

test("renderMarkdown supports fenced code highlighting and normal markdown", () => {
  const html = renderMarkdown(`## Example

\`\`\`python
print("hi")
\`\`\`

![diagram](/first.png)

**THING_HERE** matters.

| metric | before | after |
|---|---|---|
| reward | -0.090 | +0.043 |
| failures per episode | 7.0 | 1.0 |
`);

  assert.match(html, /<h2[^>]*>Example<\/h2>/);
  assert.match(html, /class="hljs language-python"/);
  assert.match(html, /<span class="hljs-/);
  assert.match(html, /print/);
  assert.match(html, /<img src="\/first\.png" alt="diagram">/);
  assert.match(html, /<strong>THING_HERE<\/strong> matters\./);
  assert.doesNotMatch(html, /\*\*THING_HERE\*\*/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>metric<\/th>/);
  assert.match(html, /<td>reward<\/td>/);
  assert.match(html, /<td>\+0\.043<\/td>/);
  assert.doesNotMatch(html, /\|---\|---\|---\|/);
});

test("articles generate Contents from Markdown headings and retain wide images", async () => {
  const root = await mkdtemp(join(tmpdir(), "semihb-toc-test-"));
  await mkdir(join(root, "content", "essays"), { recursive: true });
  await writeFile(join(root, "content", "about.md"), "About.");
  await writeFile(join(root, "content", "essays", "post.md"), [
    '## A **heading** & [link](/example)',
    '![Wide](/wide.png "diagram")',
    '### Detail',
    '## A **heading** & [link](/example)',
    '```text\n## Not a section\n```',
    '<!--\n## Private note\n-->',
    '[[workshop-showcase]]',
    '[[passk-results]]',
  ].join("\n\n"));
  await writeFile(join(root, "content", "essays", "plain.md"), "A post without headings.");
  await buildSite({ rootDir: root, outDir: join(root, "public") });
  const post = await readFile(join(root, "public", "blog", "post", "index.html"), "utf8");
  const toc = post.match(/<nav aria-label="Contents">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(toc);
  assert.equal((toc.match(/<a /g) || []).length, 3);
  assert.match(toc, /href="#section-1">A heading &amp; link<\/a>/);
  assert.match(toc, /class="toc-subheading"><a href="#section-2">Detail<\/a>/);
  assert.match(toc, /href="#section-3">A heading &amp; link<\/a>/);
  assert.doesNotMatch(toc, /Not a section|Private note|Overall pass@k|workshop-/);
  assert.match(post, /<h2 id="section-1">A <strong>heading<\/strong>/);
  assert.match(post, /<h3 id="section-2">Detail<\/h3>/);
  assert.match(post, /<h2 id="section-3">/);
  assert.match(post, /<img src="\/wide\.png" alt="Wide" class="diagram">/);
  assert.match(post, /<details class="article-toc" data-article-toc open>/);
  assert.match(post, /<script src="\/contents\.js" defer><\/script>/);
  for (const path of ["index.html", "writing/index.html", "blog/plain/index.html"]) {
    assert.doesNotMatch(await readFile(join(root, "public", path), "utf8"), /data-article-toc|src="\/contents\.js"/);
  }
});

test("site uses Manrope as its primary typeface", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /font-family:\s*"Manrope", sans-serif/);
});

test("article prose text uses theme variables for light-mode readability", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.prose\s*\{\s*color:\s*var\(--text\)/);
  assert.doesNotMatch(css, /\.prose\s*\{\s*color:\s*#[0-9a-f]{6}/i);
});

test("dark mode uses an inky black background", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /:root\s*\{\s*color-scheme:\s*dark;\s*--bg:\s*#0b0b0b;/);
});

test("article pages use a slightly zoomed-out reading scale", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.article\s*\{[^}]*font-size:\s*\.94rem/s);
  assert.match(css, /h1\s*\{[^}]*clamp\(2rem,/s);
});

test("buildSite writes the expected minimal routes and copies static assets", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "semihb-test-"));
  await mkdir(join(root, "content", "essays"), { recursive: true });
  await mkdir(join(root, "static"), { recursive: true });
  await writeFile(join(root, "CNAME"), "semioz.com\n");
  await writeFile(join(root, "static", "first.png"), "fake image");
  await writeFile(join(root, "static", ".DS_Store"), "junk");
  await writeFile(
    join(root, "content", "about.md"),
    `+++
title = "About"
date = "2026-05-04"
+++

I'm Semih Berkay Ozturk, a software engineer focused on RL/post-training and distributed systems. I like building systems that are scalable, reliable, and useful in practice.
`,
  );
  await writeFile(
    join(root, "content", "essays", "first-post.md"),
    `---
title: First Post
date: 2025-08-13T02:01:58+05:30
description: Description
topics:
  - ai
---

Post body.
`,
  );

  await buildSite({ rootDir: root, outDir: join(root, "public") });

  const index = await readFile(join(root, "public", "index.html"), "utf8");
  const post = await readFile(join(root, "public", "blog", "first-post", "index.html"), "utf8");
  const oldLink = await readFile(join(root, "public", "essays", "first-post", "index.html"), "utf8");
  assert.match(oldLink, /http-equiv="refresh" content="0; url=\/blog\/first-post\/"/);
  const writing = await readFile(join(root, "public", "writing", "index.html"), "utf8");
  const asset = await readFile(join(root, "public", "first.png"), "utf8");
  const cname = await readFile(join(root, "public", "CNAME"), "utf8");

  assert.match(index, /First Post/);
  assert.match(index, /semioz\.com/);
  assert.match(index, /semioz\.com/);
  assert.match(index, /Semih Berkay Ozturk/);
  assert.doesNotMatch(index, /class="post-accent"/);
  assert.match(index, /href="https:\/\/www\.linkedin\.com\/in\/semioz\/" aria-label="LinkedIn"/);
  assert.match(index, /family=Manrope:/);
  for (const html of [index, post, writing]) {
    assert.match(html, /<html lang="en" data-theme="light">/);
    assert.match(html, /localStorage\.getItem\("theme"\) \|\| "light"/);
    assert.match(html, /data-theme-toggle[^>]*aria-label="Switch to dark theme"/);
  }
  assert.match(index, /localStorage\.setItem\("theme"/);
  assert.match(index, /<section class="section-heading"><span class="section-index">RECENT WRITINGS<\/span><\/section>/);
  assert.match(index, /href="\/blog\/first-post\/"/);
  assert.match(index, /aug 13, 2025/);
  assert.match(post, /Post body/);
  assert.match(index, /I’m Semih Berkay Ozturk, a software engineer focused on RL\/post-training and distributed systems/);
  assert.match(index, /href="\/writing\/">writing<\/a>/);
  assert.match(index, /⌘\+K/);
  const favicon = index.match(/href="data:image\/svg\+xml,([^"]+)"/);
  assert.ok(favicon);
  assert.match(decodeURIComponent(favicon[1]), /👾/);
  assert.doesNotMatch(index, /href="\/favicon\.svg"/);
  assert.match(writing, /href="\/blog\/first-post\/"/);
  assert.match(writing, /<span class="brand">semioz\.com<\/span>/);
  assert.doesNotMatch(writing, /←/);
  assert.doesNotMatch(writing, /home-intro/);
  await assert.rejects(access(join(root, "public", "about")));
  await assert.rejects(access(join(root, "public", "projects")));
  assert.equal(asset, "fake image");
  assert.equal(cname, "semioz.com\n");
  await assert.rejects(access(join(root, "public", ".DS_Store")));
});

test("draft posts have a direct URL but are absent from listings and search", async () => {
  const root = await mkdtemp(join(tmpdir(), "semihb-test-"));
  const essays = join(root, "content", "essays");
  await mkdir(essays, { recursive: true });
  await writeFile(join(root, "content", "about.md"), "# About\n");
  await writeFile(join(essays, "published.md"), `---
title: Published Post
date: 2025-01-01
draft: false
---

Published body.
`);
  await writeFile(join(essays, "unpublished.md"), `---
title: Unpublished Post
date: 2026-01-01
draft: true
---

Unpublished body.
`);

  await buildSite({ rootDir: root, outDir: join(root, "public") });

  const index = await readFile(join(root, "public", "index.html"), "utf8");
  const writing = await readFile(join(root, "public", "writing", "index.html"), "utf8");
  const search = await readFile(join(root, "public", "search-index.json"), "utf8");
  const draft = await readFile(join(root, "public", "blog", "unpublished", "index.html"), "utf8");
  const published = await readFile(join(root, "public", "blog", "published", "index.html"), "utf8");

  assert.match(index, /1 posts · updated january 2025/);
  for (const page of [index, writing, search]) {
    assert.match(page, /Published Post/);
    assert.doesNotMatch(page, /Unpublished Post|unpublished/);
  }
  assert.match(draft, /Unpublished Post/);
  assert.match(draft, /Unpublished body\./);
  assert.match(draft, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(published, /<meta name="robots" content="noindex">/);
});

test("home page includes an accessible portrait engraving with a non-WebGL fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "semihb-test-"));
  await mkdir(join(root, "content", "essays"), { recursive: true });
  await mkdir(join(root, "static", "images"), { recursive: true });
  await writeFile(join(root, "content", "about.md"), "# About\n");
  await writeFile(join(root, "static", "images", "semihport.jpg"), "portrait");

  await buildSite({ rootDir: root, outDir: join(root, "public") });

  const index = await readFile(join(root, "public", "index.html"), "utf8");
  assert.match(index, /<a class="brand-lockup" href="\/" aria-label="Home">\s*<figure class="portrait-engraving"/);
  assert.match(index, /<span class="brand">semioz<\/span>/);
  assert.match(index, /data-portrait-engraving[^>]*role="img"[^>]*aria-label="Engraved portrait of Semih Berkay Öztürk"/);
  assert.match(index, /<canvas[^>]*class="portrait-engraving-canvas"/);
  assert.match(index, /<img[^>]*src="\/images\/semihport\.jpg"[^>]*alt=""[^>]*aria-hidden="true"/);
  assert.match(index, /<script src="\/portrait-engraving\.js" defer><\/script>/);
});

test("portrait shader preserves transparent paper around the engraving", async () => {
  const shader = await readFile(new URL("../static/portrait-engraving.js", import.meta.url), "utf8");

  assert.match(shader, /getContext\("webgl", \{ alpha: true \}\)/);
  assert.match(shader, /vec4\(u_ink \* alpha, alpha\)/);
});

test("portrait engraving uses a restrained hero footprint", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const mobileRules = css.match(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}\n\n@media/)?.[1] || "";

  assert.match(css, /\.portrait-engraving\s*\{[^}]*height:\s*72px[^}]*width:\s*72px/s);
  assert.doesNotMatch(mobileRules, /portrait-engraving/);
});

test("built pages version the stylesheet by its content so old CSS cannot style new HTML", async () => {
  const root = await mkdtemp(join(tmpdir(), "semihb-css-test-"));
  await mkdir(join(root, "content", "essays"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "content", "about.md"), "About.");
  await writeFile(join(root, "content", "essays", "post.md"), "Post.");
  const cssPath = join(root, "src", "styles.css");
  const outDir = join(root, "public");
  const cssUrl = async (route = "index.html") => {
    const html = await readFile(join(outDir, route), "utf8");
    return html.match(/href="(\/styles\.css[^\"]*)"/)?.[1];
  };
  await writeFile(cssPath, "body { color: red; }");
  await buildSite({ rootDir: root, outDir });
  const first = await cssUrl();
  assert.match(first, /^\/styles\.css\?v=[a-f0-9]{12}$/);
  assert.equal(await cssUrl("writing/index.html"), first);
  assert.equal(await cssUrl("blog/post/index.html"), first);
  await buildSite({ rootDir: root, outDir });
  assert.equal(await cssUrl(), first);
  await writeFile(cssPath, "body { color: blue; }");
  await buildSite({ rootDir: root, outDir });
  assert.notEqual(await cssUrl(), first);
  assert.equal(await readFile(join(outDir, "styles.css"), "utf8"), "body { color: blue; }");
});

test("workshop embed starts with Conveyor and renders five families including the humanoid task", () => {
  const html = renderMarkdown("Before.\n\n[[workshop-showcase]]\n\nAfter.");
  assert.match(html, /id="task-families"[^>]*data-workshop-showcase/);
  assert.equal((html.match(/role="tab"/g) || []).length, 5);
  assert.match(html, /id="workshop-tab-0"[^>]*aria-selected="true"[\s\S]*?Conveyor picking/);
  assert.doesNotMatch(html, /tower/i);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 5);
  assert.equal((html.match(/data-workshop-task=/g) || []).length, 40);
  assert.equal((html.match(/<video\b/g) || []).length, 5);
  assert.equal((html.match(/Video coming soon/g) || []).length, 0);
  assert.match(html, /Humanoid goalkeeper/);
  assert.doesNotMatch(html, /moving-platform/i);
  assert.doesNotMatch(html, /Reference demo|not a solver rollout|Family preview/);
  assert.match(html, /<script src="\/kinetic-gym\/showcase\.js" defer><\/script>/);
  assert.match(html, /<p>Before\.<\/p>/);
  assert.match(html, /<p>After\.<\/p>/);
  assert.doesNotMatch(html, /\[\[workshop-showcase\]\]|TEST TASK|HARDEST/);
});

test("workshop catalog pins its source, keeps eight unique tasks per family and uses existing media", async () => {
  const catalog = JSON.parse(await readFile(new URL("../static/kinetic-gym/families.json", import.meta.url), "utf8"));
  assert.match(catalog.revision, /^[a-f0-9]{40}$/);
  assert.equal(new Set(catalog.families.map((family) => family.id)).size, 5);
  for (const id of ["robot-aerial-handoff"]) {
    const family = catalog.families.find((family) => family.id === id);
    assert.ok(family);
    assert.match(family.tasks[0].description, /Unitree G1 in front of a goal/);
  }
  assert.equal(catalog.families[0].id, "conveyor-selective-picking");
  assert.ok(catalog.families.every((family) => !family.id.includes("tower")));
  const taskIds = catalog.families.flatMap((family) => family.tasks.map((task) => task.id));
  assert.equal(new Set(taskIds).size, 40);
  for (const family of catalog.families) {
    assert.equal(family.tasks.length, 8);
    assert.ok(family.tasks.every((task) => task.title && task.description));
    if (family.video) {
      for (const url of [family.video.src, family.video.poster]) {
        assert.ok(url.startsWith("/kinetic-gym/"));
        await access(new URL(`../static${url}`, import.meta.url));
      }
    }
  }
});

test("workshop embed stays literal inside fenced code and editorial comments stay private", () => {
  const code = renderMarkdown("```text\n[[workshop-showcase]]\n```");
  assert.doesNotMatch(code, /data-workshop-showcase/);
  assert.match(code, /\[\[workshop-showcase\]\]/);
  const html = renderMarkdown("Before.\n\n<!-- Private draft note\nDo not publish this note.\n-->\n\nAfter.");
  assert.doesNotMatch(html, /Private draft|Do not publish|&lt;!--/);
  assert.match(html, /<p>Before\.<\/p>/);
  assert.match(html, /<p>After\.<\/p>/);
});

test("performance figures stack at a capped width with transparent backgrounds", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const results = css.match(/^\.passk-results\s*\{([^}]+)\}/m)?.[1];
  assert.match(results, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(results, /width:\s*min\(980px, calc\(100vw - 48px\)\)/);
  const card = css.match(/\.passk-card\s*\{([^}]+)\}/)?.[1];
  assert.match(card, /background:\s*transparent/);
  assert.match(card, /border:\s*0/);
  assert.match(card, /padding:\s*0/);
  assert.match(css, /\.passk-chart\s*\{[^}]*grid-template-rows:\s*clamp\(280px, 32vw, 440px\) 24px/s);
  assert.match(css, /\.passk-results \.passk-heatmap\s*\{[^}]*font-size:\s*\.85rem/s);
});

test("pass@k embed renders curves and three family heatmaps without disclaimer badges", () => {
  const html = renderMarkdown("[[passk-results]]");
  assert.match(html, /id="model-results"/);
  assert.equal((html.match(/class="passk-family"/g) || []).length, 5);
  assert.equal((html.match(/data-passk-series=/g) || []).length, 10);
  assert.equal((html.match(/data-passk-point=/g) || []).length, 30);
  assert.doesNotMatch(html, /Overall pass@k/);
  assert.equal((html.match(/data-passk-heatmap=/g) || []).length, 3);
  assert.match(html, /id="passk-tab-1"[^>]*aria-selected="true" tabindex="0"/);
  assert.match(html, /data-passk-heatmap="1" tabindex="0">/);
  assert.match(html, /data-passk-heatmap="3" tabindex="0" hidden>/);
  assert.match(html, /data-passk-heatmap="5" tabindex="0" hidden>/);
  assert.match(html, /The heatmap shows pass@1\./);
  assert.equal((html.match(/data-passk-score=/g) || []).length, 30);
  assert.equal((html.match(/data-passk-missing/g) || []).length, 15);
  assert.doesNotMatch(html, /tower/i);
  assert.doesNotMatch(html, /data-dummy-label|Dummy data — not measured/);
  assert.doesNotMatch(html, /passk-intro|These charts use illustrative placeholder values/);
  assert.match(html, /GPT-6\.1 Sol/);
  assert.match(html, /DeepSeek V4\.1 Flash/);
  assert.match(html, /Gemini Carbon/);
  assert.doesNotMatch(html, /<title>Gemini Carbon:/);
  assert.doesNotMatch(renderMarkdown("```text\n[[passk-results]]\n```"), /id="model-results"/);
});

test("pass@k curves expose hover and keyboard focus targets without toggle state", () => {
  const html = renderMarkdown("[[passk-results]]");
  assert.equal((html.match(/<button[^>]*data-passk-focus=/g) || []).length, 3 + 30);
  assert.doesNotMatch(html, /aria-pressed=/);
  assert.equal((html.match(/<g[^>]*data-passk-focus=/g) || []).length, 10);
  assert.equal((html.match(/class="passk-hit"/g) || []).length, 10);
  assert.equal((html.match(/data-passk-focus=/g) || []).length, 3 + 30 + 10);
  assert.match(html, /class="passk-legend" role="group" aria-label="Highlight a model"/);
});

test("pass@k points show exact, accessible scores on hover and keyboard focus", async () => {
  const { renderPasskResults } = await import("../scripts/build.js");
  const html = renderPasskResults(await passkFixture());
  const points = html.match(/<button\b[^>]*data-passk-point=[^>]*><\/button>/g) || [];
  assert.equal(points.length, 5 * 5 * 3);
  assert.match(points[0], /type="button"/);
  assert.match(points[0], /aria-label="Conveyor picking, Sol · pass@1: 20\.0%"/);
  assert.doesNotMatch(points.join(""), /aria-hidden|\btitle=/);
  assert.match(html, /class="passk-chart" role="group"/);
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.passk-point::after\s*\{[^}]*content:\s*attr\(aria-label\)/s);
  assert.match(css, /\.passk-point:not\(\[data-tooltip-dismissed\]\):is\(:hover, :focus-visible\)::after/);
});

async function passkFixture() {
  const { families } = JSON.parse(await readFile(new URL("../static/kinetic-gym/families.json", import.meta.url), "utf8"));
  return {
    dummy: true,
    models: ["Sol", "Opus", "DeepSeek", "GLM", "Qwen"].map((name) => ({
      name,
      avgApiCostUsdPerEpisode: 0.125,
      passAtKPercent: Object.fromEntries(families.map((family) => [family.id, { 1: 20, 3: 40, 5: 60 }])),
    })),
  };
}

test("pass@k curves show each family's own rates, with no dummy label for measured data", async () => {
  const { renderPasskResults } = await import("../scripts/build.js");
  assert.equal(typeof renderPasskResults, "function");
  const results = await passkFixture();
  results.models[0].passAtKPercent["conveyor-selective-picking"] = { 1: 90, 3: 95, 5: 100 };
  const html = renderPasskResults(results);
  assert.match(html, /<title>Sol: pass@1 90\.0%, pass@3 95\.0%, pass@5 100\.0%<\/title>/);
  assert.doesNotMatch(html, /pass@1 34\.0%/);
  assert.doesNotMatch(html, /Show exact values|class="passk-values"|data-passk-overall/);
  assert.match(html, /class="passk-heatmap"/);
  results.dummy = false;
  assert.doesNotMatch(renderPasskResults(results), /data-dummy-label|not measured|dummy data/);
  results.models[0].name = "<img src=x onerror=alert(1)>";
  assert.doesNotMatch(renderPasskResults(results), /<img\b/);
  assert.match(renderPasskResults(results), /&lt;img/);
});

test("pass@k rendering rejects missing families, invalid percentages and decreasing rates", async () => {
  const { renderPasskResults } = await import("../scripts/build.js");
  assert.equal(typeof renderPasskResults, "function");
  const fixture = await passkFixture();
  for (const value of [NaN, Infinity, -1, 101, "50", true, null]) {
    const results = structuredClone(fixture);
    results.models[0].passAtKPercent["conveyor-selective-picking"][1] = value;
    assert.throws(() => renderPasskResults(results), /percentages/);
  }
  const missing = structuredClone(fixture);
  delete missing.models[0].passAtKPercent["conveyor-selective-picking"];
  assert.throws(() => renderPasskResults(missing), /families/);
  const extra = structuredClone(fixture);
  extra.models[0].passAtKPercent.unknown = { 1: 20, 3: 40, 5: 60 };
  assert.throws(() => renderPasskResults(extra), /families/);
  const decreasing = structuredClone(fixture);
  decreasing.models[0].passAtKPercent["conveyor-selective-picking"][1] = 70;
  assert.throws(() => renderPasskResults(decreasing), /non-decreasing/);
  assert.throws(() => renderPasskResults({ ...fixture, dummy: "true" }), /dummy/);
  const duplicate = structuredClone(fixture);
  duplicate.models[1].name = ` ${duplicate.models[0].name} `;
  assert.throws(() => renderPasskResults(duplicate), /Model names/);
  for (const value of [0, 100]) {
    const boundary = structuredClone(fixture);
    for (const model of boundary.models) {
      for (const rates of Object.values(model.passAtKPercent)) Object.assign(rates, { 1: value, 3: value, 5: value });
    }
    assert.doesNotThrow(() => renderPasskResults(boundary));
  }
});

test("pass@k marks unmeasured families and draws only the models measured on each family", async () => {
  const { renderPasskResults } = await import("../scripts/build.js");
  const results = await passkFixture();
  results.models = results.models.slice(0, 2);
  results.models[0].passAtKPercent["conveyor-selective-picking"] = { 1: 90, 3: 95, 5: 100, tasks: 20 };
  for (const model of results.models) {
    for (const id of Object.keys(model.passAtKPercent)) if (id !== "conveyor-selective-picking") model.passAtKPercent[id] = null;
  }
  results.models[1].passAtKPercent["swinging-crane-hook"] = { 1: 10, 3: 10, 5: 10, tasks: 12 };
  const html = renderPasskResults(results);
  assert.match(html, /<title>Sol: pass@1 90\.0%, pass@3 95\.0%, pass@5 100\.0%<\/title>/);
  assert.match(html, /<title>Opus: pass@1 20\.0%, pass@3 40\.0%, pass@5 60\.0%<\/title>/);
  const families = Object.keys(results.models[0].passAtKPercent).length;
  assert.equal((html.match(/data-passk-missing/g) || []).length, 3 * (2 * families - 3));
  const crane = html.split('id="passk-curve-swinging-crane-hook"')[1].split('class="passk-family"')[0];
  assert.equal((crane.match(/data-passk-series=/g) || []).length, 1);
  assert.doesNotMatch(html, /passk-family-levels|Opus 12 levels/);
  for (const model of results.models) for (const id of Object.keys(model.passAtKPercent)) model.passAtKPercent[id] = null;
  assert.throws(() => renderPasskResults(results), /curve/);
  results.models[0].passAtKPercent["conveyor-selective-picking"] = { 1: 10, 3: 10, 5: 10, tasks: 1 };
  results.models[0].passAtKPercent["swinging-crane-hook"] = { 1: 10, 3: 10, 5: 10, tasks: 0 };
  assert.throws(() => renderPasskResults(results), /tasks/);
});

test("pass@k keeps a family marked overall: false in the heatmap but draws no curve for it", async () => {
  const { renderPasskResults } = await import("../scripts/build.js");
  const results = await passkFixture();
  results.models = results.models.slice(0, 2);
  for (const model of results.models) {
    for (const id of Object.keys(model.passAtKPercent)) model.passAtKPercent[id] = null;
    model.passAtKPercent["conveyor-selective-picking"] = { 1: 50, 3: 60, 5: 70, tasks: 5 };
    model.passAtKPercent["tilting-marble-maze"] = { 1: 0, 3: 0, 5: 0, tasks: 1, overall: false };
  }
  const html = renderPasskResults(results);
  assert.match(html, /<title>Sol: pass@1 50\.0%, pass@3 60\.0%, pass@5 70\.0%<\/title>/);
  assert.doesNotMatch(html, /id="passk-curve-tilting-marble-maze"/);
  assert.equal((html.match(/data-passk-score=/g) || []).length, 3 * 2 * 2);
  results.models[0].passAtKPercent["tilting-marble-maze"].overall = "no";
  assert.throws(() => renderPasskResults(results), /overall must be a boolean/);
});

test("pass@k allows unknown API cost for a fully unmeasured model without drawing a curve", async () => {
  const { renderPasskResults } = await import("../scripts/build.js");
  const fixture = await passkFixture();
  const model = fixture.models[0];
  model.avgApiCostUsdPerEpisode = null;
  for (const id of Object.keys(model.passAtKPercent)) model.passAtKPercent[id] = null;
  const html = renderPasskResults(fixture);
  assert.equal((html.match(/data-passk-missing/g) || []).length, 15);
  assert.doesNotMatch(html, /<title>Sol:/);
  model.passAtKPercent["conveyor-selective-picking"] = { 1: 20, 3: 40, 5: 60 };
  assert.throws(() => renderPasskResults(fixture), /API cost/);
});

test("API episode costs reject invalid or missing values and preserve zero as a real value", async () => {
  const { renderPasskResults } = await import("../scripts/build.js");
  const fixture = await passkFixture();
  for (const value of [undefined, null, NaN, Infinity, -0.01, "0.25", true]) {
    const results = structuredClone(fixture);
    results.models[0].avgApiCostUsdPerEpisode = value;
    assert.throws(() => renderPasskResults(results), /API cost/);
  }
  fixture.models[0].avgApiCostUsdPerEpisode = 0;
  assert.doesNotThrow(() => renderPasskResults(fixture));
  assert.doesNotMatch(renderPasskResults(fixture), /API cost per episode|data-api-cost/);
});

test("trace blocks render a header, thought bubbles and tool calls in order", () => {
  const html = renderMarkdown("```trace\nDeepSeek V4.1 Flash | conveyor · solver\n> Let me look.\n>\n> Then <b>probe</b>.\n$ bash: ls /srv\n= Permission denied\n```");
  assert.match(html, /<figure class="trace"><figcaption class="trace-head"><span class="trace-avatar" aria-hidden="true"><img src="\/kinetic-gym\/logos\/deepseek\.svg" alt=""><\/span><strong>DeepSeek V4\.1 Flash<\/strong><span class="trace-context">conveyor · solver<\/span>/);
  assert.match(html, /<blockquote class="trace-bubble"><p>Let me look\.<\/p><p>Then &lt;b&gt;probe&lt;\/b&gt;\.<\/p><\/blockquote><div class="trace-call"><span class="trace-tool">bash<\/span><code>ls \/srv<\/code><span class="trace-result">Permission denied<\/span><\/div>/);
  assert.doesNotMatch(html, /<pre>/);
});

test("KineticGym article omits the removed timing demo and its script", async () => {
  const post = await readContentFile(join(import.meta.dirname, "../content/essays/kinetic-gym.md"));
  assert.doesNotMatch(post.html, /data-realtime-demo|realtime\.js|Same model, same plan|\[\[realtime-demo\]\]/);
  await assert.rejects(access(new URL("../static/kinetic-gym/realtime.js", import.meta.url)), { code: "ENOENT" });
});

test("Workshop places the marble clarification after its trace", async () => {
  const source = await readFile(new URL("../content/essays/kinetic-gym-workshop.md", import.meta.url), "utf8");
  assert.match(source, /turning that bend into a sensor:\n\n```trace/);
  const traceStart = source.indexOf("```trace\nDeepSeek V4.1 Flash | marble maze");
  const traceEnd = source.indexOf("\n```", traceStart);
  assert.ok(source.indexOf("The marble really reached its target") > traceEnd);
});

test("Workshop distinguishes qualified snapshots, redesigns and incomplete attack campaigns", async () => {
  const post = await readContentFile(join(import.meta.dirname, "../content/essays/kinetic-gym-workshop.md"));
  assert.match(post.html, /18–20 of 20/);
  assert.match(post.html, /3 of 13 scorable episodes/);
  assert.match(post.html, /standing goalkeeper/);
  assert.match(post.html, /outside Workshop, in assisted coding sessions/);
  assert.doesNotMatch(post.html, /levels 2–8 are not implemented|not yet a qualified family|58 of 60 episodes/);
});

test("Workshop post stands alone while KineticGym retains its solver traces and results", async () => {
  const main = await readContentFile(join(import.meta.dirname, "../content/essays/kinetic-gym.md"));
  const workshop = await readContentFile(join(import.meta.dirname, "../content/essays/kinetic-gym-workshop.md"));
  assert.equal(main.draft, true);
  assert.equal(workshop.draft, true);
  assert.match(main.html, /href="\/blog\/kinetic-gym-workshop\/"/);
  assert.doesNotMatch(main.html, /class="workshop-architecture"|What can go wrong/);
  assert.match(main.html, /What DeepSeek tried as a solver/);
  assert.match(main.html, /44 of 145 evaluation episodes/);
  assert.equal((main.html.match(/<figure class="trace">/g) || []).length, 5);
  assert.match(main.html, /data-passk-results/);
  assert.match(main.html, /data-task-gallery/);
  assert.doesNotMatch(main.html, /data-workshop-showcase/);
  assert.match(workshop.html, /class="workshop-architecture"/);
  assert.equal((workshop.html.match(/<animateMotion/g) || []).length, 12);
  assert.equal((workshop.html.match(/<figure class="trace">/g) || []).length, 4);
  assert.match(workshop.html, /data-workshop-showcase/);
  assert.ok(workshop.html.indexOf("What a task family looks like") < workshop.html.indexOf("The task catalog"));
  assert.ok(workshop.html.indexOf("The task catalog") < workshop.html.indexOf("data-workshop-showcase"));
  assert.ok(workshop.html.indexOf('class="workshop-architecture"') < workshop.html.indexOf("The task catalog"));
  assert.ok(workshop.html.indexOf("data-workshop-showcase") < workshop.html.indexOf("What can go wrong"));
  assert.doesNotMatch(workshop.html, /What DeepSeek tried as a solver|data-passk-results|href="\/blog\/kinetic-gym\/"/);
});

test("workshop architecture is inlined as a themed SVG with flowing arrows", () => {
  const html = renderMarkdown("[[workshop-architecture]]");
  assert.match(html, /<figure class="workshop-architecture"><svg class="wa"/);
  assert.equal((html.match(/class="wa-edge[ "]/g) || []).length, 12);
  assert.equal((html.match(/<animateMotion/g) || []).length, 12);
  assert.doesNotMatch(html, /<img\b/);
});

test("diagram images break out of the column and keep plain images unchanged", () => {
  const html = renderMarkdown('![Flow](/a.png "diagram")\n\n![Photo](/b.png)');
  assert.match(html, /<img src="\/a\.png" alt="Flow" class="diagram">/);
  assert.match(html, /<img src="\/b\.png" alt="Photo">/);
});
