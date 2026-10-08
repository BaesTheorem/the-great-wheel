// Everything drawn in HTML over the canvas: scene labels, the top bar, the info panel and its
// tabs, the time control, the view switch, the title and distance readout, and toasts.
import * as THREE from "three";
import { KINDS, SIZE_HELP } from "./atlas.js";
import * as H from "./harptos.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);

// ---------- labels over the scene ----------
export class Labels {
  constructor(root) { this.root = root; this.els = new Map(); }

  update(items, camera) {
    const W = innerWidth, H_ = innerHeight, seen = new Set();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    // the page's own panels and controls count as placed, so no label text lands under them
    // (read twice a second: reading the layout every frame would force a reflow each frame)
    const now = performance.now();
    if (!this.blockers || now - this.blockersAt > 500) {
      this.blockersAt = now;
      this.blockers = [...document.querySelectorAll(".tb .brand, .tb .crumbs, .tb .seg, .tb .tlink, #hero, #tiles, #timearc, #pdate, #rail, #readout.on, body.panel-open #panel, body.editing #editbar")]
        .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height).map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
    }
    const placed = [...this.blockers];
    const P = 3;
    const hits = (b) => placed.some((p) => b.x - P < p.x + p.w && b.x + b.w + P > p.x && b.y - P < p.y + p.h && b.y + b.h + P > p.y);
    const order = items.map((it, i) => [it.prio ?? 2, i]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    for (const [, idx] of order) {
      const it = items[idx];
      v.copy(it.world).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H_;
      if (x < -60 || x > W + 60 || y < -40 || y > H_ + 40) continue;
      if (it.span && it.minSpan) {  // a current's label only when the current is long enough on screen
        const a = it.span[0].clone().project(camera), b = it.span[1].clone().project(camera);
        if (Math.hypot((a.x - b.x) * W / 2, (a.y - b.y) * H_ / 2) < it.minSpan) continue;
      }
      let pr = 0;
      if (it.r) { w.copy(it.world).addScaledVector(right, it.r).project(camera); pr = Math.hypot(((w.x + 1) / 2 * W) - x, ((1 - w.y) / 2 * H_) - y); }
      const rr = Math.max(8, pr + 6);
      // the label's text box, from its length (11 px caps with wide tracking: about 10 px a letter)
      const tw = (it.text?.length || 0) * (it.region ? 9.5 : it.dim ? 8.6 : 10) + 4, th = it.sub ? 30 : 16;
      const box = it.below ? { x: x - tw / 2, y: y + rr + 6, w: tw, h: th } : it.flowLabel || it.region ? { x: x - tw / 2, y: y - th / 2, w: tw, h: th } : it.pin ? { x: x + 40, y: y - 8, w: tw, h: 16 } : { x: x + rr + 6, y: y - th / 2, w: tw, h: th };
      const showText = it.sel || !hits(box);
      if (showText) placed.push(box);
      if (!showText && !it.ring && !it.pin) continue;
      seen.add(it.key);
      let el = this.els.get(it.key);
      if (!el) { el = this.make(it); this.els.set(it.key, el); this.root.appendChild(el); }
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.classList.toggle("sel", !!it.sel);
      el.classList.toggle("dim", !!it.dim);
      el.classList.toggle("notext", !showText);
      el._x = x; el._y = y; el._rr = rr; el._item = it; el._box = showText ? box : null;
      const ring = el.firstChild;
      if (ring?.classList?.contains("ring")) { ring.style.width = ring.style.height = `${2 * rr}px`; }
      const txt = el.querySelector(".t");
      if (txt) {
        if (it.below) txt.style.transform = `translate(-50%, ${rr + 14}px)`;
        else if (it.flowLabel || it.region) txt.style.transform = "translate(-50%, -50%)";
        else if (!it.pin) txt.style.transform = `translate(${rr + 7}px, -50%)`;
      }
    }
    for (const [k, el] of this.els) if (!seen.has(k)) { el.remove(); this.els.delete(k); }
  }

