import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import hljs from "highlight.js";
import MarkdownIt from "markdown-it";

const SITE = {
  title: "semioz.com",
  author: "Semih Berkay Öztürk",
  description: "Writing by Semih Berkay Öztürk.",
};

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
    const highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value;
    return `<pre><code class="hljs language-${escapeAttr(language)}">${highlighted}</code></pre>`;
  },
});

export function renderMarkdown(markdown) {
  return md.render(markdown);
}

export async function readContentFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  const { data, content } = parseFrontmatter(raw);
  const slug = basename(filePath, ".md");
  const title = data.title || titleFromSlug(slug);

  return {
    ...data,
    slug,
    title,
    description: data.description || "",
    topics: Array.isArray(data.topics) ? data.topics : [],
    date: data.date ? new Date(data.date) : null,
    dateRaw: data.dateRaw || String(data.date || ""),
    body: content.trim(),
    html: renderMarkdown(content),
  };
}

export async function buildSite({ rootDir = process.cwd(), outDir = join(rootDir, "public") } = {}) {
  const contentDir = join(rootDir, "content");
  const essaysDir = join(contentDir, "essays");
  const staticDir = join(rootDir, "static");
  const cssPath = join(rootDir, "src", "styles.css");

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await copyDirIfExists(staticDir, outDir);
  await copyFileIfExists(join(rootDir, "CNAME"), join(outDir, "CNAME"));
  await copyFileIfExists(cssPath, join(outDir, "styles.css"));

  const posts = (await listMarkdownFiles(essaysDir))
    .map((file) => readContentFile(file));
  const resolvedPosts = await Promise.all(posts);
  resolvedPosts.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

  const about = await readContentFile(join(contentDir, "about.md"));

  await writePage(join(outDir, "index.html"), renderIndex(resolvedPosts));
  await writePage(join(outDir, "about", "index.html"), renderAbout(about));

  for (const post of resolvedPosts) {
    await writePage(join(outDir, "essays", post.slug, "index.html"), renderPost(post));
  }
}

function parseFrontmatter(raw) {
  if (raw.startsWith("+++")) {
    const end = raw.indexOf("\n+++", 3);
    if (end === -1) return { data: {}, content: raw };
    const frontmatter = raw.slice(3, end).trim();
    const content = raw.slice(end + 5);
    const data = parseSimpleToml(frontmatter);
    return { data: { ...data, dateRaw: data.date }, content };
  }

  const parsed = matter(raw);
  return { data: { ...parsed.data, dateRaw: extractDateRaw(raw) }, content: parsed.content };
}

function parseSimpleToml(source) {
  const data = {};
  for (const line of source.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
  return data;
}

function extractDateRaw(source) {
  const match = source.match(/^date\s*[:=]\s*["']?([^"'\n]+)["']?\s*$/m);
  return match?.[1]?.trim();
}

function renderIndex(posts) {
  const updated = posts[0]?.date ? formatMonth(posts[0]) : "now";
  const rows = posts
    .map((post) => {
      const topic = post.topics[0] || "essay";
      return `<a class="post-row" href="/essays/${post.slug}/">
  <span class="post-accent" style="--accent:${topicColor(topic)}"></span>
  <span class="post-main">
    <span class="post-title">${escapeHtml(post.title)}</span>
    ${post.description ? `<span class="post-description">${escapeHtml(post.description)}</span>` : ""}
  </span>
  <span class="post-meta"><span style="color:${topicColor(topic)}">${escapeHtml(topic)}</span> · ${formatDate(post)}</span>
</a>`;
    })
    .join("\n");

  return layout({
    title: SITE.title,
    description: SITE.description,
    brand: SITE.title,
    main: `<section class="hero">
  <p>${posts.length} posts · updated ${escapeHtml(updated)}</p>
</section>

<section class="section-heading"><span>//</span> writing</section>
<section class="post-list">${rows}</section>`,
  });
}

function renderPost(post) {
  return layout({
    title: `${post.title} - ${SITE.title}`,
    description: post.description || SITE.description,
    main: `<article class="article">
  <header class="article-header">
    <p class="article-meta">${formatLongDate(post)} · approx ${readingMinutes(post.body)}m read</p>
    <h1>${escapeHtml(post.title)}</h1>
    ${post.description ? `<p class="article-description">${escapeHtml(post.description)}</p>` : ""}
  </header>
  <div class="prose">${post.html}</div>
</article>`,
  });
}

function renderAbout(page) {
  return layout({
    title: `about - ${SITE.title}`,
    description: SITE.description,
    main: `<article class="article compact">
  <header class="article-header"><h1>about</h1></header>
  <div class="prose">${page.html}</div>
</article>`,
  });
}

function layout({ title, description, main, brand = `← ${SITE.title}` }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttr(description)}">
  <title>${escapeHtml(title)}</title>
  <script>
    document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";
  </script>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="Home">${escapeHtml(brand)}</a>
      <nav aria-label="Primary navigation">
        <a href="/about/">about</a>
        <a href="https://github.com/semioz/">github</a>
        <a href="https://x.com/semiozz">x</a>
        <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to light theme" title="Switch theme">◐</button>
      </nav>
    </header>
    <main>${main}</main>
  </div>
  <script>
    const toggle = document.querySelector("[data-theme-toggle]");
    const setTheme = (theme) => {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("theme", theme);
      toggle.textContent = theme === "dark" ? "◐" : "◑";
      toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    };
    setTheme(document.documentElement.dataset.theme || "dark");
    toggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  </script>
</body>
</html>
`;
}

async function listMarkdownFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => join(dir, entry.name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writePage(filePath, html) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html);
}

async function copyDirIfExists(from, to) {
  try {
    const entries = await readdir(from, { withFileTypes: true });
    await mkdir(to, { recursive: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store") continue;
      const source = join(from, entry.name);
      const target = join(to, entry.name);
      if (entry.isDirectory()) await copyDirIfExists(source, target);
      else if (entry.isFile()) await cp(source, target);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function copyFileIfExists(from, to) {
  try {
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function readingMinutes(text) {
  return Math.max(1, Math.round(text.trim().split(/\s+/).filter(Boolean).length / 220));
}

function formatDate(post) {
  const date = calendarDate(post);
  if (!date || Number.isNaN(date.getTime())) return "undated";
  return date.toLocaleDateString("en", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).toLowerCase();
}

function formatLongDate(post) {
  const date = calendarDate(post);
  if (!date || Number.isNaN(date.getTime())) return "undated";
  return date.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).toLowerCase();
}

function formatMonth(post) {
  const date = calendarDate(post);
  return date.toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" }).toLowerCase();
}

function calendarDate(post) {
  const match = post.dateRaw?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return post.date;
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function topicColor(topic) {
  const colors = ["#9ecbd8", "#a7d7b9", "#d9b27d", "#c7b7ff", "#e5a7c8"];
  const sum = [...topic].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

function titleFromSlug(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

const currentFile = fileURLToPath(import.meta.url);
if (relative(process.cwd(), currentFile) === relative(process.cwd(), process.argv[1] || "")) {
  await buildSite();
}
