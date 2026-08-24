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
  const post = await readFile(join(root, "public", "essays", "first-post", "index.html"), "utf8");
  const about = await readFile(join(root, "public", "about", "index.html"), "utf8");
  const asset = await readFile(join(root, "public", "first.png"), "utf8");
  const cname = await readFile(join(root, "public", "CNAME"), "utf8");

  assert.match(index, /First Post/);
  assert.match(index, /semioz\.com/);
  assert.match(index, /semioz\.com/);
  assert.doesNotMatch(index, /Semih Berkay Ozturk/);
  assert.doesNotMatch(index, /class="post-accent"/);
  assert.match(index, /family=Google\+Sans:/);
  assert.match(index, /data-theme-toggle/);
  assert.match(index, /aria-label="Switch to light theme"/);
  assert.match(index, /localStorage\.setItem\("theme"/);
  assert.match(index, /<section class="section-heading"><span class="section-index">WRITING<\/span><\/section>/);
  assert.match(index, /href="\/essays\/first-post\/"/);
  assert.match(index, /aug 13, 2025/);
  assert.match(post, /Post body/);
  assert.match(about, /I’m Semih Berkay Ozturk, a software engineer focused on RL\/post-training and distributed systems/);
  assert.match(about, /← semioz\.com/);
  assert.equal(asset, "fake image");
  assert.equal(cname, "semioz.com\n");
  await assert.rejects(access(join(root, "public", ".DS_Store")));
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