  make(it) {
    const el = document.createElement("div");
    el.className = "lab" + (it.pin ? " pin" : "") + (it.flowLabel ? " flowlab" : "") + (it.region ? " regionlab" : "");
    if (it.pin) {
      el.innerHTML = `<span class="pindot"></span><span class="lead"></span><a class="t" ${it.link ? `href="${esc(it.link)}"` : ""}>${esc(it.text)}</a>`;
      return el;
    }
    if (it.ring) {
      const ring = document.createElement("span");
      ring.className = "ring" + (it.dash ? " dash" : "");
      ring.style.borderColor = it.color;
      el.appendChild(ring);
    }
    const t = document.createElement("span");
    t.className = "t" + (it.below ? " below" : "");
    t.innerHTML = esc(it.text) + (it.sub ? `<small>${esc(it.sub)}</small>` : "");
    el.appendChild(t);
    return el;
  }

  // The label under a screen point, if any.
  hit(x, y) {
    let best = null, bd = Infinity;
    for (const el of this.els.values()) {
      if (el.classList.contains("regionlab")) {
        const b = el._box;
        if (b && x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6) return el._item;
        continue;
      }
      if (el.classList.contains("flowlab") || el.classList.contains("pin")) continue;
      const d = Math.hypot(el._x - x, el._y - y);
      if (d <= el._rr + 6 && d < bd) { bd = d; best = el._item; }
    }
    return best;
  }
  clear() { for (const el of this.els.values()) el.remove(); this.els.clear(); }
}

// ---------- formatting ----------
export function miles(n) {
  if (!(n > 0)) return "";
  if (n >= 1e9) return `${(n / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} billion mi`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })} million mi`;
  return `${Math.round(n).toLocaleString()} mi`;
}
const sourceText = (s) => `${esc(s.title)}${s.pages ? `, ${/\d/.test(s.pages) ? "p. " : ""}${esc(s.pages)}` : ""}`;

// The Forgotten Realms Wiki page for an entity: a page title ("Glyth#Haven" for a section) or a
// full URL. Without one, a wiki search for the name, so every entity links somewhere useful.
export function wikiURL(wiki, name) {
  const base = "https://forgottenrealms.fandom.com/wiki/";
  if (!wiki) return name ? `${base}Special:Search?query=${encodeURIComponent(name)}` : "";
  if (/^https?:/.test(wiki)) return wiki;
  const [page, anchor] = wiki.split("#");
  const enc = (x) => encodeURIComponent(x.trim().replace(/ /g, "_"));
  return base + enc(page) + (anchor ? `#${enc(anchor)}` : "");
}

export function kindLine(b, atlas, sphereId) {
  const k = KINDS[b.kind]?.label || b.kind;
  const el = b.element && b.element !== "other" ? `${b.element[0].toUpperCase()}${b.element.slice(1)} body` : "";
  const parent = b.parent ? atlas.body(sphereId, b.parent)?.name : "";
  return [el && b.kind !== "star" ? el : k, el && b.kind !== "star" && b.kind !== "planet" ? k.toLowerCase() : "", parent ? `of ${parent}` : ""].filter(Boolean).join(" · ");
}

