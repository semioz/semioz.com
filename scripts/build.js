import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import hljs from "highlight.js";
import workshopCatalog from "../static/kinetic-gym/families.json" with { type: "json" };
import passkResults from "../static/kinetic-gym/results.json" with { type: "json" };

const SITE = {
  title: "semioz.com",
  author: "Semih Berkay Öztürk",
  brand: "semioz.com",
  headerBrand: "semioz",
  description: "Writing by Semih Berkay Öztürk.",
};

export function renderMarkdown(markdown) {
  const blocks = [];
  const paragraph = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let inCode = false;
  let inComment = false;
  let codeLanguage = "plaintext";
  let codeLines = [];
  let listItems = [];
  let listType = null;
  let sectionCount = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  const flushList = () => {
    if (!listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    blocks.push(`<${tag}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`);
    listItems = [];
    listType = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    const fence = line.match(/^```([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      if (inCode) {
        blocks.push(codeLanguage === "trace" ? renderTrace(codeLines) : renderCodeBlock(codeLines.join("\n"), codeLanguage));
        inCode = false;
        codeLanguage = "plaintext";
        codeLines = [];
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLanguage = fence[1] || "plaintext";
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim().startsWith("<!--")) {
      flushParagraph();
      flushList();
      inComment = !line.includes("-->");
      continue;
    }

    const embed = { "[[workshop-showcase]]": renderWorkshopShowcase, "[[passk-results]]": () => renderPasskResults(passkResults), "[[realtime-demo]]": renderRealtimeDemo, "[[workshop-architecture]]": renderWorkshopArchitecture }[line.trim()];
    if (embed) {
      flushParagraph();
      flushList();
      blocks.push(embed());
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (isTableRow(line) && isTableSeparator(lines[index + 1] || "")) {
      flushParagraph();
      flushList();
      const headers = parseTableRow(line);
      const rows = [];
      index += 2;

      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }

      index -= 1;
      blocks.push(renderTable(headers, rows));
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const anchor = level > 1 ? ` id="section-${++sectionCount}"` : "";
      blocks.push(`<h${level}${anchor}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unordered[1].trim());
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1].trim());
      continue;
    }

    const quote = line.match(/^>\s*(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote><p>${renderInline(quote[1].trim())}</p></blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode) blocks.push(codeLanguage === "trace" ? renderTrace(codeLines) : renderCodeBlock(codeLines.join("\n"), codeLanguage));
  flushParagraph();
  flushList();

  return `${blocks.join("\n")}\n`;
}

