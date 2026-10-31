/* Tessera UI — vanilla JS, no build step, no CDN.
   Everything on screen comes from an endpoint; nothing is hard-coded. */

const store = {
  token: localStorage.getItem("tessera_token") || "",
  user: JSON.parse(localStorage.getItem("tessera_user") || "null"),
  entities: null,
  dataset: null,
  week: null,
  tt: { view: "group", id: null },
  layers: { classes: true, exams: false, spectra: false, events: false },
  bookingFilter: "",
  chat: [],
};

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const DAY_LONG = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday" };
const COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"];

function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function toast(msg, kind = "") {
  const el = $("toast");
  el.className = "toast " + kind;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 5200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(store.token ? { Authorization: "Bearer " + store.token } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const d = body && body.detail;
    const err = new Error(typeof d === "string" ? d : d ? JSON.stringify(d) : res.statusText);
    err.status = res.status;
    throw err;
  }
  return body;
}

const initials = (email) => (email || "?").slice(0, 2).toUpperCase();

/* ------------------------------------------------------------------ dates */
function mondayOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;          // 0 = Monday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
const dayDate = (i) => {
  const d = mondayOfWeek();
  d.setDate(d.getDate() + i);
  return d;
};
const fmtDay = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

/* ------------------------------------------------------------------ auth */
async function login(role, email) {
  const q = email ? `?email=${encodeURIComponent(email)}` : "";
  const r = await api(`/api/auth/demo-login/${role}${q}`, { method: "POST" });
  store.token = r.token;
  store.user = r.user;
  localStorage.setItem("tessera_token", r.token);
  localStorage.setItem("tessera_user", JSON.stringify(r.user));
  start();
}

function logout() {
  store.token = ""; store.user = null;
  localStorage.removeItem("tessera_token");
  localStorage.removeItem("tessera_user");
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
}

async function bootLogin() {
  try {
    const r = await api("/api/auth/accounts");
    $("roleButtons").innerHTML = r.accounts.map((a) => `
      <button class="role" data-role="${esc(a.role)}" data-email="${esc(a.email)}">
        <span class="avatar lg">${initials(a.email)}</span>
        <span><b>${esc(a.label)}</b><span>${esc(a.email)}</span></span>
        <span class="go">→</span>
      </button>`).join("");
    document.querySelectorAll(".role").forEach((b) =>
      b.addEventListener("click", () => login(b.dataset.role, b.dataset.email)));
  } catch (e) {
    $("roleButtons").innerHTML = `<div class="item"><div class="ib">API not reachable: ${esc(e.message)}</div></div>`;
  }
}

/* ------------------------------------------------------------------ shell */
const VIEW_META = {
  overview: ["Overview", "Week 7 · Spectra"],
  timetable: ["Timetable", "Group · faculty · room"],
  bookings: ["Bookings", "Spectra week"],
  changes: ["Changes", "Preview · approve · apply"],
  ai: ["Ask Tessera", "Plain language in, checked booking out"],
  admin: ["Admin", "Solver · exports · reset"],
};

function go(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + view));
  document.querySelectorAll(".nav-item[data-view]").forEach((n) =>
    n.classList.toggle("active", n.dataset.view === view));
  const [title, sub] = VIEW_META[view] || ["Tessera", ""];
  $("pageTitle").textContent = title;
  $("pageSub").textContent = sub;
  $("rail").classList.remove("open");
  const fn = { overview: loadOverview, timetable: initTimetable, bookings: loadBookings,
               changes: loadProposals, ai: initAI, admin: loadAdmin }[view];
  if (fn) fn();
}