// ---------- the info panel ----------
export function infoHTML(app, sel) {
  const { atlas, edition, edit } = app.state;
  if (!sel) return emptyInfo(app);
  if (sel.type === "sphere") {
    const s = atlas.spheres(edition, true).find((x) => x.id === sel.id);
    if (!s) return emptyInfo(app);
    const flows = atlas.flows(edition, edit);
    const kind = edition === "5e" ? "Wildspace system" : "Crystal sphere";
    const facts = [...(s.facts || [])];
    if (s.shell_radius_mi && !facts.some((f) => /radius/i.test(f[0]))) facts.unshift(["Shell radius", miles(s.shell_radius_mi)]);
    const routes = flows.filter((f) => f.direction === "route" && (f.from === s.id || f.to === s.id)).map((f) => atlas.sphere(f.from === s.id ? f.to : f.from)?.name);
    const outC = flows.filter((f) => f.direction !== "route" && (f.from === s.id || (f.direction === "two-way" && f.to === s.id))).map((f) => atlas.sphere(f.from === s.id ? f.to : f.from)?.name);
    const inC = flows.filter((f) => f.direction !== "route" && (f.to === s.id || (f.direction === "two-way" && f.from === s.id))).map((f) => atlas.sphere(f.to === s.id ? f.from : f.to)?.name);
    if (outC.length) facts.push(["Currents out", [...new Set(outC)].join(", ")]);
    if (inC.length) facts.push(["Currents in", [...new Set(inC)].join(", ")]);
    if (routes.length) facts.push(["Known routes", [...new Set(routes)].join(", ")]);
    const grp = s.region ? atlas.region(s.region) : null;
    return block({
      kind: `${kind} · ${s.charted ? "charted" : "uncharted"}${s.secret ? " · secret" : ""}`, dot: s.charted ? "#9db4ff" : "rgba(220,228,255,.55)",
      title: s.name, aka: s.aka, summary: s.summary, wiki: wikiURL(s.wiki, s.name), wikiExact: !!s.wiki, dmLinks: edit ? s.dm_links : null,
      related: grp ? [{ id: `region:${grp.id}`, name: grp.name, icon: "bubble_chart" }] : null, facts, sources: s.sources, links: s.links, dm: edit ? s.dm : "",
      actions: [
        app.state.view === "sphere" && app.state.sphereId === s.id ? ["frame", "center_focus_strong", "Show whole sphere"] : ["enter", "login", "Enter sphere"],
        edit ? ["edit", "edit", "Edit", "border"] : null,
      ],
    });
  }
  if (sel.type === "flow") {
    const f = atlas.flow(sel.id);
    if (!f) return emptyInfo(app);
    const A = atlas.sphere(f.from)?.name, B = atlas.sphere(f.to)?.name;
    const facts = [["From", A], ["To", B], ["Direction", f.direction === "two-way" ? "Both ways" : f.direction === "one-way" ? "One way only" : "Not given in the books"]];
    if (f.days) facts.push(["Travel time", /^\d+$/.test(String(f.days)) ? `About ${f.days} days` : `${f.days} days`]);
    return block({
      kind: `Current in the ${edition === "5e" ? "Astral Sea" : "phlogiston"}`, dot: "#e6f0ff",
      title: f.direction === "two-way" ? `${A} ⇄ ${B}` : f.direction === "one-way" ? `${A} → ${B}` : `${A} · ${B}`, summary: f.summary, wiki: wikiURL(f.wiki, "flow phlogiston"), wikiExact: !!f.wiki, facts, sources: f.sources, dm: edit ? f.dm : "",
      actions: [edit ? ["edit", "edit", "Edit", "border"] : null],
    });
  }
  if (sel.type === "region") {
    const g = atlas.region(sel.id);
    if (!g) return emptyInfo(app);
    const members = atlas.spheres(edition, edit).filter((x) => x.region === g.id);
    return block({
      kind: `Group of spheres · ${members.length}`, dot: "#c8d0ff", title: g.name, summary: g.summary, sources: g.sources,
      wiki: wikiURL(g.wiki, g.name), wikiExact: !!g.wiki,
      related: members.map((m) => ({ id: `sphere:${m.id}`, name: m.name, icon: m.charted ? "public" : "radio_button_unchecked" })),
      actions: [],
    });
  }
  // a body inside a sphere or between the spheres
  const b = sel.sphere ? atlas.bodies(sel.sphere, edition, true).find((x) => x.id === sel.id) : atlas.betweenBodies(edition, true).find((x) => x.id === sel.id);
  if (!b) return emptyInfo(app);
  const facts = [...(b.facts || [])];
  if (!facts.length) {
    if (b.size_class) facts.push(["Size", `${b.size_class} (${SIZE_HELP[b.size_class] || ""})`]);
    if (b.orbit?.radius_mi) facts.push(["Orbit", miles(b.orbit.radius_mi)]);
    if (b.orbit?.period_days) facts.push(["Year", `${b.orbit.period_days} days`]);
  }
  if (b.orbit?.approx || b.fixed?.approx) facts.push(["Map position", "Approximate"]);
  const kids = sel.sphere ? atlas.children(sel.sphere, b.id).filter((c) => !c.secret || edit) : [];
  const related = [];
  if (b.parent && sel.sphere) { const p = atlas.body(sel.sphere, b.parent); if (p) related.push(p); }
  related.push(...kids);
  return block({
    kind: kindLine(b, atlas, sel.sphere) + (b.secret ? " · secret" : ""), dot: b.look?.color || "#9fb0c8",
    title: b.name, summary: b.summary, facts, sources: b.sources, links: b.links, dm: edit ? b.dm : "", dmLinks: edit ? b.dm_links : null,
    wiki: wikiURL(b.wiki, b.name), wikiExact: !!b.wiki,
    related: related.map((r) => ({ id: r.id, name: r.name, icon: KINDS[r.kind]?.icon || "circle" })),
    actions: [
      sel.sphere ? ["fly", "my_location", "Fly to"] : null,
      ...(b.pins || []).filter((p) => p.link).map((p) => ["link:" + p.link, "open_in_new", p.name, "border"]),
      edit ? ["edit", "edit", "Edit", "border"] : null,
    ],
  });
}