function renderWorkshopShowcase() {
  const { families, dataset, revision } = workshopCatalog;
  const pad = (n) => String(n).padStart(2, "0");
  // Families are a filmstrip of their own previews; inside a family the tasks are a staircase, easiest on the left.
  const tabs = families.map((family, index) => `<button type="button" role="tab" id="workshop-tab-${index}" aria-controls="workshop-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-workshop-family="${index}">
    <span class="workshop-film" aria-hidden="true">${family.video?.poster ? `<img src="${escapeAttr(family.video.poster)}" alt="">` : ""}</span>
    <span class="workshop-film-label"><span>${pad(index + 1)}</span>${escapeHtml(family.name)}</span>
  </button>`).join("\n");
  const panels = families.map((family, index) => {
    const total = family.tasks.length;
    const media = family.video
      ? `<video controls autoplay muted loop playsinline preload="none"${family.video.poster ? ` poster="${escapeAttr(family.video.poster)}"` : ""} data-video-src="${escapeAttr(family.video.src)}" aria-label="${escapeAttr(family.name)} family preview"></video>
         <p class="workshop-video-error" hidden>Video unavailable. <a href="${escapeAttr(family.video.src)}">Open the recording</a>.</p>`
      : `<div class="workshop-placeholder"><span aria-hidden="true">${pad(index + 1)} / ${pad(families.length)}</span><strong>Video coming soon</strong><p>The task specifications are available below.</p></div>`;
    const steps = family.tasks.map((task, taskIndex) => `<li><button type="button" id="workshop-task-${index}-${taskIndex}" data-workshop-task="${taskIndex}" aria-controls="workshop-detail-${index}-${taskIndex}" aria-pressed="${taskIndex === 0}" style="--step:${(taskIndex + 1) / total}"><span class="workshop-step-bar"><span>${pad(taskIndex + 1)}</span></span><span class="workshop-step-title">${escapeHtml(task.title)}</span></button></li>`).join("\n");
    const details = family.tasks.map((task, taskIndex) => `<section class="workshop-detail" id="workshop-detail-${index}-${taskIndex}" aria-labelledby="workshop-task-${index}-${taskIndex}" data-workshop-detail="${taskIndex}"${taskIndex === 0 ? "" : " hidden"}>
      <p class="workshop-eyebrow">${escapeHtml(family.name.toUpperCase())} · TASK ${pad(taskIndex + 1)} / ${pad(total)}</p>
      <h5>${escapeHtml(task.title)}</h5><p>${escapeHtml(task.description)}</p>
    </section>`).join("\n");
    return `<div class="workshop-panel" id="workshop-panel-${index}" role="tabpanel" aria-labelledby="workshop-tab-${index}" data-workshop-panel="${index}"${index === 0 ? "" : " hidden"}>
      <figure class="workshop-media"><div class="workshop-media-frame">${media}</div></figure>
      <div class="workshop-details">${details}</div>
      <div class="workshop-steps"><ol>${steps}</ol><p class="workshop-steps-axis" aria-hidden="true"><span>easier</span><span>harder</span></p></div>
    </div>`;
  }).join("\n");
  return `<section class="workshop-showcase" id="task-families" data-workshop-showcase aria-label="KineticGym task families">
    <header class="workshop-heading"><h3>${families.reduce((total, family) => total + family.tasks.length, 0)} tasks. ${families.length} families.</h3></header>
    <noscript><p>Enable JavaScript to switch families and tasks, or open the dataset snapshot linked below.</p></noscript>
    <div class="workshop-tabs" role="tablist" aria-label="Task families">${tabs}</div>
    ${panels}
    <footer class="workshop-source"><a href="${escapeAttr(dataset)}/tree/${escapeAttr(revision)}" target="_blank" rel="noopener noreferrer">Dataset snapshot ↗</a></footer>
  </section>
  <script src="/kinetic-gym/showcase.js" defer></script>`;
}

function validatePasskResults(results) {
  if (typeof results?.dummy !== "boolean" || !Array.isArray(results.models) || results.models.length < 1 || results.models.length > 5) {
    throw new TypeError("Results need a boolean dummy flag and one to five model rows.");
  }
  const names = results.models.map((model) => model?.name);
  if (names.some((name) => typeof name !== "string" || !name.trim()) || new Set(names.map((name) => name.trim())).size !== names.length) {
    throw new TypeError("Model names must be unique, non-empty text.");
  }
  const families = workshopCatalog.families;
  const familyIds = new Set(families.map((family) => family.id));
  for (const model of results.models) {
    const cost = model.avgApiCostUsdPerEpisode;
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) {
      throw new TypeError(`${model.name}: average API cost must be a finite, non-negative USD amount per episode.`);
    }
    const ids = Object.keys(model.passAtKPercent || {});
    if (ids.length !== families.length || ids.some((id) => !familyIds.has(id))) {
      throw new TypeError(`${model.name}: provide rates for all ${families.length} catalog families, with no extras.`);
    }
    for (const family of families) {
      // null marks a family this model was not measured on.
      if (model.passAtKPercent[family.id] === null) continue;
      const tasks = model.passAtKPercent[family.id]?.tasks;
      if (tasks !== undefined && (!Number.isInteger(tasks) || tasks < 1)) {
        throw new TypeError(`${model.name}, ${family.name}: tasks must be a positive integer.`);
      }
      const rates = [1, 3, 5].map((k) => model.passAtKPercent[family.id]?.[k]);
      if (rates.some((rate) => typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100)) {
        throw new TypeError(`${model.name}, ${family.name}: percentages must be finite numbers from 0 to 100.`);
      }
      if (rates[0] > rates[1] || rates[1] > rates[2]) {
        throw new RangeError(`${model.name}, ${family.name}: pass@k must be non-decreasing.`);
      }
    }
  }
  if (!sharedFamilies(results).length) throw new TypeError("At least one family must be measured for every model.");
}

function sharedFamilies(results) {
  return workshopCatalog.families.filter((family) => results.models.every((model) => model.passAtKPercent[family.id] !== null));
}