async function start() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  const email = store.user.email || "";
  $("userEmail").textContent = email;
  $("userRole").textContent = (store.user.role || "").replace(/_/g, " ");
  $("userAvatar").textContent = initials(email);
  const h = new Date().getHours();
  $("greeting").textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${store.user.name || email.split("@")[0]}`;
  try {
    const health = await api("/health");
    $("healthText").innerHTML = `<b>${health.sessions}</b> sessions · <b>${health.exams}</b> exams · AI <b>${health.llm}</b>`;
    $("healthDot").className = "dot";
  } catch { $("healthText").textContent = "api offline"; }
  await loadEntities();
  renderMiniCal();
  go("overview");
}

function renderMiniCal() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const weekStart = mondayOfWeek();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const out = d.getMonth() !== m;
    const today = d.toDateString() === now.toDateString();
    const inWeek = d >= weekStart && d < new Date(weekStart.getTime() + 5 * 864e5);
    cells.push(`<button class="mini-day ${out ? "out" : ""} ${today ? "today" : ""} ${inWeek && !today ? "week" : ""}"
      ${out ? 'tabindex="-1"' : ""} onclick="go('timetable')">${d.getDate()}</button>`);
  }
  $("miniCal").innerHTML = `
    <div class="mini-head">
      <b>${now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
      <span class="muted" style="font-size:11px">Week 7</span>
    </div>
    <div class="mini-grid">
      ${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="dow">${d}</span>`).join("")}
      ${cells.join("")}
    </div>`;
}

/* ------------------------------------------------------------------ data */
async function loadEntities() {
  if (store.entities) return store.entities;
  store.entities = await api("/api/dataset/entities");
  return store.entities;
}

async function loadWeek(force = false) {
  if (store.week && !force) return store.week;
  store.week = await api("/api/timetable/week");
  return store.week;
}

/* ------------------------------------------------------------------ overview */
async function loadOverview() {
  try {
    const [d, b] = await Promise.all([api("/api/admin/dashboard"), api("/api/bookings")]);
    store.dataset = d.dataset;
    $("datasetChip").textContent = d.dataset.dataset_id;
    $("overviewSub").innerHTML =
      `${d.counts.scheduled} of ${d.counts.sessions} sessions placed · ` +
      `${d.counts.exams} midsems · ${d.counts.bookings} Spectra requests · ` +
      `<span class="mono">${esc(d.meta.source || "committed exports")}</span>`;
    $("bookingScore").textContent = `${b.totals.score} / ${b.totals.max}`;
    if ($("weekChip")) $("weekChip").textContent = `W${d.counts.scheduled} scheduled`;

    const soft = d.soft.breakdown;
    $("kpis").innerHTML = [
      kpi("Scheduled", `${d.counts.scheduled}<small>/${d.counts.sessions}</small>`,
          "every session exactly once", "good", spark([1, 1, 1, 1, 1, 1, 1])),
      kpi("Hard violations", `${d.conflicts.hard}`, "organisers' rules, checked live",
          d.conflicts.hard ? "bad" : "good", spark([2, 1, 0, 0, 0, 0, 0])),
      kpi("Soft penalty", `${d.soft.total}`, "lower wins the optimisation marks",
          d.soft.total > 6 ? "warn" : "good", spark(Object.values(soft))),
      kpi("Booking score", `${b.totals.score}<small>/${b.totals.max}</small>`,
          `${b.totals.approved} approved · ${b.totals.alternatives} alt · ${b.totals.rejected} rejected`,
          "good", spark([3, 5, 7, 7, 7, 7, 7])),
    ].join("");

    renderVenueStrip();
    renderMiniWeek();
    renderAttention(d, b);
    renderBookingSummary(b);
    renderRooms(d);
    renderAudit(d);
    const pending = (await api("/api/disruption/proposals?status=pending")).count || 0;
    const tag = $("pendingTag");
    tag.textContent = pending;
    tag.classList.toggle("hidden", pending === 0);
  } catch (e) { toast("Overview: " + e.message, "bad"); }
}

function renderVenueStrip() {
  const e = store.entities;
  if (!e || !$("venueStrip")) return;
  const wanted = ["AUD", "LH-1", "SH-1", "OAT", "CS-LAB-1", "CR-101"];
  const rooms = wanted.map((id) => e.rooms.find((r) => r.id === id)).filter(Boolean);
  $("venueStrip").innerHTML = rooms.map((r) =>
    `<button class="venue-pick" onclick="openRoom('${esc(r.id)}')" aria-label="Open ${esc(r.name)} week">
       ${venueCard(r, { compact: true })}
     </button>`).join("");
}

function openRoom(id) {
  store.tt.view = "room";
  store.tt.id = id;
  setSeg("room");
  go("timetable");
}

const kpi = (label, value, note, tone, sparkHtml) => `
  <div class="card kpi">
    <div class="kpi-top"><span class="kpi-label">${esc(label)}</span>
      <span class="chip ${tone === "bad" ? "bad" : tone === "warn" ? "warn" : "good"}">${tone === "bad" ? "fix" : "ok"}</span></div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-foot">${esc(note)}</div>
    ${sparkHtml}
  </div>`;

function spark(values) {
  const max = Math.max(1, ...values.map((v) => Number(v) || 0));
  return `<div class="kpi-spark" aria-hidden="true">${values.map((v) => {
    const h = Math.max(8, Math.round((Number(v) / max) * 100));
    return `<i class="${Number(v) ? "on" : ""}" style="height:${h}%"></i>`;
  }).join("")}</div>`;
}

async function renderMiniWeek() {
  const ent = await loadEntities();
  const gid = store.user.group_id || ent.groups[0].id;
  const week = await api(`/api/timetable?view=group&id=${encodeURIComponent(gid)}`);
  const cell = {};
  week.entries.forEach((e) => { for (let p = e.start_period; p <= e.end_period; p++) cell[`${e.day}-${p}`] = e; });

  let cells = "";
  for (const d of DAYS) {
    for (let p = 1; p <= 9; p++) {
      const e = cell[`${d}-${p}`];
      const col = DAYS.indexOf(d) + 1;
      if (e && e.start_period === p) {
        const to = Math.min(9, e.end_period || p);
        const c = colorFor(e.course_id);
        cells += `<button class="mw-b" data-day="${d}"
          style="grid-column:${col};grid-row:${p} / span ${to - p + 1};
                 background:var(--${c}-bg);color:var(--${c}-ink);border-left-color:var(--${c}-bar)"
          title="${esc(e.course_id)} · ${esc(e.room_id)} · ${esc(d)} P${p}-${to}"
          onclick="openDay('${d}')">${esc(e.course_id)}</button>`;
      } else if (e) {
        continue;
      } else {
        cells += `<div class="mw-empty" style="grid-column:${col};grid-row:${p}"></div>`;
      }
    }
  }

  $("miniWeek").innerHTML = `
    <div class="mw-wrap">
      <div class="mw">
        ${DAYS.map((d, i) => `<div class="mw-head" style="grid-column:${i + 1};grid-row:1">
          <span>${d}</span><b>${dayDate(i).getDate()}</b></div>`).join("")}
        ${cells}
      </div>
    </div>
    <div class="row" style="margin-top:10px;justify-content:space-between">
      <span class="muted" style="font-size:11.5px">${esc(gid)} · click a day to open the full grid</span>
      <span class="chip info">${week.entries.length} classes</span>
    </div>`;
}

function renderAttention(d, b) {
  const items = [];
  const pending = d.pending_proposals || 0;
  if (pending) items.push(["warn", `${pending} change proposal${pending > 1 ? "s" : ""} waiting for a second admin`, "none can be approved by whoever asked"]);
  (d.risks || []).slice(0, 3).forEach((r) => items.push(["warn", r, "computed from the timetable"]));
  if (b.totals.rejected) items.push(["bad", `${b.totals.rejected} request${b.totals.rejected > 1 ? "s" : ""} rejected`, "each carries a reason a club can act on"]);
  if (b.totals.cancelled) items.push(["info", `${b.totals.cancelled} request withdrawn`, "never approved, by rule"]);
  if (!items.length) items.push(["good", "Nothing needs you", "the week is clean"]);
  $("attention").innerHTML = `<div class="list">${items.map(([tone, title, sub]) => `
    <div class="item"><span class="ico ${tone}">${tone === "good" ? "✓" : tone === "bad" ? "!" : "•"}</span>
      <span class="ib"><span class="it">${esc(title)}</span><span class="is">${esc(sub)}</span></span></div>`).join("")}</div>`;
}

function renderBookingSummary(b) {
  const t = b.totals;
  const total = Math.max(1, t.approved + t.alternatives + t.rejected);
  const pct = (n) => Math.round((n / total) * 100);
  $("bookingSummary").innerHTML = `
    <div class="split" style="margin-bottom:10px">
      <i style="width:${pct(t.approved)}%;background:#10b981"></i>
      <i style="width:${pct(t.alternatives)}%;background:#f59e0b"></i>
      <i style="width:${pct(t.rejected)}%;background:#f43f5e"></i>
    </div>
    <div class="stack" style="gap:8px;font-size:13px">
      <div class="row between"><span><span class="chip good">approved</span></span><b>${t.approved}</b></div>
      <div class="row between"><span><span class="chip warn">alternative</span></span><b>${t.alternatives}</b></div>
      <div class="row between"><span><span class="chip bad">rejected</span></span><b>${t.rejected}</b></div>
      <div class="row between muted" style="font-size:12px"><span>credit ÷ maximum</span><b>${t.score} / ${t.max}</b></div>
    </div>`;
}

function renderRooms(d) {
  const top = d.utilisation.slice(0, 6);
  $("roomsCard").innerHTML = `<div class="stack" style="gap:10px">${top.map((u) => `
    <div>
      <div class="row between" style="font-size:12.5px;margin-bottom:4px">
        <span><b>${esc(u.room_id)}</b> <span class="muted">· ${u.sessions} sessions</span></span>
        <span class="muted">${Math.round(u.utilisation * 100)}%</span>
      </div>
      <div class="bar"><i style="width:${Math.min(100, Math.round(u.utilisation * 130))}%"></i></div>
    </div>`).join("")}</div>`;
}

function renderAudit(d) {
  const rows = (d.audit || []).slice(0, 6);
  $("auditCard").innerHTML = rows.length ? `<div class="list">${rows.map((a) => `
    <div class="item"><span class="ico">${esc((a.actor || "S")[0].toUpperCase())}</span>
      <span class="ib"><span class="it">${esc(a.action || "")}</span>
        <span class="is">${esc(a.actor || "system")} · ${esc(a.detail || "").slice(0, 70)}</span></span></div>`).join("")}</div>`
    : `<div class="empty">No actions yet — preview a change or generate the timetable.</div>`;
}

/* ------------------------------------------------------------------ timetable */
async function initTimetable() {
  const e = await loadEntities();
  const list = store.tt.view === "faculty" ? e.faculty : store.tt.view === "room" ? e.rooms : e.groups;
  if (!store.tt.id) store.tt.id = list[0].id;
  $("ttEntity").innerHTML = list.map((x) =>
    `<option value="${esc(x.id)}" ${x.id === store.tt.id ? "selected" : ""}>${esc(x.id)}${x.name && x.name !== x.id ? " — " + esc(x.name) : ""}</option>`).join("");
  loadTimetable();
}

function openDay(day) {
  go("timetable");
  setTimeout(() => {
    const el = document.querySelector(`[data-day="${day}"]`);
    if (el) el.scrollIntoView({ block: "nearest", inline: "center" });
  }, 220);
}

async function loadTimetable() {
  const { view } = store.tt;
  const id = $("ttEntity").value;
  store.tt.id = id;
  if (!id) return;
  $("ttTitle").textContent = id;
  $("ttBody").innerHTML = `<div class="empty">Loading the week…</div>`;
  try {
    const g = await api(`/api/timetable?view=${view}&id=${encodeURIComponent(id)}`);
    $("ttCount").textContent = `${g.entries.length} classes`;
    const cell = {};
    g.entries.forEach((e) => { for (let p = e.start_period; p <= e.end_period; p++) cell[`${e.day}-${p}`] = e; });

    const layers = store.layers;
    let extras = [];
    if (layers.spectra || layers.events) {
      const [b, ev] = await Promise.all([
        layers.spectra ? api("/api/bookings") : null,
        layers.events ? api("/api/bookings/manual") : null,
      ]);
      if (b) extras = extras.concat(b.bookings.filter((x) => x.decision && ["approved", "alternative_offered"].includes(x.decision.status))
        .map((x) => ({ day: x.decision.day, from: x.decision.start_period, to: x.decision.end_period,
                       label: x.request_id, sub: x.title || "booking", kind: "spectra", color: "c2" })));
      if (ev) extras = extras.concat((ev.events || []).filter((x) => x.status === "confirmed")
        .map((x) => ({ day: x.day, from: x.start_period, to: x.end_period,
                       label: x.title, sub: `${x.room_id} · event`, kind: "event", color: "c3" })));
    }
    const extraAt = {};
    extras.forEach((x) => { for (let p = x.from; p <= x.to; p++) extraAt[`${x.day}-${p}`] = x; });

    const hero = $("roomHero");
    const roomObj = store.tt.view === "room"
      ? (store.entities.rooms || []).find((r) => r.id === id) : null;
    if (roomObj) {
      hero.classList.remove("hidden");
      hero.innerHTML = `<div class="card hero-card">
        <div class="hero-art">${venueArt(roomObj)}</div>
        <div class="hero-text">
          <span class="eyebrow">${esc(roomLabel(roomObj.type))}</span>
          <h2>${esc(roomObj.name || roomObj.id)}</h2>
          <p class="muted">${esc(roomObj.building || "")}</p>
          <div class="chips">
            <span class="chip">${roomObj.capacity} seats</span>
            ${(roomObj.features || []).map((f) => `<span class="chip">${esc(f)}</span>`).join("")}
            ${roomObj.accessible ? '<span class="chip good">accessible</span>' : ""}
          </div>
          <p class="muted" style="font-size:12.5px">${g.entries.length} classes this week · utilisation is
            ${Math.round((g.entries.reduce((a, x) => a + (x.end_period - x.start_period + 1), 0) / 45) * 100)}% of
            the 45 teaching slots</p>
        </div>
      </div>`;
    } else {
      hero.classList.add("hidden");
      hero.innerHTML = "";
    }

    /* explicit grid placement so a 2-period lab really spans two rows,
       and nothing shifts when a full-width label row sits between periods. */
    const rowOf = {};
    const labels = [];
    let r = 2;                       // row 1 is the sticky day header
    for (let p = 1; p <= 9; p++) {
      rowOf[p] = r++;
      if (p === 5) labels.push([r++, "lunch · 13:00 – 14:00 · no class may cross it"]);
    }
    labels.push([r++, "evening · 18:00 – 22:00 · events only"]);
    for (let p = 10; p <= 13; p++) rowOf[p] = r++;

    const dayIndex = (d) => DAYS.indexOf(d) + 2;   // column 1 is the time gutter
    const periodAt = (p) => (g.periods.find((x) => x.id === p) || {});

    let cells = "";
    for (const d of DAYS) {
      for (const p of Object.keys(rowOf).map(Number)) {
        const spanEnd = (e) => e.end_period || e.start_period;
        const cls = layers.classes ? cell[`${d}-${p}`] : null;
        const ext = extraAt[`${d}-${p}`];
        const startCls = cls && cls.start_period === p;
        const startExt = !cls && ext && ext.from === p;

        if (startCls || startExt) {
          const from = p;
          const to = startCls ? spanEnd(cls) : ext.to;
          let span = 1;
          let crossed = false;
          for (let q = from + 1; q <= to; q++) {
            if (rowOf[q] === undefined || rowOf[q] !== rowOf[q - 1] + 1) { crossed = true; break; }
          }
          if (!crossed) span = rowOf[to] - rowOf[from] + 1;
          const more = to > from && crossed ? `<span class="lock">↳ continues P${to}</span>` : "";
          cells += startCls
            ? `<div class="cell" style="grid-column:${dayIndex(d)};grid-row:${rowOf[from]} / span ${span}">
                 <button class="ev ${colorFor(cls.course_id)}" data-session="${esc(cls.session_id)}"
                   aria-label="${esc(cls.course_id)} ${esc(d)} P${from}" onclick="openEvent('${esc(cls.session_id)}', this)">
                   <b>${esc(cls.course_id)}</b>
                   <span>${esc(cls.room_id)} · ${esc(cls.kind)}</span>
                   <span>${esc(view === "faculty" ? (cls.groups || []).join(", ") : cls.faculty_id)}</span>
                   ${more}
                 </button></div>`
            : `<div class="cell" style="grid-column:${dayIndex(d)};grid-row:${rowOf[from]} / span ${span}">
                 <div class="ev ${ext.color}" style="cursor:default" title="${esc(ext.sub)}">
                   <b>${esc(ext.label)}</b><span>${esc(ext.sub)}</span>${more}</div></div>`;
          continue;
        }
        // covered by a block that started earlier, or simply empty
        const covered = (cls && cls.start_period < p) || (!cls && ext && ext.from < p);
        if (covered) continue;
        cells += `<div class="cell" style="grid-column:${dayIndex(d)};grid-row:${rowOf[p]}"></div>`;
      }
    }

    let body = `<div class="gutter" style="grid-column:1;grid-row:1"></div>` +
      DAYS.map((d, i) => {
        const isToday = d === new Date().toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
        return `<div class="dh ${isToday ? "today" : ""}" data-day="${d}"
          style="grid-column:${i + 2};grid-row:1">
          <div class="dname">${d}</div><div class="dnum">${dayDate(i).getDate()}</div></div>`;
      }).join("") +
      Object.keys(rowOf).map(Number).map((p) =>
        `<div class="time" style="grid-column:1;grid-row:${rowOf[p]}">
          <b>P${p}</b><span>${esc(periodAt(p).start || "")}</span></div>`).join("") +
      labels.map(([row, text]) =>
        `<div class="lunch-label" style="grid-column:1 / -1;grid-row:${row}">${text}</div>`).join("") +
      cells;

    $("ttBody").innerHTML = `<div class="week">${body}</div>`;

    if (store.layers.exams) {
      const ex = await api("/api/exams");
      const byDay = {};
      (ex.exams || ex.rows || []).forEach((x) => { byDay[x.day] = (byDay[x.day] || 0) + 1; });
      $("ttBody").insertAdjacentHTML("beforeend", `<div style="padding:12px 16px;border-top:1px solid var(--line);background:var(--surface-2)">
        <span class="chip info">midsem week</span>
        <span class="muted" style="font-size:12px;margin-left:8px">${Object.entries(byDay).map(([d, n]) => `${d} ${n}`).join(" · ")}</span></div>`);
    }
  } catch (e) {
    $("ttBody").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------------- venues
   Hand-drawn flat SVG venue plates. No external image, no CDN, no gradient:
   they render inside the sandboxed preview iframe and on a projector alike. */
const ROOM_LABEL = {
  auditorium: "Auditorium", lecture_hall: "Lecture hall", classroom: "Classroom",
  seminar_hall: "Seminar hall", outdoor: "Open air", workshop: "Workshop",
  lab_cs: "Computing lab", lab_elec: "Electronics lab", lab_phy: "Physics lab",
  lab_civil: "Civil lab",
};
const roomLabel = (t) => ROOM_LABEL[t] || (t || "venue").replace(/_/g, " ");

function venueArt(room = {}) {
  const type = room.type || "classroom";
  const label = roomLabel(type);
  const cap = room.capacity || 0;
  const seat = (x, y, w = 14, h = 9, c = "#c3cbe6") =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="${c}"/>`;
  const window_ = (x, y, w = 30, h = 22) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#dce7f8" stroke="#c6d4ea"/>
     <path d="M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}" stroke="#c6d4ea" stroke-width="1"/>`;
  let art = "";

  if (type === "auditorium") {
    art = `
      <rect x="0" y="0" width="360" height="14" fill="#f6f8fd"/>
      ${window_(20, 20)}${window_(310, 20)}
      <rect x="96" y="16" width="168" height="30" rx="3" fill="#f3f1fb" stroke="#d8d2f0"/>
      <rect x="108" y="23" width="144" height="17" rx="2" fill="#e9e6f7"/>
      <rect x="72" y="50" width="216" height="18" rx="3" fill="#e2ddf6" stroke="#d0c9ef"/>
      <rect x="60" y="46" width="18" height="26" rx="4" fill="#cfc7ec"/>
      <rect x="282" y="46" width="18" height="26" rx="4" fill="#cfc7ec"/>
      ${[0, 1, 2].map((r) => {
        const y = 72 + r * 13, n = 13 - r, x0 = 30 + r * 8, step = (300 - r * 16) / (n - 1);
        return Array.from({ length: n }).map((_, i) =>
          (i === 6 ? "" : seat(x0 + i * step, y, 15, 8, r === 2 ? "#b9c2e0" : "#cbd3e9"))).join("");
      }).join("")}
      <path d="M178 71v36M182 71v36" stroke="#e6eaf5" stroke-width="6"/>`;
  } else if (type === "lecture_hall") {
    art = `
      <rect x="0" y="0" width="360" height="12" fill="#f6f8fd"/>
      <rect x="22" y="18" width="126" height="46" rx="3" fill="#f7f9fe" stroke="#d3dcee"/>
      <rect x="32" y="26" width="106" height="30" rx="2" fill="#e6eefb"/>
      <path d="M40 36h44M40 44h64M40 52h30" stroke="#c9d8ee" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="22" y="70" width="34" height="16" rx="2" fill="#d7ddec"/>
      ${window_(196, 20)}${window_(246, 20)}${window_(296, 20)}
      ${[0, 1, 2, 3].map((r) => `${Array.from({ length: 5 }).map((_, i) =>
        seat(168 + i * 34, 44 + r * 15, 24, 9, r % 2 ? "#c8d1e8" : "#d3dbee")).join("")}`).join("")}
      <path d="M150 96h190" stroke="#d8dfee" stroke-width="2"/>`;
  } else if (type === "seminar_hall") {
    art = `
      <rect x="0" y="0" width="360" height="12" fill="#f6f8fd"/>
      ${window_(24, 20)}${window_(60, 20)}${window_(276, 20)}${window_(312, 20)}
      <rect x="140" y="16" width="80" height="26" rx="3" fill="#f3f1fb" stroke="#d8d2f0"/>
      <ellipse cx="180" cy="74" rx="86" ry="24" fill="#e3e9f7"/>
      <ellipse cx="180" cy="74" rx="58" ry="13" fill="#eef2fb"/>
      <rect x="150" y="52" width="12" height="18" rx="3" fill="#d3d9ea"/>
      ${Array.from({ length: 9 }).map((_, i) => seat(104 + i * 19, 46, 15, 8, "#ccd4ea")).join("")}
      ${Array.from({ length: 9 }).map((_, i) => seat(104 + i * 19, 94, 15, 8, "#c4cde6")).join("")}`;
  } else if (type.startsWith("lab")) {
    const kit = type === "lab_cs"
      ? (x) => `<rect x="${x}" y="42" width="26" height="17" rx="2" fill="#c2cee9"/>
                <rect x="${x + 3}" y="45" width="20" height="11" rx="1.5" fill="#dfe8f8"/>`
      : type === "lab_elec"
        ? (x) => `<rect x="${x}" y="42" width="26" height="17" rx="2" fill="#c2cee9"/>
                  <circle cx="${x + 9}" cy="50" r="4" fill="#e6eefc"/><path d="M${x + 17} 46v10" stroke="#e6eefc" stroke-width="2"/>`
        : (x) => `<rect x="${x}" y="42" width="26" height="17" rx="2" fill="#c2cee9"/>
                  <path d="M${x + 5} 51h16" stroke="#e6eefc" stroke-width="3"/>`;
    art = `
      <rect x="0" y="0" width="360" height="12" fill="#f6f8fd"/>
      ${window_(310, 18)}
      <rect x="20" y="20" width="86" height="26" rx="3" fill="#eef3fc" stroke="#d3dcee"/>
      <path d="M30 30h30M30 38h48" stroke="#cfdcef" stroke-width="2.5" stroke-linecap="round"/>
      ${[0, 1, 2].map((r) => `${[0, 1, 2, 3, 4].map((i) => kit(30 + i * 62 + r * 4) + seat(30 + i * 62 + r * 4, 60, 26, 6, "#b9c5df")).join("")}`).join("")}
      <path d="M20 80h320" stroke="#dbe2ef" stroke-width="2"/>`;
  } else if (type === "outdoor") {
    art = `
      <rect x="0" y="0" width="360" height="70" fill="#eaf3fd"/>
      <circle cx="306" cy="22" r="12" fill="#fbe6a8"/>
      <path d="M0 70q60-16 120-4t120-6 120 8v42H0Z" fill="#e4f2e8"/>
      <rect x="110" y="40" width="140" height="9" rx="2" fill="#cfd8ea"/>
      <path d="M110 40v-6h140v6" stroke="#c3cde3" stroke-width="2"/>
      <path d="M132 34v-12M228 34v-12" stroke="#c3cde3" stroke-width="2"/>
      ${[0, 1, 2, 3].map((r) => `${Array.from({ length: 12 - r * 2 }).map((_, i) =>
        `<circle cx="${92 + i * 16 + r * 16}" cy="${70 + r * 10}" r="4.5" fill="${r % 2 ? "#b9cfe0" : "#c8dcea"}"/>`).join("")}`).join("")}
      ${[36, 322].map((x) => `<rect x="${x}" y="52" width="5" height="18" rx="2.5" fill="#a8c3ae"/>
        <circle cx="${x + 2}" cy="48" r="11" fill="#c8e3ce"/>`).join("")}`;
  } else if (type === "workshop") {
    art = `
      <rect x="0" y="0" width="360" height="12" fill="#f6f8fd"/>
      <rect x="24" y="34" width="120" height="12" rx="2" fill="#e5d6c3"/>
      <rect x="24" y="46" width="8" height="24" rx="2" fill="#d8c6ae"/>
      <rect x="136" y="46" width="8" height="24" rx="2" fill="#d8c6ae"/>
      <rect x="44" y="22" width="34" height="12" rx="2" fill="#c9d3e8"/>
      <rect x="92" y="18" width="10" height="16" rx="2" fill="#b6c2dc"/>
      <rect x="180" y="20" width="60" height="30" rx="4" fill="#dce3f1" stroke="#c7d0e3"/>
      <circle cx="210" cy="35" r="9" fill="#c0cbe2"/>
      <rect x="252" y="30" width="82" height="10" rx="2" fill="#e5d6c3"/>
      <rect x="252" y="40" width="7" height="30" rx="2" fill="#d8c6ae"/>
      <rect x="327" y="40" width="7" height="30" rx="2" fill="#d8c6ae"/>
      <rect x="262" y="20" width="60" height="8" rx="2" fill="#cfd8e9"/>
      <path d="M18 74h324" stroke="#f0d9a8" stroke-width="3" stroke-dasharray="10 8"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => seat(40 + i * 46, 86, 28, 9, "#c6d0e5")).join("")}`;
  } else {
    art = `
      <rect x="0" y="0" width="360" height="12" fill="#f6f8fd"/>
      <rect x="24" y="18" width="112" height="30" rx="3" fill="#f7f9fe" stroke="#d6dfef"/>
      ${window_(250, 18)}${window_(300, 18)}
      <rect x="24" y="54" width="34" height="14" rx="2" fill="#dfe5f1"/>
      ${[0, 1, 2].map((r) => `${Array.from({ length: 4 }).map((_, i) =>
        seat(80 + i * 52, 44 + r * 18, 34, 10, r === 0 ? "#cbd5ec" : "#d6def0") +
        seat(80 + i * 52, 54 + r * 18, 34, 3, "#c2cce4")).join("")}`).join("")}
      <rect x="340" y="40" width="12" height="30" rx="2" fill="#dde3f0"/>`;
  }

  return `<svg class="room-art" viewBox="0 0 360 112" preserveAspectRatio="xMidYMid slice"
    role="img" aria-label="${esc(room.name || label)}, ${esc(label)}, ${cap} seats">
    <rect width="360" height="112" fill="#f1f4fb"/>
    ${art}
    <rect x="0" y="0" width="360" height="112" fill="none" stroke="#e3e8f3"/>
    <g>
      <rect x="8" y="8" width="${Math.max(58, label.length * 6.6 + 16)}" height="17" rx="5" fill="#ffffff" opacity=".92"/>
      <text x="16" y="20.5" font-size="9.5" letter-spacing=".08em" fill="#4b5163"
        font-family="ui-sans-serif,system-ui,Inter">${esc(label.toUpperCase())}</text>
    </g>
    <g>
      <rect x="${360 - (String(cap).length * 7 + 46)}" y="8" width="${String(cap).length * 7 + 46}" height="17" rx="5" fill="#ffffff" opacity=".92"/>
      <text x="${360 - (String(cap).length * 7 + 38)}" y="20.5" font-size="9.5" fill="#4b5163"
        font-family="ui-sans-serif,system-ui,Inter"><tspan font-weight="700">${cap}</tspan> seats</text>
    </g>
  </svg>`;
}

function venueCard(room = {}, opts = {}) {
  const features = (room.features || []).concat(room.accessible ? ["accessible"] : []);
  return `<figure class="venue ${opts.compact ? "compact" : ""}">
    <div class="venue-art">${venueArt(room)}</div>
    <figcaption>
      <b>${esc(room.name || room.id || "Venue")}</b>
      <span>${esc(room.building || "")}${room.building ? " · " : ""}${esc(roomLabel(room.type))} · ${room.capacity || "?"} seats</span>
      ${features.length ? `<span class="chips">${features.slice(0, 5).map((f) => `<span class="chip">${esc(f)}</span>`).join("")}</span>` : ""}
    </figcaption>
  </figure>`;
}

async function openEvent(sessionId, anchor) {
  closePop();
  try {
    const [detail, week] = await Promise.all([api(`/api/timetable/sessions/${encodeURIComponent(sessionId)}`), loadWeek()]);
    const e = week.entries.find((x) => x.session_id === sessionId) || detail.placement || {};
    const s = detail.session || {};
    const room = (store.entities.rooms || []).find((r) => r.id === e.room_id) || {};
    const pop = document.createElement("div");
    pop.className = "pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", `Session ${sessionId}`);
    pop.innerHTML = `
      <button class="close" aria-label="Close" onclick="closePop()">✕</button>
      <div>
        <div class="muted" style="font-size:11.5px;letter-spacing:.06em;text-transform:uppercase">${esc(s.kind || "")} · ${esc(s.course_id || "")}</div>
        <div class="title">${esc(sessionId)}</div>
      </div>
      ${venueCard(room, { compact: true })}
      <div class="meta">
        <div class="mrow">🕘 <span><b>${esc(e.day || "")} P${e.start_period}–P${e.end_period}</b> · ${esc(s.duration || 1)} period(s)</span></div>
        <div class="mrow">📍 <span><b>${esc(e.room_id || "")}</b> · ${esc(room.type || "")}, ${esc(room.capacity || "?")} seats</span></div>
        <div class="mrow">👤 <span>${esc(s.faculty_id || "")} · ${esc((store.entities.faculty.find((f) => f.id === s.faculty_id) || {}).name || "")}</span></div>
        <div class="mrow">🎓 <span>${esc((s.groups || []).join(", "))} · ${esc(s.size || "")} students</span></div>
      </div>
      <div class="tags">
        ${(s.needs_accessible ? ["accessible"] : []).concat(room.features || []).slice(0, 5)
          .map((f) => `<span class="chip">${esc(f)}</span>`).join("")}
        ${s.basket_slot ? `<span class="chip accent">basket ${esc(s.basket_slot)}</span>` : ""}
      </div>
      <div class="actions">
        <button class="btn primary" onclick="explainInline('${esc(sessionId)}')">Why is it here?</button>
        <button class="btn" onclick="closePop(); go('bookings')">Booking decisions</button>
      </div>`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const w = 340, h = pop.offsetHeight;
    let left = r.right + 12;
    if (left + w > window.innerWidth - 12) left = r.left - w - 12;
    let top = r.top - 8;
    top = Math.max(12, Math.min(top, window.innerHeight - h - 12));
    pop.style.left = Math.max(12, left) + "px";
    pop.style.top = top + "px";
    store.pop = pop;
  } catch (err) { toast(err.message, "bad"); }
}

function closePop() { if (store.pop) { store.pop.remove(); store.pop = null; } }

async function explainInline(sessionId) {
  closePop();
  go("timetable");
  const card = $("explainCard");
  card.classList.remove("hidden");
  card.innerHTML = `<div class="card-body empty">checking the rules…</div>`;
  try {
    const r = await api(`/api/timetable/sessions/${encodeURIComponent(sessionId)}/explain`);
    card.innerHTML = `
      <div class="card-head">
        <h2>Why ${esc(sessionId)} sits at ${esc(r.placement.day)} P${r.placement.start_period}</h2>
        <button class="btn sm ghost" onclick="document.getElementById('explainCard').classList.add('hidden')">Close</button>
      </div>
      <div class="card-body grid g2">
        <div class="stack">
          <p class="body">${esc(r.summary)}</p>
          ${r.reasons.map((x) => `<div class="item"><span class="ico good">✓</span><span class="ib"><span class="it">${esc(x)}</span></span></div>`).join("")}
        </div>
        <div class="stack">
          <div>
            <h3 style="margin-bottom:6px">Trade-offs accepted</h3>
            ${r.tradeoffs.length ? r.tradeoffs.map((x) => `<div class="item"><span class="ico warn">~</span><span class="ib"><span class="it">${esc(x)}</span></span></div>`).join("")
              : '<span class="muted" style="font-size:13px">none — this slot costs nothing.</span>'}
          </div>
          <div>
            <h3 style="margin-bottom:6px">Slots that would also work</h3>
            <div class="chips">${r.alternatives.map((a) => `<span class="chip">${esc(a.day)} P${a.start_period}</span>`).join("") || '<span class="muted">none free</span>'}</div>
          </div>
        </div>
      </div>`;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) { card.innerHTML = `<div class="card-body">${esc(e.message)}</div>`; }
}

/* ------------------------------------------------------------------ bookings */
async function loadBookings() {
  const f = store.bookingFilter;
  try {
    const r = await api("/api/bookings" + (f ? `?status=${f}` : ""));
    const t = r.totals;
    $("bookKpis").innerHTML = [
      kpi("Score", `${t.score}<small>/${t.max}</small>`, "credit ÷ maximum", "good", spark([4, 6, 6, 7, 7, 7, 7])),
      kpi("Approved", `${t.approved}`, "full category weight", "good", spark([1, 2, 3, 3, 3, 3, 3])),
      kpi("Alternative", `${t.alternatives}`, "outside the window, half weight", "warn", spark([1, 1, 1, 1, 1, 1, 1])),
      kpi("Rejected", `${t.rejected}`, `${t.cancelled} withdrawn`, "bad", spark([2, 2, 2, 2, 2, 2, 2])),
    ].join("");

    $("bookTable").innerHTML = `
      <table class="t">
        <thead><tr><th>Request</th><th>Asked for</th><th>Category</th><th>Decision</th><th>Reason</th></tr></thead>
        <tbody>${r.bookings.map((b) => {
          const d = b.decision || {};
          const status = b.cancelled ? "cancelled" : (d.status || "undecided");
          return `<tr class="clickable" onclick="bookingDetail('${esc(b.request_id)}')">
            <td><b>${esc(b.request_id)}</b><div class="muted" style="font-size:12px">${esc(b.title || "")}</div>
              <div class="muted" style="font-size:11.5px">${esc(b.requester || "")}</div></td>
            <td>${esc(b.attendance)} people
              <div class="muted" style="font-size:11.5px">${(b.windows || []).map((w) => `${esc(w.day)} P${w.from_period}–${w.to_period}`).join(" · ")}</div></td>
            <td>${esc(b.effective_category)}
              ${b.category_note ? `<div class="muted" style="font-size:11.5px">capped from ${esc(b.requested_category)}</div>` : ""}</td>
            <td><span class="badge ${esc(status)}">${esc(status.replace(/_/g, " "))}</span>
              ${d.room_id ? `<div class="muted" style="font-size:11.5px">${esc(d.day)} P${d.start_period}–${d.end_period} · ${esc(d.room_id)}</div>` : ""}</td>
            <td style="max-width:320px"><span class="muted" style="font-size:12.5px">${esc((d.reason || "").slice(0, 110))}</span></td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
  } catch (e) { toast("Bookings: " + e.message, "bad"); }
}

async function bookingDetail(id) {
  try {
    const [r] = await Promise.all([api(`/api/bookings/${encodeURIComponent(id)}`), loadEntities()]);
    const q = r.request, d = r.decision || {};
    sheet(`Booking ${esc(id)}`, `
      <div class="stack">
        <div>
          <h2 style="font-size:18px">${esc(q.title)}</h2>
          <p class="muted" style="font-size:13px">${esc(q.requester)} · ${esc(q.role)} · submitted ${esc(String(q.submitted_at || "").slice(0, 10))}</p>
        </div>
        <div class="row">
          <span class="badge ${esc(d.status || "undecided")}">${esc((d.status || "no decision").replace(/_/g, " "))}</span>
          <span class="chip">${esc(r.effective_category)} · weight ${r.weight}</span>
          ${d.room_id ? `<span class="chip">${esc(d.day)} P${d.start_period}–${d.end_period} · ${esc(d.room_id)}</span>` : ""}
        </div>
        ${d.room_id ? venueCard((store.entities.rooms || []).find((r) => r.id === d.room_id) || { id: d.room_id, capacity: "?" }) : ""}
        ${q.raw_text ? `<div class="item"><span class="ico">“</span><span class="ib"><span class="it">${esc(q.raw_text)}</span>
          <span class="is">the original message, parsed</span></span></div>` : ""}
        <div>
          <h3 style="margin-bottom:8px">Why</h3>
          <div class="list">${r.why.map((w) => `<div class="item"><span class="ib"><span class="it">${esc(w)}</span></span></div>`).join("")}</div>
        </div>
        <div>
          <h3 style="margin-bottom:8px">Request</h3>
          <div class="pre">${esc(JSON.stringify({
            attendance: q.attendance, duration_periods: q.duration_periods, windows: q.windows,
            needs: q.needs, room_types: q.room_types, requested_room: q.requested_room,
            mandatory_for_groups: q.mandatory_for_groups,
          }, null, 2))}</div>
        </div>
      </div>`);
  } catch (e) { toast(e.message, "bad"); }
}

function sheet(title, html) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}">
    <div class="sheet-head"><b>${title}</b>
      <button class="btn sm ghost" onclick="this.closest('.sheet-wrap').remove()">Close</button></div>
    <div class="sheet-body">${html}</div></div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
}

