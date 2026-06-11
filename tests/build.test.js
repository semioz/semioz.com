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
`);

  assert.match(html, /<h2[^>]*>Example<\/h2>/);
  assert.match(html, /class="hljs language-python"/);
  assert.match(html, /print/);
  assert.match(html, /<img src="\/first\.png" alt="diagram">/);
});

test("article prose text uses theme variables for light-mode readability", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.prose\s*\{\s*color:\s*var\(--text\)/);
  assert.doesNotMatch(css, /\.prose\s*\{\s*color:\s*#[0-9a-f]{6}/i);
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
  assert.doesNotMatch(index, /Semih Berkay Ozturk/);
  assert.match(index, /data-theme-toggle/);
  assert.match(index, /aria-label="Switch to light theme"/);
  assert.match(index, /localStorage\.setItem\("theme"/);
  assert.match(index, /href="\/essays\/first-post\/"/);
  assert.match(index, /aug 13, 2025/);
  assert.match(post, /Post body/);
  assert.match(about, /I’m Semih Berkay Ozturk, a software engineer focused on RL\/post-training and distributed systems/);
  assert.match(about, /← semioz\.com/);
  assert.equal(asset, "fake image");
  assert.equal(cname, "semioz.com\n");
  await assert.rejects(access(join(root, "public", ".DS_Store")));
});