export function renderPasskResults(results) {
  validatePasskResults(results);
  const { families } = workshopCatalog;
  const ks = [1, 3, 5];
  // Overall rates compare like with like: only families every model was measured on, weighted by measured tasks.
  const shared = sharedFamilies(results);
  const weight = (model, family) => model.passAtKPercent[family.id].tasks ?? family.tasks.length;
  const percent = (rate) => `${rate.toFixed(1)}%`;
  const means = results.models.map((model) => ks.map((k) => shared.reduce((sum, family) => sum + model.passAtKPercent[family.id][k] * weight(model, family), 0) / shared.reduce((sum, family) => sum + weight(model, family), 0)));
  const legend = results.models.map((model, index) => `<button type="button" class="passk-legend-item passk-series-${index}" data-passk-focus="${index}"><i aria-hidden="true"></i>${escapeHtml(model.name)}</button>`).join("");
  const grid = [0, 25, 50, 75, 100].map((rate) => `<line x1="0" x2="600" y1="${260 * (1 - rate / 100)}" y2="${260 * (1 - rate / 100)}" vector-effect="non-scaling-stroke"/>`).join("");
  const curves = means.map((rates, index) => {
    const coordinates = rates.map((rate, kIndex) => `${kIndex * 300},${(260 * (1 - rate / 100)).toFixed(3)}`).join(" ");
    return `<g class="passk-series-${index}" data-passk-focus="${index}"><title>${escapeHtml(results.models[index].name)}: ${rates.map((rate, i) => `pass@${ks[i]} ${percent(rate)}`).join(", ")}</title><polyline class="passk-hit" points="${coordinates}" vector-effect="non-scaling-stroke"/><polyline data-passk-series="${index}" points="${coordinates}" vector-effect="non-scaling-stroke"/></g>`;
  }).join("");
  const points = means.map((rates, index) => rates.map((rate, kIndex) => `<span class="passk-point passk-series-${index}" data-passk-point="${index}-${ks[kIndex]}" data-passk-focus="${index}" style="left:${kIndex * 50}%;top:${100 - rate}%;--k:${kIndex}" title="${escapeAttr(`${results.models[index].name} · pass@${ks[kIndex]}: ${percent(rate)}`)}" aria-hidden="true"></span>`).join("")).join("");
  const tabs = ks.map((k) => `<button type="button" role="tab" id="passk-tab-${k}" aria-controls="passk-heatmap-${k}" aria-selected="${k === 5}" tabindex="${k === 5 ? 0 : -1}" data-passk-select="${k}">pass@${k}</button>`).join("");
  const heatmaps = ks.map((k) => `<div role="tabpanel" id="passk-heatmap-${k}" aria-labelledby="passk-tab-${k}" data-passk-heatmap="${k}" tabindex="0"${k === 5 ? "" : " hidden"}>
    <table class="passk-heatmap"><caption>pass@${k} · success by task family (%)</caption><thead><tr><th scope="col">Task family</th>${results.models.map((model, index) => `<th scope="col" class="passk-series-${index}"><span class="passk-column-key" aria-hidden="true"></span>${escapeHtml(model.name)}</th>`).join("")}</tr></thead>
    <tbody>${families.map((family, row) => `<tr><th scope="row">${escapeHtml(family.name)}</th>${results.models.map((model, column) => {
      if (model.passAtKPercent[family.id] === null) return `<td class="passk-missing" data-passk-missing title="Not measured">—</td>`;
      const rate = model.passAtKPercent[family.id][k];
      return `<td data-passk-score="${rate}" style="--heat:${(rate * .45).toFixed(3)}%;--order:${row + column}">${percent(rate)}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>
  </div>`).join("");
  return `<section class="passk-results" id="model-results" data-passk-results aria-label="Model pass@k comparison">
    <figure class="passk-card"><figcaption id="passk-overall-title"><h3>Overall pass@k</h3><span class="passk-tag">Evaluation · held-out test seeds</span></figcaption>
      <p class="passk-chart-note" id="passk-overall-desc">Success (%) versus independent attempts, k, over ${escapeHtml(shared.map((family) => family.name).join(", "))}: the families every model was measured on, weighted by measured tasks.</p>
      <div class="passk-legend" role="group" aria-label="Highlight a model">${legend}</div>
      <div class="passk-chart" role="img" aria-labelledby="passk-overall-title" aria-describedby="passk-overall-desc">
        <div class="passk-y-ticks" aria-hidden="true">${[100, 75, 50, 25, 0].map((rate) => `<span style="top:${100 - rate}%">${rate}</span>`).join("")}</div>
        <div class="passk-plot"><svg viewBox="0 0 600 260" preserveAspectRatio="none" aria-hidden="true">${grid}${curves}</svg>${points}</div>
        <div class="passk-x-ticks" aria-hidden="true">${ks.map((k) => `<span>k = ${k}</span>`).join("")}</div>
      </div>
    </figure>
    <figure class="passk-card"><figcaption><h3>Success by task family</h3></figcaption>
      <div class="passk-heatmap-controls"><div class="passk-tabs" role="tablist" aria-label="Heatmap pass@k">${tabs}</div><div class="passk-scale" aria-hidden="true"><span>0%</span><i></i><span>100%</span></div></div>
      <noscript><p>The heatmap shows pass@5. Enable JavaScript to switch k.</p></noscript>
      ${heatmaps}
      ${results.levelNote ? `<p class="passk-chart-note passk-footnote">${escapeHtml(results.levelNote)}</p>` : ""}
    </figure>
  </section>
  <script src="/kinetic-gym/results.js" defer></script>`;
}

function renderWorkshopArchitecture() {
  // Inline, so the drawing picks up the theme's CSS variables.
  const svg = readFileSync(new URL("../static/kinetic-gym/workshop-architecture.svg", import.meta.url), "utf8");
  return `<figure class="workshop-architecture">${svg}</figure>`;
}

function renderRealtimeDemo() {
  // A timing figure in wall-clock seconds: the same model run against a world that waits and one that does not.
  const SPAN = 4.6, X0 = 58, X1 = 712;
  const x = (t) => (X0 + (t * (X1 - X0)) / SPAN).toFixed(1);
  const w = (a, b) => ((b - a) * (X1 - X0) / SPAN).toFixed(1);
  const bar = (cls, a, b, y, label = "") => `<rect class="${cls}" x="${x(a)}" y="${y}" width="${w(a, b)}" height="20" rx="3"/>${label ? `<text class="rt-in" x="${(Number(x(a)) + 8).toFixed(1)}" y="${y + 14}">${label}</text>` : ""}`;
  const row = (mode, y, title, subtitle, world, window) => `<g data-rt-mode="${mode}">
      <text class="rt-title" x="0" y="${y - 14}">${title}<tspan class="rt-sub" dx="10">${subtitle}</tspan></text>
      <text class="rt-track" x="${X0 - 10}" y="${y + 14}" text-anchor="end">model</text>
      ${bar("rt-observe", 0, 0.4, y)}${bar("rt-think", 0.4, 3.4, y, "reasoning · 3,200 tokens")}${bar("rt-act", 3.4, 3.8, y, "act")}
      <text class="rt-track" x="${X0 - 10}" y="${y + 40}" text-anchor="end">world</text>
      ${world(y + 26)}
      <rect class="rt-window" x="${x(window[0])}" y="${y + 23}" width="${w(...window)}" height="26" rx="4"/>
      <text class="rt-window-label" x="${x((window[0] + window[1]) / 2)}" y="${y + 62}" text-anchor="middle">catch window</text>
    </g>`;
  const ticks = [0, 1, 2, 3, 4].map((t) => `<line class="rt-tick" x1="${x(t)}" x2="${x(t)}" y1="30" y2="214"/><text class="rt-axis" x="${x(t)}" y="230" text-anchor="middle">${t} s</text>`).join("");
  return `<figure class="rt-demo" data-realtime-demo data-rt-span="${SPAN}" data-rt-x0="${X0}" data-rt-x1="${X1}">
    <svg viewBox="0 0 720 240" role="img" aria-label="Timing of one catch. Turn-based: the world pauses during 3 seconds of reasoning, so the catch window comes after the arms move and the box is caught. Realtime: the world keeps running, the catch window closes at 1.3 seconds and the box falls before the first action at 3.4 seconds.">
      <defs><pattern id="rt-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6"/></pattern></defs>
      ${ticks}
      ${row("wait", 52, "Turn-based", "the world waits", (y) => `${bar("rt-run", 0, 0.4, y)}${bar("rt-paused", 0.4, 3.4, y, "paused")}${bar("rt-run", 3.4, SPAN, y)}`, [4.0, 4.3])}
      ${row("live", 146, "Realtime", "the world keeps moving", (y) => bar("rt-run", 0, SPAN, y), [1.0, 1.3])}
      <rect class="rt-future" data-rt-future x="${X0}" y="26" width="${X1 - X0 + 8}" height="192"/>
      <text class="rt-outcome rt-ok" data-rt-outcome="4.0" x="${X1 - 10}" y="38" text-anchor="end">caught at 4.0 s</text>
      <text class="rt-outcome rt-miss" data-rt-outcome="1.6" x="${X1 - 10}" y="132" text-anchor="end">dropped at 1.6 s, first action at 3.4 s</text>
      <g data-rt-playhead><line class="rt-playhead" x1="${X0}" x2="${X0}" y1="26" y2="218"/><text class="rt-clock" data-rt-clock x="${X0}" y="20" text-anchor="middle">0.0 s</text></g>
    </svg>
    <figcaption>Same model, same plan, same 3 s of reasoning. In a turn-based world the clock stops while the model thinks, so the catch window is still ahead when the arms move. In realtime it closes during the reasoning. KineticGym runs the second.</figcaption>
  </figure>
  <script src="/kinetic-gym/realtime.js" defer></script>`;
}

const TRACE_LOGOS = { DeepSeek: "/kinetic-gym/logos/deepseek.svg" };

// A ```trace block: "Model | context", then "> " thoughts, "$ tool: command" calls and "= " results, in trace order.
function renderTrace(lines) {
  const [name, context = ""] = (lines[0] || "").split("|").map((part) => part.trim());
  const initials = (name.split(" ")[0].match(/[A-Z]/g) || [name[0] || "?"]).slice(0, 2).join("");
  const logo = TRACE_LOGOS[name.split(" ")[0]];
  const items = [];
  for (const line of lines.slice(1)) {
    const [, marker, text = ""] = line.match(/^([>$=])\s?(.*)$/) || [];
    const last = items.at(-1);
    if (marker === ">") {
      if (last?.kind === "thought") last.text.push(text);
      else items.push({ kind: "thought", text: [text] });
    } else if (marker === "$") {
      const [, tool = "tool", command = text] = text.match(/^([a-z_]+):\s*(.*)$/) || [];
      items.push({ kind: "call", tool, command, results: [] });
    } else if (marker === "=" && last?.kind === "call") {
      last.results.push(text);
    }
  }
  const body = items.map((item) => item.kind === "thought"
    ? `<blockquote class="trace-bubble">${item.text.join("\n").split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\n/g, " ")).filter(Boolean).map((paragraph) => `<p>${renderInline(paragraph)}</p>`).join("")}</blockquote>`
    : `<div class="trace-call"><span class="trace-tool">${escapeHtml(item.tool)}</span><code>${escapeHtml(item.command)}</code>${item.results.map((result) => `<span class="trace-result">${escapeHtml(result)}</span>`).join("")}</div>`).join("");
  return `<figure class="trace"><figcaption class="trace-head"><span class="trace-avatar" aria-hidden="true">${logo ? `<img src="${escapeAttr(logo)}" alt="">` : escapeHtml(initials)}</span><strong>${escapeHtml(name)}</strong>${context ? `<span class="trace-context">${escapeHtml(context)}</span>` : ""}</figcaption>${body}</figure>`;
}

function renderCodeBlock(code, language) {
  const highlighted = hljs.getLanguage(language)
    ? hljs.highlight(code, { language }).value
    : escapeHtml(code);
  return `<pre><code class="hljs language-${escapeAttr(language)}">${highlighted}</code></pre>`;
}

export async function readContentFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  const { data, content } = parseFrontmatter(raw);
  const slug = basename(filePath, ".md");
  const title = data.title || titleFromSlug(slug);

  return {
    ...data,
    slug,
    draft: data.draft === "true",
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
  validatePasskResults(passkResults);
  const contentDir = join(rootDir, "content");
  const essaysDir = join(contentDir, "essays");
  const staticDir = join(rootDir, "static");
  const cssPath = join(rootDir, "src", "styles.css");

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await copyDirIfExists(staticDir, outDir);
  await copyFileIfExists(join(rootDir, "CNAME"), join(outDir, "CNAME"));
  await copyFileIfExists(cssPath, join(outDir, "styles.css"));
  let stylesheet = "/styles.css";
  try {
    const css = await readFile(join(outDir, "styles.css"));
    stylesheet += `?v=${createHash("sha256").update(css).digest("hex").slice(0, 12)}`;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const posts = (await listMarkdownFiles(essaysDir))
    .map((file) => readContentFile(file));
  const resolvedPosts = await Promise.all(posts);
  resolvedPosts.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  const publishedPosts = resolvedPosts.filter((post) => !post.draft);

  const about = await readContentFile(join(contentDir, "about.md"));
  await writeFile(join(outDir, "search-index.json"), JSON.stringify(publishedPosts.map((post) => ({
    title: post.title,
    description: post.description,
    url: `/essays/${encodeURIComponent(post.slug)}/`,
    text: post.body,
  }))));

  await writePage(join(outDir, "index.html"), renderIndex(publishedPosts, about, stylesheet));
  await writePage(join(outDir, "writing", "index.html"), renderWriting(publishedPosts, stylesheet));

  for (const post of resolvedPosts) {
    await writePage(join(outDir, "essays", post.slug, "index.html"), renderPost(post, stylesheet));
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

  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end === -1) return { data: {}, content: raw };
    const frontmatter = raw.slice(3, end).trim();
    const content = raw.slice(end + 5);
    const data = parseSimpleYaml(frontmatter);
    return { data: { ...data, dateRaw: data.date }, content };
  }

  return { data: {}, content: raw };
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

function parseSimpleYaml(source) {
  const data = {};
  let currentListKey = null;

  for (const line of source.split("\n")) {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentListKey) {
      data[currentListKey].push(cleanFrontmatterValue(listItem[1]));
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      currentListKey = null;
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (!value) {
      data[key] = [];
      currentListKey = key;
    } else {
      data[key] = cleanFrontmatterValue(value);
      currentListKey = null;
    }
  }

  return data;
}

function cleanFrontmatterValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => cleanFrontmatterValue(item))
      .filter(Boolean);
  }
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function renderPostRows(posts) {
  return posts
    .map((post) => {
      const topic = post.topics[0] || "essay";
      return `<a class="post-row" href="/essays/${post.slug}/">
  <span class="post-main">
    <span class="post-title">${escapeHtml(post.title)}</span>
    ${post.description ? `<span class="post-description">${escapeHtml(post.description)}</span>` : ""}
  </span>
  <span class="post-meta"><span style="color:${topicColor(topic)}">${escapeHtml(topic)}</span> · ${formatDate(post)}</span>
</a>`;
    })
    .join("\n");
}

function renderIndex(posts, about, stylesheet) {
  const updated = posts[0]?.date ? formatMonth(posts[0]) : "now";
  return layout({
    title: SITE.title,
    stylesheet,
    description: SITE.description,
    brand: SITE.headerBrand,
    main: `<section class="home-intro prose" aria-label="About">${about.html}</section>
<section class="hero">
  <p>${posts.length} posts · updated ${escapeHtml(updated)}</p>
</section>

<section class="section-heading"><span class="section-index">RECENT WRITINGS</span></section>
<section class="post-list">${renderPostRows(posts)}</section>
${renderSocialLinks()}`,
  });
}

function renderWriting(posts, stylesheet) {
  return layout({
    title: `writing - ${SITE.title}`,
    stylesheet,
    description: SITE.description,
    main: `<section class="post-list" aria-label="Writing">${renderPostRows(posts)}</section>`,
  });
}

function renderSocialLinks() {
  return `<nav class="social-links" aria-label="Social links">
  <a href="https://github.com/semioz/" aria-label="GitHub">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.4-5.5-6a4.7 4.7 0 0 1 1.2-3.3c-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.9.1 3.2a4.7 4.7 0 0 1 1.2 3.3c0 4.6-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"/></svg>
  </a>
  <a href="https://www.linkedin.com/in/semioz/" aria-label="LinkedIn">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.56V9h3.56v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45C23.2 24 24 23.23 24 22.27V1.73C24 .77 23.2 0 22.22 0h.01Z"/></svg>
  </a>
  <a href="https://x.com/semiozz" aria-label="X">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2.3h3.7l-8.1 9.2L24 21.7h-7.4l-5.8-7.6-6.7 7.6H.4l8.7-9.9L0 2.3h7.6l5.2 6.9 6.1-6.9Zm-1.3 17.4h2L6.5 4.2H4.4l13.2 15.5Z"/></svg>
  </a>
</nav>`;
}

function renderPost(post, stylesheet) {
  const headings = [...post.html.matchAll(/<h([23]) id="(section-\d+)">([\s\S]*?)<\/h\1>/g)];
  const entries = headings.map(([, level, id, html]) => {
    const label = html.replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/g, "$1").replace(/<[^>]*>/g, "");
    return label.trim() ? `<li${level === "3" ? ' class="toc-subheading"' : ""}><a href="#${id}">${label}</a></li>` : "";
  }).join("");
  const contents = entries ? `<details class="article-toc" data-article-toc open>
    <summary>Contents</summary>
    <nav aria-label="Contents"><ol>${entries}</ol></nav>
  </details>` : "";
  return layout({
    title: `${post.title} - ${SITE.title}`,
    stylesheet,
    description: post.description || SITE.description,
    noindex: post.draft,
    main: `<article class="article">
  ${contents}
  <header class="article-header">
    <p class="article-meta">${formatLongDate(post)} · approx ${readingMinutes(post.body)}m read</p>
    <h1>${escapeHtml(post.title)}</h1>
    ${post.description ? `<p class="article-description">${escapeHtml(post.description)}</p>` : ""}
  </header>
  <div class="prose">${post.html}</div>
</article>${contents ? '\n<script src="/contents.js" defer></script>' : ""}`,
  });
}

function layout({ title, description, main, stylesheet = "/styles.css", noindex = false, brand = `← ${SITE.brand}` }) {
  const portrait = brand === SITE.headerBrand
    ? `<figure class="portrait-engraving" data-portrait-engraving role="img" aria-label="Engraved portrait of Semih Berkay Öztürk">
        <canvas class="portrait-engraving-canvas" aria-hidden="true"></canvas>
        <img class="portrait-engraving-fallback" src="/images/semihport.jpg" alt="" aria-hidden="true">
      </figure>`
    : "";

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttr(description)}">
  ${noindex ? '<meta name="robots" content="noindex">' : ""}
  <title>${escapeHtml(title)}</title>
  <script>
    document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";
  </script>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">👾</text></svg>')}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="${escapeAttr(stylesheet)}">
</head>
<body>
  <div class="shell">
    <header class="site-header">
      <a class="brand-lockup" href="/" aria-label="Home">${portrait}<span class="brand">${escapeHtml(brand)}</span></a>
      <nav aria-label="Primary navigation">
        <a href="/writing/">writing</a>
        <button class="search-toggle" type="button" data-search-toggle aria-label="Search articles" aria-keyshortcuts="Meta+K Control+K" title="Search (⌘K / Ctrl+K)">
          <span aria-hidden="true">⌘+K</span>
        </button>
        <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark theme" title="Switch theme">◑</button>
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
    setTheme(document.documentElement.dataset.theme || "light");
    toggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  </script>
  <dialog class="search-dialog" aria-label="Search articles" data-search-dialog>
    <div class="search-header">
      <input type="search" data-search-input aria-label="Search blog titles and article text" placeholder="Search articles…" autocomplete="off" autofocus>
      <button type="button" data-search-close aria-label="Close search">✕</button>
    </div>
    <p class="search-status" data-search-status role="status"></p>
    <nav class="search-results" data-search-results aria-label="Search results"></nav>
    <p class="search-hint">↑↓ navigate · enter open · esc close</p>
  </dialog>
  <script src="/search.js" defer></script>
  <script src="/portrait-engraving.js" defer></script>
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
  const colors = ["#f08a24", "#d0a05f", "#b2aaa1", "#888178", "#f0bd6a"];
  const sum = [...topic].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

function titleFromSlug(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.slice(1, -1).includes("|");
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(headers, rows) {
  const head = headers.map((header) => `<th>${renderInline(header)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${headers.map((_, index) => `<td>${renderInline(row[index] || "")}</td>`).join("")}</tr>`)
    .join("");

  return `<table>
<thead><tr>${head}</tr></thead>
<tbody>${body}</tbody>
</table>`;
}

function renderInline(value) {
  const codeTokens = [];
  const html = escapeHtml(value.replace(/\bI'm\b/g, "I’m"))
    .replace(/`([^`]+)`/g, (_, code) => {
      const index = codeTokens.push(`<code>${code}</code>`) - 1;
      return `@@CODE_${index}@@`;
    })
    .replace(/!\[([^\]]*)\]\(([^)\s]+)( &quot;diagram&quot;)?\)/g, (_, alt, src, diagram) => `<img src="${src}" alt="${alt}"${diagram ? ' class="diagram"' : ""}>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>");

  return html.replace(/@@CODE_(\d+)@@/g, (_, index) => codeTokens[Number(index)]);
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