function emptyInfo(app) {
  const { atlas, edition, view, sphereId } = app.state;
  if (view === "sphere") {
    const s = atlas.spheres(edition, true).find((x) => x.id === sphereId);
    return block({ kind: edition === "5e" ? "Wildspace system" : "Crystal sphere", dot: "#9db4ff", title: s?.name, summary: s?.summary, facts: s?.facts, sources: s?.sources, wiki: wikiURL(s?.wiki, s?.name), wikiExact: !!s?.wiki, actions: [] });
  }
  const between = atlas.data.between;
  return block({ kind: "Between the spheres", dot: "#e6f0ff", title: between.name?.[edition] || "Between the spheres", summary: between.summary?.[edition], sources: between.sources, wiki: wikiURL(between.wiki?.[edition], between.name?.[edition]), wikiExact: !!between.wiki?.[edition], actions: [] });
}

function block(o) {
  const facts = (o.facts || []).filter((f) => f && f[1]);
  return `
  <div class="blk head"><div class="kind"><span class="dot" style="background:${esc(o.dot)}"></span>${esc(o.kind)}</div>
    <h2>${esc(o.title)}</h2>${o.aka?.length ? `<div class="aka">Also: ${o.aka.map(esc).join(", ")}</div>` : ""}
    ${o.wiki ? `<a class="wiki" href="${esc(o.wiki)}" target="_blank" rel="noopener"><i>menu_book</i><span>${!o.wikiExact ? "Search the Forgotten Realms Wiki" : o.wiki.includes("spelljammer.fandom.com") ? "Spelljammer Wiki" : "Forgotten Realms Wiki"}</span><i class="ext">open_in_new</i></a>` : ""}</div>
  ${o.summary ? `<div class="blk"><h3>Description</h3><p>${esc(o.summary)}</p></div>` : ""}
  ${facts.length ? `<div class="blk"><h3>Facts</h3><dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>` : ""}
  ${o.dm || o.dmLinks?.length ? `<div class="blk dm"><h3><i>visibility_off</i>DM notes</h3>${o.dm ? `<p>${esc(o.dm)}</p>` : ""}${o.dmLinks?.length ? `<div class="chips" style="margin-top:10px">${o.dmLinks.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><i>lock</i><span>${esc(l.label)}</span></a>`).join("")}</div>` : ""}</div>` : ""}
  ${o.related?.length ? `<div class="blk"><h3>${o.kind?.startsWith("Group") ? "Spheres" : "Related"}</h3><div class="chips">${o.related.map((r) => `<a data-act="${r.id.startsWith("sphere:") ? "select-sphere:" + esc(r.id.slice(7)) : r.id.startsWith("region:") ? "select-region:" + esc(r.id.slice(7)) : "select:" + esc(r.id)}"><i>${r.icon}</i><span>${esc(r.name)}</span></a>`).join("")}</div></div>` : ""}
  ${o.sources?.length ? `<div class="blk"><h3>Sources</h3><ul class="src">${o.sources.map((s) => `<li>${sourceText(s)}</li>`).join("")}</ul></div>` : ""}
  ${o.links?.length ? `<div class="blk"><div class="chips">${o.links.map((l) => `<a href="${esc(l.url)}"><i>open_in_new</i><span>${esc(l.label)}</span></a>`).join("")}</div></div>` : ""}
  ${(o.actions || []).filter(Boolean).length ? `<div class="blk acts-blk"><div class="acts">${o.actions.filter(Boolean).map(([act, icon, label, cls]) => `<button class="${cls || ""}" data-act="${esc(act)}"><i>${icon}</i><span>${esc(label)}</span></button>`).join("")}</div></div>` : ""}`;
}

// ---------- the Bodies tab: a tree of everything in view ----------
export function bodiesHTML(app) {
  const { atlas, edition, edit, view, sphereId, selected } = app.state;
  const isSel = (type, id) => selected?.type === type && selected.id === id;
  if (view === "sphere") {
    const list = atlas.bodies(sphereId, edition, edit);
    if (!list.length) return `<div class="blk"><p>No bodies yet.${edit ? " Use Add body in the edit bar." : ""}</p></div>`;
    const rows = [];
    const walk = (pid, depth) => {
      for (const b of list.filter((x) => (x.parent || null) === pid)) {
        rows.push(`<a class="row${isSel("body", b.id) ? " on" : ""}" data-act="select:${esc(b.id)}" style="padding-left:${16 + depth * 18}px"><span class="dot" style="background:${esc(b.look?.color || "#9fb0c8")}"></span><span>${esc(b.name)}</span><small>${esc(KINDS[b.kind]?.label || b.kind)}${b.secret ? " · secret" : ""}</small></a>`);
        walk(b.id, depth + 1);
      }
    };
    walk(null, 0);
    // bodies whose parent is missing still show
    for (const b of list) if (b.parent && !list.some((x) => x.id === b.parent)) rows.push(`<a class="row" data-act="select:${esc(b.id)}"><span>${esc(b.name)}</span><small>parent not found</small></a>`);
    return `<div class="tree">${rows.join("")}</div>`;
  }
  const spheres = atlas.spheres(edition, edit), flows = atlas.flows(edition, edit), free = atlas.betweenBodies(edition, edit);
  return `<div class="tree">
    ${[...atlas.regions(edition).map((g) => [g, spheres.filter((s) => s.region === g.id)]), [{ name: "Other spheres" }, spheres.filter((s) => !s.region || !atlas.regions(edition).some((g) => g.id === s.region))]]
      .filter(([, list]) => list.length).map(([g, list]) => `<div class="sec">${g.id ? `<a data-act="select-region:${esc(g.id)}">${esc(g.name)}</a>` : esc(g.name)}</div>${list.sort((a, b) => (b.charted - a.charted) || a.name.localeCompare(b.name)).map((s) => `<a class="row${isSel("sphere", s.id) ? " on" : ""}" data-act="select-sphere:${esc(s.id)}"><span class="dot" style="background:${s.charted ? "#9db4ff" : "rgba(220,228,255,.45)"}"></span><span>${esc(s.name)}</span><small>${s.charted ? `${(s.bodies || []).length} bodies` : "uncharted"}</small></a>`).join("")}`).join("")}
    <div class="sec">Currents</div>${flows.length ? flows.map((f) => `<a class="row${isSel("flow", f.id) ? " on" : ""}" data-act="select-flow:${esc(f.id)}"><span class="dot" style="background:#e6f0ff"></span><span>${esc(atlas.sphere(f.from)?.name)} ${f.direction === "two-way" ? "⇄" : f.direction === "one-way" ? "→" : "·"} ${esc(atlas.sphere(f.to)?.name)}</span><small>${f.days ? `${f.days} days` : ""}</small></a>`).join("") : `<p class="none">None in this edition.</p>`}
    <div class="sec">Between the spheres</div>${free.length ? free.map((b) => `<a class="row${isSel("body", b.id) ? " on" : ""}" data-act="select:${esc(b.id)}"><span class="dot" style="background:${esc(b.look?.color || "#c8d0e0")}"></span><span>${esc(b.name)}</span><small>${esc(KINDS[b.kind]?.label || b.kind)}</small></a>`).join("") : `<p class="none">Nothing yet.${edit ? " Use Add body to place one." : ""}</p>`}
  </div>`;
}

// ---------- the Layers tab ----------
export function layersHTML(app) {
  const { layers, scale, edition } = app.state;
  const sw = (key, label, help) => `<label class="lrow"><span><b>${label}</b>${help ? `<small>${help}</small>` : ""}</span><span class="switch"><input type="checkbox" data-layer="${key}" ${layers[key] ? "checked" : ""}><span></span></span></label>`;
  return `<div class="blk"><h3>Show</h3>
      ${sw("orbits", "Orbits")}${sw("labels", "Labels")}${sw("minor", "Moons and minor bodies", "Shown when the camera is near their planet")}${sw("boundary", edition === "5e" ? "Edge of wildspace" : "Crystal shell")}${sw("stars", "Stars")}
    </div>
    <div class="blk"><h3>Scale</h3>
      <div class="seg wide"><a data-act="scale:schematic" class="${scale === "schematic" ? "on" : ""}">Schematic</a><a data-act="scale:true" class="${scale === "true" ? "on" : ""}">True distances</a></div>
      <p class="hint">Schematic squeezes the outer system so every world fits. True distances keep the real ratios, so the inner planets crowd the Sun.</p>
    </div>
    <div class="blk"><h3>Edition</h3>
      <div class="seg wide"><a data-act="edition:2e" class="${edition === "2e" ? "on" : ""}">2e: crystal spheres</a><a data-act="edition:5e" class="${edition === "5e" ? "on" : ""}">5e: Astral Sea</a></div>
    </div>
    <div class="blk credits"><h3>Credits</h3>
      <p>Maps of Toril: World Map of Toril by Adam Whitehead, <a href="https://atlasoficeandfireblog.wordpress.com/" target="_blank" rel="noopener">Atlas of Ice and Fire</a>. Faerûn from the Wizards of the Coast 3E map.</p>
      <p>Planet surfaces and the Sun: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener">Solar System Scope</a>, CC BY 4.0, recolored.</p>
      <p>Rocks, cliffs, the fort and the bark: <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a>, CC0. The skull: "High quality skull" by Mariano Coretti, <a href="https://commons.wikimedia.org/wiki/File:High_quality_skull.stl" target="_blank" rel="noopener">Wikimedia Commons</a>, CC BY-SA 4.0. The galleon outline: Lorc, <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>, CC BY 3.0.</p>
      <p>Facts: <em>Realmspace</em> (TSR, 1991) and the other books named on each item. Spelljammer and the Forgotten Realms belong to Wizards of the Coast.</p>
      <p>Made with three.js, Beer CSS, Inter and Material Symbols. Source code and roadmap: <a href="https://github.com/BaesTheorem/the-great-wheel" target="_blank" rel="noopener">github.com/BaesTheorem/the-great-wheel</a>.</p>
    </div>`;
}

// ---------- time control ----------
export const RATES = [-365, -30, -10, -1, 1, 10, 30, 365];
export function rateLabel(r) {
  const a = Math.abs(r), sign = r < 0 ? "−" : "";
  const name = a === 1 ? "1 day" : a === 10 ? "1 tenday" : a === 30 ? "1 month" : a === 365 ? "1 year" : `${a} days`;
  return `${sign}${name} / sec`;
}

export function renderTime(app) {
  const st = app.state, root = $("#timearc");
  if (!root) return;
  const campaign = app.campaignDay();
  const atCampaign = Math.abs(st.day - campaign) < 0.5;
  root.querySelector(".tdate").textContent = H.formatDay(st.day);
  const live = root.querySelector(".live");
  live.classList.toggle("off", !atCampaign);
  live.querySelector("span:last-child").textContent = atCampaign ? "Campaign date" : "Go to campaign date";
  root.querySelector(".rate").textContent = st.playing ? rateLabel(st.rate) : "Paused";
  root.querySelector(".day").textContent = `Day ${H.yearDoyFromDay(st.day).doy}`;
  root.querySelector(".play i").textContent = st.playing ? "pause" : "play_arrow";
  const i = RATES.indexOf(st.rate);
  const x = st.playing ? 330 + (i < 0 ? 0 : (i - 3.5) / 3.5 * 250) : 330;
  const t = (x - 4) / 652, y = (1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * 70 + t * t * 8;
  for (const c of root.querySelectorAll(".knob")) { c.setAttribute("cx", x.toFixed(1)); c.setAttribute("cy", y.toFixed(1)); }
  root.querySelector(".knob.core").setAttribute("fill", st.playing ? "#3ddc97" : "#9aa3b5");
  const chip = $("#pdate");
  if (chip) { chip.querySelector(".txt").textContent = H.formatDay(st.day); chip.querySelector("i").textContent = st.playing ? "pause" : "play_arrow"; chip.querySelector(".dot").classList.toggle("live", atCampaign); }
}

// ---------- small things ----------
let toastTimer = 0;
export function toast(msg, ms = 3200) {
  const el = $("#toast");
  el.innerHTML = msg;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), ms);
}

export function confirmDialog(title, body, okLabel = "Delete") {
  return new Promise((res) => {
    const d = $("#confirm");
    d.querySelector("h5").textContent = title;
    d.querySelector("p").innerHTML = body;
    d.querySelector(".ok span").textContent = okLabel;
    const done = (v) => { d.close(); d.querySelector(".ok").onclick = d.querySelector(".cancel").onclick = null; res(v); };
    d.querySelector(".ok").onclick = () => done(true);
    d.querySelector(".cancel").onclick = () => done(false);
    d.showModal();
  });
}
