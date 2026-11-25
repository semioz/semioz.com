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
  url: "https://semioz.com",
  image: "/images/semihport.jpg",
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

    const embed = { "[[workshop-showcase]]": renderWorkshopShowcase, "[[task-gallery]]": renderTaskGallery, "[[passk-results]]": () => renderPasskResults(passkResults), "[[passk-overall]]": () => renderPasskOverall(passkResults), "[[passk-levels]]": () => renderPasskLevels(passkResults), "[[workshop-architecture]]": renderWorkshopArchitecture, "[[pipeline]]": renderPipeline, "[[seed-examples]]": renderSeedExamples, "[[conveyor-levels]]": renderConveyorLevels, "[[level-ladder]]": renderLevelLadder, "[[marble-blind]]": renderMarbleBlind, "[[crane-fail]]": renderCraneFail, "[[controller-replay]]": renderControllerReplay }[line.trim()];
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

function renderTaskGallery() {
  const cards = workshopCatalog.families.map((family, index) => {
    const { src, poster } = family.video;
    return `<figure class="task-gallery-card">
      <button type="button" class="task-gallery-motion" data-gallery-motion aria-label="Animate ${escapeAttr(family.name)} preview" aria-pressed="false" disabled>
        <video muted loop playsinline preload="none" poster="${escapeAttr(poster)}" data-video-src="${escapeAttr(src)}" aria-hidden="true"></video>
      </button>
      <figcaption>
        <div class="task-gallery-heading"><span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(family.name)}</h3><span class="task-gallery-levels">${family.tasks.length} catalog levels</span></div>
        <p class="task-gallery-description">${escapeHtml(family.tasks[0].description)}</p>
        <p class="task-gallery-error" data-gallery-error hidden>Preview unavailable. <a href="${escapeAttr(src)}">Open the recording</a>.</p>
      </figcaption>
    </figure>`;
  }).join("\n");
  return `<section class="task-gallery" id="task-families" data-task-gallery aria-label="KineticGym task examples">
    <noscript><p>Enable JavaScript for looping previews.</p></noscript>
    <div class="task-gallery-grid">${cards}</div>
  </section>
  <script src="/kinetic-gym/gallery.js" defer></script>`;
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
    const unmeasured = families.every((family) => model.passAtKPercent?.[family.id] === null);
    if (!(unmeasured && cost === null) && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)) {
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
      const overall = model.passAtKPercent[family.id]?.overall;
      if (overall !== undefined && typeof overall !== "boolean") throw new TypeError(`${model.name}, ${family.name}: overall must be a boolean.`);
      const levels = model.passAtKPercent[family.id]?.levels;
      if (levels !== undefined && (!Array.isArray(levels) || levels.length !== 8 || levels.some((rate) => typeof rate !== "number" || rate < 0 || rate > 100))) {
        throw new TypeError(`${model.name}, ${family.name}: levels must be eight pass@1 percentages.`);
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
  if (!curveFamilies(results).length) throw new TypeError("At least one family needs a pass@k curve.");
}

// Hardest family first, by the mean pass@1 of the models that measured it; unmeasured families go last.
function byDifficulty(results, families) {
  const meanRate = (family) => {
    const rates = results.models.map((model) => model.passAtKPercent[family.id]?.[1]).filter((rate) => typeof rate === "number");
    return rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : Infinity;
  };
  return [...families].sort((a, b) => meanRate(a) - meanRate(b));
}

// Families get their own curve chart, never an average across families: rates differ too much between them for a mean
// to say anything. overall: false keeps a family out of the curves (too few levels measured).
function curveFamilies(results) {
  return byDifficulty(results, workshopCatalog.families).filter((family) => results.models.some((model) => model.passAtKPercent[family.id] && model.passAtKPercent[family.id].overall !== false));
}

export function renderPasskResults(results) {
  validatePasskResults(results);
  const { families } = workshopCatalog;
  const ks = [1, 3, 5];
  const percent = (rate) => `${rate.toFixed(1)}%`;
  const legend = results.models.map((model, index) => `<button type="button" class="passk-legend-item passk-series-${index}" data-passk-focus="${index}"><i aria-hidden="true"></i>${escapeHtml(model.name)}</button>`).join("");
  const grid = [0, 25, 50, 75, 100].map((rate) => `<line x1="0" x2="600" y1="${260 * (1 - rate / 100)}" y2="${260 * (1 - rate / 100)}" vector-effect="non-scaling-stroke"/>`).join("");
  const chart = (family) => {
    const measured = results.models.map((model, index) => ({ model, index, entry: model.passAtKPercent[family.id] })).filter(({ entry }) => entry);
    const curves = measured.map(({ model, index, entry }) => {
      const coordinates = ks.map((k, kIndex) => `${kIndex * 300},${(260 * (1 - entry[k] / 100)).toFixed(3)}`).join(" ");
      return `<g class="passk-series-${index}" data-passk-focus="${index}"><title>${escapeHtml(model.name)}: ${ks.map((k) => `pass@${k} ${percent(entry[k])}`).join(", ")}</title><polyline class="passk-hit" points="${coordinates}" vector-effect="non-scaling-stroke"/><polyline data-passk-series="${index}" points="${coordinates}" vector-effect="non-scaling-stroke"/></g>`;
    }).join("");
    const points = measured.map(({ model, index, entry }) => ks.map((k, kIndex) => `<button type="button" class="passk-point passk-series-${index}" data-passk-point="${family.id}-${index}-${k}" data-passk-focus="${index}" style="left:${kIndex * 50}%;top:${100 - entry[k]}%;--k:${kIndex}" aria-label="${escapeAttr(`${family.name}, ${model.name} · pass@${k}: ${percent(entry[k])}`)}"></button>`).join("")).join("");
    return `<div class="passk-family"><h4 id="passk-curve-${family.id}">${escapeHtml(family.name)}</h4>
        <div class="passk-chart" role="group" aria-labelledby="passk-curve-${family.id}">
          <div class="passk-y-ticks" aria-hidden="true">${[100, 75, 50, 25, 0].map((rate) => `<span style="top:${100 - rate}%">${rate}</span>`).join("")}</div>
          <div class="passk-plot"><svg viewBox="0 0 600 260" preserveAspectRatio="none" aria-hidden="true">${grid}${curves}</svg>${points}</div>
          <div class="passk-x-ticks" aria-hidden="true">${ks.map((k) => `<span>k = ${k}</span>`).join("")}</div>
        </div></div>`;
  };
  return `<section class="passk-results" id="model-results" data-passk-results aria-label="Model pass@k comparison">
    <figure class="passk-card"><figcaption><h3>pass@k by task family</h3><span class="passk-tag">Evaluation · held-out test seeds</span></figcaption>
      <p class="passk-chart-note">Success (%) versus independent attempts, k, averaged over the measured levels of each family. Families are not averaged together.</p>
      <div class="passk-legend" role="group" aria-label="Highlight a model">${legend}</div>
      <div class="passk-families">${curveFamilies(results).map(chart).join("")}</div>
      ${results.levelNote ? `<p class="passk-chart-note passk-footnote">${escapeHtml(results.levelNote)}</p>` : ""}
    </figure>
  </section>
  <script src="/kinetic-gym/results.js" defer></script>`;
}

// pass@1 on each level, one small chart per family, so the drop on the harder levels is visible.
export function renderPasskLevels(results) {
  validatePasskResults(results);
  const levels = [1, 2, 3, 4, 5, 6, 7, 8];
  const x = (index) => (index / (levels.length - 1)) * 100;
  const legend = results.models.map((model, index) => ({ model, index }))
    .map(({ model, index }) => `<button type="button" class="passk-legend-item passk-series-${index}" data-passk-focus="${index}"><i aria-hidden="true"></i>${escapeHtml(model.name)}</button>`).join("");
  const grid = [0, 25, 50, 75, 100].map((rate) => `<line x1="0" x2="600" y1="${260 * (1 - rate / 100)}" y2="${260 * (1 - rate / 100)}" vector-effect="non-scaling-stroke"/>`).join("");
  const chart = (family) => {
    const measured = results.models.map((model, index) => ({ model, index, rates: model.passAtKPercent[family.id]?.levels })).filter(({ rates }) => rates);
    if (!measured.length) return "";
    const curves = measured.map(({ model, index, rates }) => {
      const coordinates = rates.map((rate, level) => `${(x(level) * 6).toFixed(3)},${(260 * (1 - rate / 100)).toFixed(3)}`).join(" ");
      return `<g class="passk-series-${index}" data-passk-focus="${index}"><title>${escapeHtml(model.name)}</title><polyline class="passk-hit" points="${coordinates}" vector-effect="non-scaling-stroke"/><polyline data-passk-series="${index}" points="${coordinates}" vector-effect="non-scaling-stroke"/></g>`;
    }).join("");
    const points = measured.map(({ model, index, rates }) => rates.map((rate, level) => `<button type="button" class="passk-point passk-series-${index}" data-passk-point="${family.id}-${index}-l${level + 1}" data-passk-focus="${index}" style="left:${x(level).toFixed(3)}%;top:${100 - rate}%;--k:${level}" aria-label="${escapeAttr(`${family.name}, ${model.name} · level ${level + 1}: ${rate.toFixed(1)}%`)}"></button>`).join("")).join("");
    return `<div class="passk-family"><h4 id="passk-level-${family.id}">${escapeHtml(family.name)}</h4>
        <div class="passk-chart" role="group" aria-labelledby="passk-level-${family.id}">
          <div class="passk-y-ticks" aria-hidden="true">${[100, 75, 50, 25, 0].map((rate) => `<span style="top:${100 - rate}%">${rate}</span>`).join("")}</div>
          <div class="passk-plot"><svg viewBox="0 0 600 260" preserveAspectRatio="none" aria-hidden="true">${grid}${curves}</svg>${points}</div>
          <div class="passk-x-ticks" aria-hidden="true">${levels.map((level) => `<span>L${level}</span>`).join("")}</div>
        </div></div>`;
  };
  return `<section class="passk-results passk-levels" data-passk-results aria-label="Success rate by level">
    <figure class="passk-card"><figcaption><h3>Success rate by level</h3><span class="passk-tag">pass@1 · held-out test seeds</span></figcaption>
      <p class="passk-lede">Levels are designed to get harder from 1 to 8, but each one changes a different part of the task, like speed, rules, clutter or timing. So a later level can turn out easier for a model than an earlier one. With 20 episodes per level, small bumps are mostly noise.</p>
      <div class="passk-legend" role="group" aria-label="Highlight a model">${legend}</div>
      <div class="passk-families">${byDifficulty(results, workshopCatalog.families).map(chart).join("")}</div>
    </figure>
  </section>`;
}

// Share of scored episodes solved (pass@1), one row per family. No bar averages families, for the reason above.
export function renderPasskOverall(results) {
  validatePasskResults(results);
  const all = results.models.map((model, index) => ({ model, index }));
  const models = all.filter(({ model }) => Object.values(model.passAtKPercent).some(Boolean));
  const legend = all.map(({ model, index }) => `<span class="passk-legend-item passk-series-${index}"><i aria-hidden="true"></i>${escapeHtml(model.name)}</span>`).join("");
  const rows = byDifficulty(results, workshopCatalog.families).map((family) => {
    const bars = models.map(({ model, index }) => {
      const entry = model.passAtKPercent[family.id];
      if (!entry) return `<div class="passk-bar passk-missing"><span class="passk-bar-value">—</span></div>`;
      const rate = entry[1];
      return `<div class="passk-bar passk-series-${index}" title="${escapeAttr(`${family.name}, ${model.name}: ${rate.toFixed(1)}% solved`)}"><i style="--rate:${rate}"></i><span class="passk-bar-value">${Math.round(rate)}%</span></div>`;
    }).join("");
    return `<tr><th scope="row">${escapeHtml(family.name)}</th><td>${bars}</td></tr>`;
  }).join("");
  return `<section class="passk-results passk-overall" aria-label="Success rate by task family">
    <figure class="passk-card"><figcaption><h3>Success rate by task family</h3><span class="passk-tag">pass@1 · held-out test seeds</span></figcaption>
      <div class="passk-legend">${legend}</div>
      <table class="passk-bars" aria-label="Share of scored episodes solved (%) by task family and model"><tbody>${rows}</tbody></table>
      <p class="passk-chart-note passk-footnote">Up to 160 scored episodes per family and model, from 8 levels, 4 seeds and 5 attempts each. Conveyor picking is single-shot, but the other families allow three rehearsals before each scored episode.</p>
    </figure>
  </section>`;
}

function renderWorkshopArchitecture() {
  // Inline, so the drawing picks up the theme's CSS variables.
  const svg = readFileSync(new URL("../static/kinetic-gym/workshop-architecture.svg", import.meta.url), "utf8");
  return `<figure class="workshop-architecture">${svg}</figure>`;
}

const SEED_EXAMPLES = [
  { clip: "l1-s2000000", title: "Level 1 · test seed 1", detail: "Yellow cubes, 4th and 8th, into bin A" },
  { clip: "l1-s2000001", title: "Level 1 · test seed 2", detail: "Blue cubes, 8th and 11th, into bin A" },
  { clip: "l8-s2000000", title: "Level 8 · test seed 1", detail: "Small blue cubes into A, large yellow cubes into B" },
];

function renderSeedExamples() {
  const panels = SEED_EXAMPLES.map(({ clip, title, detail }) => `<figure class="seed-example">
      <video autoplay muted loop playsinline preload="metadata" poster="/kinetic-gym/seeds/${clip}.jpg" src="/kinetic-gym/seeds/${clip}.mp4" aria-label="${escapeAttr(`${title}: ${detail}`)}"></video>
      <figcaption><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></figcaption>
    </figure>`).join("\n");
  return `<figure class="seed-examples">
    <div class="seed-example-grid">${panels}</div>
  </figure>`;
}

// Conveyor picking's level ladder, copied from LEVELS in the family's sampler (conveyor-v2).
const CONVEYOR_LEVELS = [
  { level: 1, objects: 12, speed: [0.055, 0.065], spacing: [1.4, 2.2], rule: ["colour"], bins: 1 },
  { level: 2, objects: 12, speed: [0.075, 0.09], spacing: [1.4, 2.2], rule: ["colour"], bins: 1 },
  { level: 3, objects: 14, speed: [0.06, 0.075], spacing: [1.0, 1.5], rule: ["colour"], bins: 1 },
  { level: 4, objects: 12, speed: [0.06, 0.075], spacing: [1.3, 1.9], rule: ["colour", "shape"], bins: 1 },
  { level: 5, objects: 12, speed: [0.06, 0.075], spacing: [1.3, 1.9], rule: ["colour", "size"], bins: 1 },
  { level: 6, objects: 13, speed: [0.06, 0.078], spacing: [1.2, 1.7], rule: ["colour", "shape", "size"], bins: 1 },
  { level: 7, objects: 14, speed: [0.06, 0.078], spacing: [1.1, 1.6], rule: ["colour"], bins: 2 },
  { level: 8, objects: 16, speed: [0.075, 0.09], spacing: [0.85, 1.25], rule: ["colour", "shape", "size"], bins: 2 },
];

function renderConveyorLevels() {
  const range = ([low, high], [min, max], digits, unit) => {
    const left = ((low - min) / (max - min)) * 100;
    const width = ((high - low) / (max - min)) * 100;
    return `<div class="cl-range"><div class="cl-track"><span style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></span></div><small>${low.toFixed(digits)}–${high.toFixed(digits)}<span class="cl-unit"> ${unit}</span></small></div>`;
  };
  const rows = CONVEYOR_LEVELS.filter(({ level }) => [1, 2, 4, 8].includes(level)).map(({ level, speed, spacing, rule, bins }) => `<li class="cl-row">
      <span class="cl-level">L${level}</span>
      <span class="cl-cell" data-label="Belt speed">${range(speed, [0.05, 0.095], 3, "m/s")}</span>
      <span class="cl-cell" data-label="Gap">${range(spacing, [0.8, 2.3], 2, "s")}</span>
      <span class="cl-cell cl-rule" data-label="Rule">${rule.map((part) => `<b>${part}</b>`).join("")}${bins > 1 ? `<b class="cl-bins">${bins} bins</b>` : ""}</span>
    </li>`).join("\n");
  return `<figure class="conveyor-levels">
    <ol class="cl-grid">
      <li class="cl-row cl-head" aria-hidden="true"><span>Level</span><span>Belt speed<span class="cl-head-unit"> (m/s)</span></span><span><span class="cl-head-long">Time between objects</span><span class="cl-head-short">Gap (s)</span></span><span>Rule</span></li>
      ${rows}
    </ol>
  </figure>`;
}

// What each level contains, per family, from the level tables in each family's sampler. An item that the level
// before did not have is drawn as new.
const LEVEL_LADDER = [
  { id: "conveyor", name: "Conveyor", levels: [
    ["pick by colour", "slow belt", "12 objects", "1 bin"],
    ["pick by colour", "fast belt", "12 objects", "1 bin"],
    ["pick by colour", "medium belt", "14 objects, closer together", "1 bin"],
    ["colour + shape", "medium belt", "12 objects", "1 bin"],
    ["colour + size", "medium belt", "12 objects", "1 bin"],
    ["colour + shape + size", "medium belt", "13 objects", "1 bin"],
    ["pick by colour", "medium belt", "14 objects", "2 bins"],
    ["colour + shape + size", "fast belt", "16 objects, closest together", "2 bins"],
  ] },
  { id: "crane", name: "Crane", levels: [
    ["hook at rest", "eye in place"],
    ["small swing, 2–4 cm", "eye in place"],
    ["swing 8–13 cm", "eye in place"],
    ["swing 14–20 cm", "eye in place"],
    ["swing 14–20 cm", "random release phase", "eye in place"],
    ["swing 14–20 cm", "fore-aft swing too", "eye in place"],
    ["swing 14–20 cm", "random release phase", "eye moved"],
    ["swing 14–20 cm", "fore-aft swing too", "random release phase", "eye moved"],
  ] },
  { id: "goalkeeper", name: "Goalkeeper", levels: [
    ["3 balls", "2.0–2.8 s apart", "within reach", "hand targets"],
    ["3 balls", "1.0–1.5 s apart", "within reach", "hand targets"],
    ["3 balls", "1.0–1.5 s apart", "closer catapults", "within reach", "hand targets"],
    ["3 balls", "1.0–1.5 s apart", "closer catapults", "edge of reach", "hand targets"],
    ["3 balls", "2 at once", "within reach", "14 arm joints"],
    ["save 2, let 1 through", "1.0–1.5 s apart", "within reach", "14 arm joints"],
    ["save 2, let 1 through", "2 at once", "edge of reach", "14 arm joints"],
    ["save 2, let 1 through", "2 at once", "0.6–0.9 s apart", "edge of reach", "14 arm joints"],
  ] },
  { id: "marble", name: "Marble maze", levels: [
    ["1 marble", "1 start region", "gate on a fixed cycle"],
    ["1 marble", "4 start regions", "gate on a fixed cycle"],
    ["1 marble", "4 start regions", "gate at any phase"],
    ["1 marble", "4 start regions", "gate at any phase", "gate speed varies"],
    ["1 marble", "4 start regions", "gate at any phase", "gate speed varies", "starts rolling"],
    ["2 marbles, same colour", "gate at any phase", "gate speed varies"],
    ["2 marbles, red and blue", "gate at any phase", "gate speed varies"],
    ["2 marbles, either rule", "gate at any phase", "gate speed varies", "starts rolling"],
  ] },
  { id: "pinball", name: "Pinball", levels: [
    ["4 targets", "18 mm targets", "4 hits", "40 s"],
    ["4 targets", "18 mm targets", "6 hits", "40 s"],
    ["4 targets", "10 mm targets", "4 hits", "40 s"],
    ["4 targets", "12 mm targets", "6 hits", "40 s"],
    ["5 targets, closer together", "12 mm targets", "6 hits", "60 s"],
    ["5 targets, closer together", "10 mm targets", "8 hits", "60 s"],
    ["5 targets, closer together", "8 mm targets", "8 hits", "60 s"],
    ["5 targets, closer together", "8 mm targets", "10 hits", "60 s"],
  ] },
];

function renderLevelLadder() {
  const tabs = LEVEL_LADDER.map(({ id, name }, index) => `<input type="radio" name="level-ladder" id="ll-${id}" class="ll-input"${index === 0 ? " checked" : ""}><label for="ll-${id}" class="ll-tab">${escapeHtml(name)}</label>`).join("");
  const panels = LEVEL_LADDER.map(({ id, levels }) => {
    const rows = levels.map((items, index) => {
      const before = new Set(levels[index - 1] || items);
      const chips = items.map((item) => `<b${before.has(item) ? "" : ' class="ll-new"'}>${escapeHtml(item)}</b>`).join("");
      return `<li><span class="ll-level">L${index + 1}</span><span class="ll-chips">${chips}</span></li>`;
    }).join("");
    return `<ol class="ll-panel ll-panel-${id}">${rows}</ol>`;
  }).join("");
  return `<figure class="level-ladder">
    <div class="ll-tabs">${tabs}${panels}</div>
    <figcaption>Highlighted items changed from the level before. The seed then picks the exact scene inside these ranges.</figcaption>
  </figure>`;
}

function renderControllerReplay() {
  return `<figure class="controller-replay" data-controller-replay data-src="/kinetic-gym/controller/run.json" data-frames="/kinetic-gym/controller/frames">
    <div class="cr-stage">
      <div class="cr-cam"><img alt="GPT-6.1 Sol's controller: hand camera view" width="192" height="144"><svg class="cr-boxes" viewBox="0 0 192 144" aria-hidden="true"></svg></div>
      <div class="cr-code">
        <div class="cr-title"><code>act(obs)</code> in Sol's <code>solution.py</code></div>
        <ol class="cr-phases"></ol>
        <pre class="cr-return" aria-live="off"></pre>
      </div>
    </div>
    <div class="cr-clock"></div>
    <div class="cr-controls">
      <button type="button" class="cr-play" aria-pressed="true">Pause</button>
      <button type="button" class="cr-speed" aria-label="Playback speed">1×</button>
      <div class="cr-timeline" tabindex="0" role="slider" aria-label="Replay time"><span class="cr-head"></span></div>
    </div>
  </figure>
  <script src="/kinetic-gym/controller.js" defer></script>`;
}

function renderCraneFail() {
  return `<figure class="blind-clip">
    <video autoplay muted loop playsinline preload="metadata" poster="/kinetic-gym/crane-sol-fail.jpg" src="/kinetic-gym/crane-sol-fail.mp4" aria-label="GPT-6.1 Sol's one-shot crane controller threads the hook through the eye, but the hook slips out and never carries the load"></video>
  </figure>`;
}

function renderMarbleBlind() {
  return `<figure class="blind-clip">
    <video autoplay muted loop playsinline preload="metadata" poster="/kinetic-gym/marble-blind.jpg" src="/kinetic-gym/marble-blind.mp4" aria-label="DeepSeek's camera-free policy steering the marble into the red hole"></video>
    <figcaption>Cameras off. DeepSeek's <code>servo_load.py</code> steers the marble into the red hole using only the board's joint angles. Rerun on level 1, seed 9001001, which it also solved at the gate.</figcaption>
  </figure>`;
}

function renderPipeline() {
  const svg = readFileSync(new URL("../static/kinetic-gym/pipeline.svg", import.meta.url), "utf8");
  return `<figure class="kg-pipeline">${svg}</figure>`;
}

const TRACE_LOGOS = { DeepSeek: "/kinetic-gym/logos/deepseek.svg", GPT: "/kinetic-gym/logos/openai.svg", Claude: "/kinetic-gym/logos/claude.svg" };

// A ```trace block: "Model | context", then "> " thoughts, "$ tool: command" calls and "= " results, in trace order.
function renderTrace(lines) {
  const [name, context = ""] = (lines[0] || "").split("|").map((part) => part.trim());
  const initials = (name.split(" ")[0].match(/[A-Z]/g) || [name[0] || "?"]).slice(0, 2).join("");
  const logo = Object.entries(TRACE_LOGOS).find(([prefix]) => name.startsWith(prefix))?.[1];
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
    url: `/blog/${encodeURIComponent(post.slug)}/`,
    text: post.body,
  }))));

  await writePage(join(outDir, "index.html"), renderIndex(publishedPosts, about, stylesheet));
  await writePage(join(outDir, "writing", "index.html"), renderWriting(publishedPosts, stylesheet));

  for (const post of resolvedPosts) {
    await writePage(join(outDir, "blog", post.slug, "index.html"), renderPost(post, stylesheet));
    // Posts used to live under /essays/; keep those links working.
    await writePage(join(outDir, "essays", post.slug, "index.html"), renderRedirect(`/blog/${post.slug}/`));
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
      return `<a class="post-row" href="/blog/${post.slug}/">
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
    preview: { path: "/writing/" },
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
    preview: { title: post.title, path: `/blog/${post.slug}/`, image: post.image, type: "article" },
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

function layout({ title, description, main, stylesheet = "/styles.css", noindex = false, brand = SITE.brand, preview = {} }) {
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
  ${renderPreviewMeta({ title, description, ...preview })}
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

// Open Graph and Twitter tags, which chat apps and social sites read to build link previews.
function renderPreviewMeta({ title, description, path = "/", image, type = "website" }) {
  const imageUrl = new URL(image || SITE.image, SITE.url).href;
  const tags = [
    ["property", "og:site_name", SITE.title],
    ["property", "og:type", type],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", new URL(path, SITE.url).href],
    ["property", "og:image", imageUrl],
    ["name", "twitter:card", image ? "summary_large_image" : "summary"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", imageUrl],
  ];
  return tags.map(([key, name, value]) => `<meta ${key}="${name}" content="${escapeAttr(value)}">`).join("\n  ");
}

function renderRedirect(url) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Redirecting…</title>
  <link rel="canonical" href="${url}">
  <meta http-equiv="refresh" content="0; url=${url}">
</head>
<body><a href="${url}">${url}</a></body>
</html>`;
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