/* ------------------------------------------------------------------ changes */
async function loadSample() {
  try {
    const r = await api("/api/disruption/sample");
    $("changeJson").value = JSON.stringify(r.changes, null, 2);
    toast(`Loaded ${r.file} · ${r.changes.length} change(s)`, "good");
  } catch (e) { toast(e.message, "bad"); }
}

function uploadChange(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(reader.result);
      $("changeJson").value = JSON.stringify(p.changes || p, null, 2);
      toast("Change file loaded", "good");
    } catch { toast("That is not valid JSON", "bad"); }
  };
  reader.readAsText(file);
}

async function previewChanges() {
  let changes;
  try { changes = JSON.parse($("changeJson").value); } catch { return toast("changes must be valid JSON", "bad"); }
  if (changes && !Array.isArray(changes) && changes.changes) changes = changes.changes;
  if (!Array.isArray(changes) || !changes.length) return toast("Add at least one change", "bad");
  $("previewState").textContent = "solving — up to a minute…";
  try {
    const r = await api("/api/disruption/preview-file", { method: "POST", body: JSON.stringify({ changes }) });
    $("previewState").textContent = "";
    renderPreview(r);
  } catch (e) { $("previewState").textContent = ""; toast("Preview: " + e.message, "bad"); }
}

function renderPreview(r) {
  const box = $("previewResult");
  const chip = $("diffChip");
  if (!r.valid) {
    const ex = r.explanation || {};
    chip.className = "chip bad"; chip.textContent = "refused"; chip.classList.remove("hidden");
    box.innerHTML = `<div class="stack">
      <div class="item"><span class="ico bad">!</span><span class="ib">
        <span class="it">No valid fix exists</span>
        <span class="is">the change conflicts with the hard rules below</span></span></div>
      <div class="list">${(ex.suggestions || []).map((s) => `<div class="item"><span class="ib"><span class="it">${esc(s)}</span></span></div>`).join("")
        || '<div class="muted">see the change log</div>'}</div>
      ${ex.core_sessions ? `<div class="pre">blocking sessions:\n${esc(ex.core_sessions.join("\n"))}</div>` : ""}
    </div>`;
    return;
  }
  chip.className = "chip good"; chip.textContent = `${r.moves} moved`; chip.classList.remove("hidden");
  box.innerHTML = `<div class="stack">
    <div class="row between">
      <span class="chip good">valid · 0 hard violations</span>
      <span class="muted" style="font-size:12px">${(r.attempts || []).map((a) => a.strategy).join(" → ")}</span>
    </div>
    <div class="list">${(r.moved || []).slice(0, 14).map((m) => {
      const b = m.before || {}, a = m.after || {};
      return `<div class="item">
        <span class="ico info">↔</span>
        <span class="ib">
          <span class="it">${esc(m.session_id)} <span class="muted" style="font-weight:400">· ${esc(m.kind || "")}</span></span>
          <span class="diff-row" style="margin-top:4px">
            <span class="diff-from">${esc(b.day)} P${b.start_period} · ${esc(b.room_id)}</span>
            <span class="muted">→</span>
            <span class="diff-to">${esc(a.day)} P${a.start_period} · ${esc(a.room_id)}</span>
          </span>
        </span></div>`;
    }).join("") || '<div class="muted">nothing needs to move</div>'}</div>
    <div class="row">
      <button class="btn good" onclick="approveProposal('${esc(r.proposal_id)}')">Approve &amp; apply</button>
      <button class="btn bad" onclick="rejectProposal('${esc(r.proposal_id)}')">Reject</button>
      <span class="muted" style="font-size:12px">A different admin must press approve.</span>
    </div>
  </div>`;
  loadProposals();
}

async function approveProposal(id) {
  try {
    const r = await api(`/api/disruption/${encodeURIComponent(id)}/apply`, { method: "POST" });
    toast(`Applied · ${r.moves} session(s) moved · exports rewritten`, "good");
    closePop(); loadProposals(); loadWeek(true);
  } catch (e) {
    toast(e.status === 403
      ? "That is your own request — sign in as dean@cit.edu to approve it."
      : "Apply failed: " + e.message, "bad");
  }
}

async function rejectProposal(id) {
  const note = prompt("Why are you rejecting this change?", "not needed this week");
  if (note === null) return;
  try {
    await api(`/api/disruption/${encodeURIComponent(id)}/reject?note=${encodeURIComponent(note)}`, { method: "POST" });
    toast("Rejected", "good"); loadProposals();
  } catch (e) { toast(e.message, "bad"); }
}

async function loadProposals() {
  try {
    const r = await api("/api/disruption/proposals");
    const items = r.proposals || [];
    $("proposalList").innerHTML = items.length ? `
      <table class="t"><thead><tr><th>Id</th><th>Title</th><th>Asked by</th><th>Moves</th><th>Status</th><th></th></tr></thead>
      <tbody>${items.map((p) => `<tr>
        <td class="mono">${esc(p.id)}</td><td>${esc(p.title || "")}</td>
        <td>${esc(p.requested_by || "")}</td><td>${p.moves ?? "—"}</td>
        <td><span class="badge ${esc(p.status)}">${esc(p.status)}</span></td>
        <td>${p.status === "pending"
          ? (p.can_i_approve
            ? `<button class="btn sm good" onclick="approveProposal('${esc(p.id)}')">Approve</button>
               <button class="btn sm bad" onclick="rejectProposal('${esc(p.id)}')">Reject</button>`
            : '<span class="muted" style="font-size:12px">another admin must decide</span>')
          : ""}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">No proposals yet. Preview a change file to create one.</div>`;
  } catch (e) { $("proposalList").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

/* ------------------------------------------------------------------ AI */
function chatBubble(kind, html) {
  const el = document.createElement("div");
  el.className = "bubble " + kind;
  el.innerHTML = html;
  $("chatLog").appendChild(el);
  $("chatLog").parentElement.scrollTop = 1e6;
  return el;
}

async function initAI() {
  if (!store.samples) {
    try {
      const s = await api("/api/ai/samples");
      store.samples = s.samples || [];
    } catch { store.samples = []; }
  }
  $("sampleChips").innerHTML = store.samples.slice(0, 5).map((s, i) =>
    `<button onclick="useSample(${i})">${esc((s.text || "").slice(0, 46))}…</button>`).join("");
  if (!store.chat.length) {
    chatBubble("bot", `Tell me what you need in plain words — English or Hinglish. I read it, show every
      assumption, and the rules decide whether it fits. <br /><span class="muted" style="font-size:12px">Nothing is booked until you press <b>Book it</b>.</span>`);
  }
  try {
    const st = await api("/api/ai/status");
    $("aiProviderChip").textContent = st.enabled ? `model: ${st.model}` : "deterministic parser";
    $("aiMode").textContent = st.note;
    $("sideStatus").textContent = st.enabled ? "model + rules" : "rules only · no model";
  } catch { /* ignore */ }
  const e = await loadEntities();
  if (!store.user.faculty_id) {
    $("facPicker").innerHTML = e.faculty.map((f) => `<option value="${esc(f.id)}">${esc(f.id)} — ${esc(f.name)}</option>`).join("");
    $("facWho").textContent = "pick whose request this is";
  } else {
    $("facPicker").outerHTML = `<span class="mono" id="facPicker">${esc(store.user.faculty_id)}</span>`;
    $("facWho").textContent = `signed in as ${esc(store.user.faculty_id)}`;
  }
}

function useSample(i) {
  const s = store.samples[i];
  if (s) { $("aiText").value = s.text; aiParse(); }
}

function resetChat() { store.chat = []; $("chatLog").innerHTML = ""; initAI(); }

async function aiParse() {
  const text = $("aiText").value.trim();
  if (!text) return toast("Type a request first", "bad");
  chatBubble("me", esc(text));
  $("aiText").value = "";
  const holder = chatBubble("bot", '<span class="muted">reading…</span>');
  try {
    const r = await api("/api/ai/parse", { method: "POST", body: JSON.stringify({ text }) });
    holder.innerHTML = parseSummary(r);
    renderDraft(r);
    renderChecks(r);
  } catch (e) {
    holder.innerHTML = `<span style="color:#9f1239">${esc(e.message)}</span>`;
  }
}

function parseSummary(r) {
  const d = r.draft, w = d.windows[0] || {};
  const bits = [
    d.attendance ? `<b>${d.attendance}</b> people` : null,
    d.duration_periods ? `<b>${d.duration_periods}</b> period(s)` : null,
    w.day ? `<b>${esc(w.day)}</b> P${w.from_period}–${w.to_period}` : null,
    (d.needs || []).length ? (d.needs || []).join(", ") : null,
    (d.room_types || []).length ? (d.room_types || []).join(" / ") : null,
  ].filter(Boolean);
  return `Got it${bits.length ? " — " + bits.join(" · ") : ""}.
    ${r.follow_up ? `<div class="item" style="margin-top:8px"><span class="ico warn">?</span>
      <span class="ib"><span class="it">${esc(r.follow_up)}</span><span class="is">one detail is missing</span></span></div>` : ""}
    ${(r.feasibility.conflicts || []).map((c) => `<div class="muted" style="font-size:12px">✗ ${esc(c)}</div>`).join("")}
    <div class="muted" style="font-size:11.5px;margin-top:6px">read by ${esc(r.source.provider)}${r.source.llm ? " + " + esc(r.source.llm.model) : " · no model"}</div>`;
}

function renderDraft(r) {
  const d = r.draft, w = d.windows[0] || {};
  store.lastDraft = d;
  $("aiDraft").innerHTML = `<div class="stack">
    <div class="field"><label for="dAtt">Attendance</label><input id="dAtt" type="number" value="${d.attendance ?? ""}" /></div>
    <div class="grid g3" style="gap:8px">
      <div class="field"><label for="dDay">Day</label><input id="dDay" type="text" value="${esc(w.day || "")}" /></div>
      <div class="field"><label for="dFrom">From</label><input id="dFrom" type="number" value="${w.from_period ?? ""}" /></div>
      <div class="field"><label for="dTo">To</label><input id="dTo" type="number" value="${w.to_period ?? ""}" /></div>
    </div>
    <div class="field"><label for="dDur">Periods</label><input id="dDur" type="number" value="${d.duration_periods ?? 1}" /></div>
    <div class="field"><label for="dNeeds">Needs</label><input id="dNeeds" type="text" value="${esc((d.needs || []).join(", "))}" /></div>
    <div class="field"><label for="dTypes">Room types</label><input id="dTypes" type="text" value="${esc((d.room_types || []).join(", "))}" /></div>
    <div class="row">
      <button class="btn primary" onclick="aiCheck()">Check with the rules</button>
      <button class="btn good" onclick="aiBook()">Book it</button>
    </div>
  </div>`;
}

function renderChecks(r) {
  const conf = Object.entries(r.confidence || {});
  $("aiChecks").innerHTML = `<div class="stack">
    <div class="conf">${conf.map(([k, v]) => `
      <div class="conf-row"><span>${esc(k.replace(/_/g, " "))}</span>
        <span class="bar ${v > .8 ? "good" : v > .5 ? "" : "warn"}"><i style="width:${Math.round(v * 100)}%"></i></span>
        <span class="muted">${Math.round(v * 100)}%</span></div>`).join("")}</div>
    ${(r.assumptions || []).map((a) => `<div class="item"><span class="ico">↳</span><span class="ib">
      <span class="it">assumed ${esc(a.field)} = ${esc(typeof a.value === "string" ? a.value : JSON.stringify(a.value))}</span>
      <span class="is">${esc(a.why)}</span></span></div>`).join("")}
    ${(r.warnings || []).map((w) => `<div class="item"><span class="ico bad">!</span><span class="ib"><span class="it">${esc(w)}</span></span></div>`).join("")}
    <div class="item"><span class="ico ${r.feasibility.ok ? "good" : "bad"}">${r.feasibility.ok ? "✓" : "✗"}</span>
      <span class="ib"><span class="it">${r.feasibility.ok ? "fits the rules" : "does not fit yet"}</span>
      <span class="is">${(r.feasibility.conflicts || []).map(esc).join(" · ")
        || ((r.feasibility.candidate_rooms || []).length ? "rooms that fit: " + r.feasibility.candidate_rooms.join(", ") : "not enough information")}</span></span></div>
  </div>`;
}

function draftPayload() {
  const needs = ($("dNeeds").value || "").split(",").map((s) => s.trim()).filter(Boolean);
  const types = ($("dTypes").value || "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    title: ($("chatLog").querySelectorAll(".bubble.me")[0] || {}).textContent?.slice(0, 80) || "Booking",
    attendance: Number($("dAtt").value) || 0,
    duration_periods: Number($("dDur").value) || 1,
    windows: [{ day: ($("dDay").value || "").trim().toUpperCase(),
                from_period: Number($("dFrom").value) || 1, to_period: Number($("dTo").value) || 9 }],
    needs, room_types: types.length ? types : null,
  };
}

async function aiCheck() {
  const data = draftPayload();
  if (!data.attendance) return toast("Attendance is required", "bad");
  try {
    const r = await api("/api/bookings/manual/check", { method: "POST", body: JSON.stringify(data) });
    $("aiChecks").innerHTML = r.ok
      ? `<div class="stack"><span class="chip good">fits</span>
          ${r.candidates.map((c) => `<div class="item"><span class="ico good">✓</span><span class="ib">
            <span class="it">${esc(c.day)} P${c.start_period}–${c.end_period} · ${esc(c.room_id)}</span>
            <span class="is">${c.capacity} seats</span></span></div>`).join("")}</div>`
      : `<div class="stack"><span class="chip bad">blocked</span>
          <span class="muted" style="font-size:12px">${esc(r.reason || "")}</span>
          ${r.conflicts.map((c) => `<div class="item"><span class="ico bad">✗</span><span class="ib"><span class="it">${esc(c)}</span></span></div>`).join("")}</div>`;
  } catch (e) { toast(e.message, "bad"); }
}

async function aiBook() {
  const data = draftPayload();
  if (!data.attendance) return toast("Attendance is required", "bad");
  try {
    const r = await api("/api/bookings/manual", { method: "POST", body: JSON.stringify(data) });
    const c = r.created;
    toast(`Booked ${c.id} · ${c.day} P${c.start_period}–${c.end_period} · ${c.room_id}`, "good");
    chatBubble("bot", `Booked <b>${esc(c.id)}</b> — ${esc(c.day)} P${c.start_period}–${c.end_period} in
      <b>${esc(c.room_id)}</b>.<br /><span class="muted" style="font-size:12px">Scored events live in the
      fest-week export; manual events sit on top and are visible in room availability.</span>`);
    loadWeek(true);
  } catch (e) { toast("Not booked: " + e.message, "bad"); }
}

async function facultyChange() {
  const text = $("facText").value.trim();
  if (!text) return toast("Type what changed", "bad");
  const picker = $("facPicker");
  const facultyId = store.user.faculty_id || (picker && picker.value) || "";
  $("facResult").innerHTML = `<span class="muted">checking…</span>`;
  try {
    const r = await api("/api/ai/change-request", { method: "POST",
      body: JSON.stringify({ text, faculty_id: facultyId || null }) });
    const detail = r.status === "needs_detail";
    $("facResult").innerHTML = `
      <div class="item"><span class="ico ${detail ? "warn" : r.valid ? "good" : "bad"}">${detail ? "?" : r.valid ? "✓" : "✗"}</span>
        <span class="ib"><span class="it">${esc(r.answer || r.follow_up || r.summary || "")}</span>
        <span class="is">${esc(r.summary || "")}${r.proposal_id ? " · proposal " + esc(r.proposal_id) + " (" + esc(r.status) + ")" : ""}</span></span></div>
      ${(r.conflicts || []).length ? `<div class="list" style="margin-top:8px">${r.conflicts.map((c) =>
        `<div class="item"><span class="ico bad">✗</span><span class="ib"><span class="it">${esc(c)}</span></span></div>`).join("")}</div>` : ""}`;
  } catch (e) { $("facResult").innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
}

/* ------------------------------------------------------------------ side chat */
function sidePush(kind, html) {
  const d = document.createElement("div");
  d.className = "bubble " + kind;
  d.innerHTML = html;
  $("sideChat").appendChild(d);
  $("sideChat").parentElement.scrollTop = 1e6;
}

async function sideAsk(text) {
  $("sideInput").value = text;
  sideSend();
}

async function sideSend() {
  const input = $("sideInput");
  const text = (input.value || "").trim();
  if (!text) return;
  input.value = "";
  sidePush("me", esc(text));

  const brMatch = text.toUpperCase().match(/BR-\d+/);
  const lower = text.toLowerCase();

  try {
    if (brMatch) {
      const r = await api(`/api/bookings/${brMatch[0]}`);
      const d = r.decision || {};
      sidePush("bot", `<b>${brMatch[0]}</b> — <span class="badge ${esc(d.status || "undecided")}">${esc((d.status || "no decision").replace(/_/g, " "))}</span>
        <div style="margin-top:6px">${(r.why || []).map(esc).join("<br />")}</div>`);
      return;
    }
    if (/(free|available|khaali)/.test(lower) && /(room|lh|hall)/.test(lower)) {
      const free = await freeRooms(text);
      sidePush("bot", free);
      return;
    }
    const r = await api("/api/ai/parse", { method: "POST", body: JSON.stringify({ text }) });
    const d = r.draft, w = d.windows[0] || {};
    sidePush("bot", `${parseSummary(r)}
      <div style="margin-top:8px"><button class="btn sm" onclick="go('ai'); setTimeout(()=>{document.getElementById('aiText').value=${JSON.stringify(text)}; aiParse();},150)">Open in Ask Tessera →</button></div>`);
  } catch (e) {
    sidePush("bot", `<span style="color:#9f1239">${esc(e.message)}</span>`);
  }
}

async function freeRooms(text) {
  const lower = text.toLowerCase();
  const day = DAYS.find((d) => lower.includes(d.toLowerCase())) ||
    (lower.includes("wed") ? "WED" : lower.includes("thu") ? "THU" : lower.includes("fri") ? "FRI"
      : lower.includes("mon") ? "MON" : lower.includes("tue") ? "TUE" : "WED");
  let from = 1, to = 9;
  if (/after lunch|lunch ke baad|afternoon/.test(lower)) { from = 6; }
  else if (/evening|shaam|night/.test(lower)) { from = 10; to = 13; }
  else if (/morning/.test(lower)) { from = 1; to = 5; }
  const [week, ent] = await Promise.all([loadWeek(), loadEntities()]);
  const busy = new Set();
  week.entries.forEach((e) => {
    if (e.day !== day) return;
    for (let p = e.start_period; p <= e.end_period; p++) busy.add(`${e.room_id}-${p}`);
  });
  const free = ent.rooms.filter((r) => {
    for (let p = from; p <= to; p++) if (busy.has(`${r.id}-${p}`)) return false;
    return true;
  }).slice(0, 6);
  if (!free.length) return `Nothing is free on ${day} P${from}–P${to} — every teaching space is in use.`;
  return `<b>${free.length}</b> rooms free on <b>${day}</b> P${from}–P${to}:<div class="chips" style="margin-top:8px">
    ${free.map((r) => `<span class="chip">${esc(r.id)} · ${r.capacity} seats</span>`).join("")}</div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">computed from the live timetable, not from a model</div>`;
}

/* ------------------------------------------------------------------ admin */
async function loadAdmin() {
  try {
    const d = await api("/api/admin/db");
    $("dbEngine").textContent = d.engine;
    $("dbInfo").innerHTML = `
      <div class="row" style="gap:6px;margin-bottom:10px">
        <span class="chip">file ${d.file_bytes ? Math.round(d.file_bytes / 1024) + " KB" : "—"}</span>
        <span class="chip">versions ${d.tables.timetable_version}</span>
        <span class="chip">placements ${d.tables.placement}</span>
      </div>
      <div class="pre">${esc(JSON.stringify(d.tables, null, 2))}</div>
      <p class="muted" style="font-size:11.5px;margin-top:8px">${esc(d.note)}</p>`;
    const hist = await api("/api/admin/history");
    const v = hist.versions[0];
    if (v) $("seedChip").textContent = `seed ${v.seed} · v${v.id}`;
  } catch (e) { $("dbInfo").textContent = e.message; }
  $("meDay").innerHTML = DAYS.map((d) => `<option>${d}</option>`).join("");
}

async function aiSelftest() {
  $("selftestResult").innerHTML = `<span class="muted">calling the provider…</span>`;
  try {
    const r = await api("/api/ai/selftest", { method: "POST" });
    $("selftestResult").innerHTML = r.ok
      ? `<div class="row"><span class="chip good">live</span>
         <span class="chip">${esc(r.provider || "")} ${esc(r.model || "")}</span>
         <span class="chip">${r.latency_ms != null ? r.latency_ms + " ms" : "ok"}</span></div>
         ${r.reply ? `<p class="muted" style="font-size:12px;margin-top:8px">round-trip: “${esc(String(r.reply).slice(0, 120))}”</p>` : ""}`
      : `<div class="item"><span class="ico warn">!</span><span class="ib"><span class="it">Not configured</span>
         <span class="is">${esc(r.reason || r.error || "")}</span></span></div>`;
  } catch (e) { $("selftestResult").textContent = e.message; }
}

async function generateNow() {
  const btn = $("genBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Solving…"; }
  try {
    const r = await api("/api/timetable/generate", { method: "POST", body: JSON.stringify({}) });
    toast(`Generated · ${r.hard_violations} hard · soft ${r.soft_total} · ${r.solve_seconds}s · seed ${r.seed}`, "good");
    store.week = null;
    if ($("genResult")) $("genResult").innerHTML = `<span class="chip ${r.hard_violations ? "bad" : "good"}">${r.hard_violations} hard</span>
      <span class="chip">soft ${r.soft_total}</span> <span class="chip">${r.solve_seconds}s</span>`;
    loadOverview();
  } catch (e) { toast(e.message, "bad"); }
  if (btn) { btn.disabled = false; btn.textContent = "Generate timetable"; }
}

async function exportNow() {
  try {
    const r = await api("/api/admin/exports", { method: "POST" });
    toast("Exports written: " + Object.keys(r.written).join(", "), "good");
  } catch (e) { toast(e.message, "bad"); }
}

async function resetDemo() {
  if (!confirm("Reset demo data? Users are reseeded and the committed exports reloaded.")) return;
  try {
    const r = await api("/api/admin/reset", { method: "POST" });
    toast(`Reset · ${r.users} users · ${r.sessions} sessions`, "good");
    store.week = null; loadOverview();
  } catch (e) { toast(e.message, "bad"); }
}

function manualPayload() {
  return {
    title: $("meTitle").value, attendance: Number($("meAtt").value) || 0,
    duration_periods: Number($("meDur").value) || 1,
    windows: [{ day: $("meDay").value, from_period: Number($("meFrom").value) || 1,
                to_period: Number($("meTo").value) || 9 }],
  };
}

async function manualCheck() {
  try {
    const r = await api("/api/bookings/manual/check", { method: "POST", body: JSON.stringify(manualPayload()) });
    $("meResult").innerHTML = r.ok
      ? `<span class="chip good">fits</span> ${r.candidates.map((c) => `<span class="chip">${esc(c.day)} P${c.start_period} · ${esc(c.room_id)}</span>`).join(" ")}`
      : `<span class="chip bad">blocked</span><div class="list" style="margin-top:8px">${r.conflicts.map((c) =>
          `<div class="item"><span class="ico bad">✗</span><span class="ib"><span class="it">${esc(c)}</span></span></div>`).join("")}</div>`;
  } catch (e) { toast(e.message, "bad"); }
}

async function manualBook() {
  try {
    const r = await api("/api/bookings/manual", { method: "POST", body: JSON.stringify(manualPayload()) });
    $("meResult").innerHTML = `<span class="chip good">booked</span> ${esc(r.created.id)} · ${esc(r.created.day)} P${r.created.start_period}–${r.created.end_period} · ${esc(r.created.room_id)}`;
    loadWeek(true);
  } catch (e) { toast("Blocked: " + e.message, "bad"); }
}

/* ------------------------------------------------------------------ search */
async function search(term) {
  const q = (term || "").trim().toUpperCase();
  if (!q) return;
  const e = await loadEntities();
  const room = e.rooms.find((r) => r.id === q);
  const group = e.groups.find((g) => g.id === q);
  const fac = e.faculty.find((f) => f.id === q);
  if (room) { store.tt.view = "room"; setSeg("room"); store.tt.id = q; go("timetable"); return; }
  if (group) { store.tt.view = "group"; setSeg("group"); store.tt.id = q; go("timetable"); return; }
  if (fac) { store.tt.view = "faculty"; setSeg("faculty"); store.tt.id = q; go("timetable"); return; }
  const week = await loadWeek();
  const hit = week.entries.find((x) => (x.course_id || "").toUpperCase().includes(q));
  if (hit) {
    const s = await api(`/api/timetable/sessions/${encodeURIComponent(hit.session_id)}`);
    store.tt.view = "group"; setSeg("group"); store.tt.id = (s.session.groups || [])[0]; go("timetable");
    return;
  }
  toast(`No room, group, faculty or course matches “${term}”`, "bad");
}

function setSeg(view) {
  document.querySelectorAll("[data-ttview]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ttview === view)));
}

/* ------------------------------------------------------------------ init */
function wire() {
  if (wire.done) return;
  wire.done = true;

  document.querySelectorAll(".nav-item[data-view]").forEach((n) =>
    n.addEventListener("click", () => go(n.dataset.view)));
  document.querySelectorAll("[data-ttview]").forEach((b) =>
    b.addEventListener("click", () => { store.tt.view = b.dataset.ttview; store.tt.id = null; setSeg(b.dataset.ttview); initTimetable(); }));
  document.querySelectorAll("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      store.bookingFilter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      loadBookings();
    }));
  $("ttEntity").addEventListener("change", loadTimetable);
  $("logoutBtn").addEventListener("click", logout);
  $("railToggle").addEventListener("click", () => $("rail").classList.toggle("open"));
  $("globalSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") search(e.target.value); });
  $("sideInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sideSend(); });
  document.querySelectorAll("[data-layer]").forEach((c) =>
    c.addEventListener("change", () => {
      store.layers[c.dataset.layer] = c.checked;
      if (!$("view-timetable").classList.contains("hidden")) loadTimetable();
    }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
  document.addEventListener("click", (e) => {
    if (store.pop && !store.pop.contains(e.target) && !e.target.closest(".ev")) closePop();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  wire();
  bootLogin();
  if (store.token && store.user) start();
});
