/* Tessera UI — no framework, no build step, no CDN.
   Every number on screen comes from the API; nothing is hard-coded. */

const store = {
  token: localStorage.getItem("tessera_token") || "",
  user: JSON.parse(localStorage.getItem("tessera_user") || "null"),
  entities: null,
  dataset: null,
};

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, kind = "") {
  const el = $("toast");
  el.className = "toast " + kind;
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.style.display = "none"), 5200);
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
    const detail = body && body.detail ? (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)) : res.statusText;
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return body;
}

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
  store.token = "";
  store.user = null;
  localStorage.removeItem("tessera_token");
  localStorage.removeItem("tessera_user");
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
}

async function bootLogin() {
  try {
    const r = await api("/api/auth/accounts");
    $("roleButtons").innerHTML = r.accounts
      .map((a) => `<button class="btn role-btn" data-role="${esc(a.role)}" data-email="${esc(a.email)}">
          <span><b>${esc(a.label)}</b><small>${esc(a.email)}</small></span>
          <span class="badge info">sign in →</span></button>`)
      .join("");
    document.querySelectorAll(".role-btn").forEach((b) =>
      b.addEventListener("click", () => login(b.dataset.role, b.dataset.email)));
  } catch (e) {
    $("roleButtons").innerHTML = `<div class="list-item">API not reachable: ${esc(e.message)}</div>`;
  }
}

/* ------------------------------------------------------------------ shell */
async function start() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("userEmail").textContent = store.user.email;
  $("userRole").textContent = store.user.role.replace(/_/g, " ");
  try {
    const h = await api("/health");
    $("healthChip").textContent = `${h.sessions} sessions · ${h.exams} exams · AI: ${h.llm}`;
  } catch { /* non-fatal */ }
  show("dashboard");
  loadEntities();
  aiModeLabel();
  loadFacultyPicker();
}

function show(view) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  ({ dashboard: loadDashboard, timetable: loadTimetable, bookings: loadBookings,
     changes: loadProposals, ai: aiModeLabel, admin: loadAdmin }[view] || (() => {}))();
}

/* ------------------------------------------------------------------ dashboard */
async function loadDashboard() {
  try {
    const d = await api("/api/admin/dashboard");
    const c = d.counts;
    const bookings = await api("/api/bookings");
    const b = bookings.totals;
    $("dashSub").textContent = `${d.dataset.dataset_id} · ${c.scheduled}/${c.sessions} sessions placed · generated from ${d.meta.source || "committed exports"}`;
    $("dashStats").innerHTML = [
      stat("Scheduled", `${c.scheduled}/${c.sessions}`, "good", "every session exactly once"),
      stat("Hard violations", d.conflicts.hard, d.conflicts.hard ? "bad" : "good", "validator rules"),
      stat("Soft penalty", d.soft.total, d.soft.total > 6 ? "warn" : "good", "lower is better"),
      stat("Booking score", `${b.score}/${b.max}`, "good", `${b.approved} approved · ${b.alternatives} alt · ${b.rejected} rejected`),
    ].join("");
    $("dashSoft").innerHTML = Object.entries(d.soft.breakdown)
      .map(([k, v]) => `<div class="row between" style="margin-bottom:6px"><span>${k}</span><b>${v}</b></div>
        <div class="bar"><span style="width:${Math.min(100, v * 20)}%"></span></div>`)
      .join("") || '<span class="muted">no penalties</span>';
    $("dashRisks").innerHTML = (d.risks || []).map((r) => `<div class="list-item">${esc(r)}</div>`).join("")
      || '<span class="muted">nothing flagged</span>';
    $("dashRooms").innerHTML = `<table><thead><tr><th>Room</th><th>Sessions</th><th>Hours</th><th>Utilisation</th></tr></thead><tbody>` +
      d.utilisation.slice(0, 8).map((u) => `<tr><td>${esc(u.room_id)}</td><td>${u.sessions}</td><td>${u.hours}</td>
        <td style="width:34%"><div class="bar"><span style="width:${Math.round(u.utilisation * 100)}%"></span></div>
        <small class="muted">${Math.round(u.utilisation * 100)}%</small></td></tr>`).join("") +
      `</tbody></table>`;
    $("dashAudit").innerHTML = (d.audit || []).length
      ? `<div class="list">${d.audit.map((a) => `<div class="list-item"><b>${esc(a.actor || "system")}</b>
          <small class="muted"> · ${esc(a.action)}</small><br><small class="muted">${esc(a.detail)}</small></div>`).join("")}</div>`
      : '<span class="muted">no actions recorded yet — generate or preview something.</span>';
  } catch (e) { toast("Dashboard: " + e.message, "bad"); }
}

const stat = (label, value, kind, note) => `<div class="card stat ${kind}">
  <div class="value">${esc(value)}</div><div class="label">${esc(label)}</div>
  <small class="muted">${esc(note)}</small></div>`;

/* ------------------------------------------------------------------ timetable */
async function loadEntities() {
  if (store.entities) return store.entities;
  store.entities = await api("/api/dataset/entities");
  return store.entities;
}

async function ttEntities() {
  const view = $("ttView").value;
  const e = await loadEntities();
  const list = view === "faculty" ? e.faculty : view === "room" ? e.rooms : e.groups;
  $("ttEntity").innerHTML = list
    .map((x) => `<option value="${esc(x.id)}">${esc(x.id)}${x.name && x.name !== x.id ? " — " + esc(x.name) : ""}</option>`)
    .join("");
  loadTimetable();
}

async function loadTimetable() {
  const view = $("ttView").value;
  const id = $("ttEntity").value;
  if (!id) return ttEntities();
  $("ttCard").innerHTML = '<div class="muted spin">loading…</div>';
  try {
    const g = await api(`/api/timetable?view=${view}&id=${encodeURIComponent(id)}`);
    const periods = g.periods.filter((p) => p.id <= 9);
    const cell = {};
    g.entries.forEach((e) => {
      for (let p = e.start_period; p <= e.end_period; p++) cell[`${e.day}-${p}`] = e;
    });
    let rows = "";
    for (const p of periods) {
      if (p.id === 6) rows += `<tr><td class="period"></td>${g.days.map(() => '<td class="lunch">LUNCH</td>').join("")}</tr>`;
      rows += `<tr><td class="period"><b>P${p.id}</b><br><small>${esc(p.start)}</small></td>`;
      for (const day of g.days) {
        const e = cell[`${day}-${p.id}`];
        if (!e) { rows += '<td class="empty">·</td>'; continue; }
        const first = e.start_period === p.id;
        const label = view === "room"
          ? `${esc(e.course_id)} <span class="meta">${esc(e.groups.join(", "))}</span>`
          : view === "faculty"
            ? `${esc(e.course_id)} <span class="meta">${esc(e.room_id)}</span>`
            : `${esc(e.course_id)} <span class="meta">${esc(e.room_id)} · ${esc(e.faculty_id)}</span>`;
        rows += first
          ? `<td rowspan="${e.end_period - e.start_period + 1}" style="padding:3px"><div class="slot" title="${esc(e.session_id)}"
               onclick="explain('${esc(e.session_id)}')"><b>${esc(e.course_id)}</b>${label.replace(esc(e.course_id), "")}</div></td>`
          : "";
      }
      rows += "</tr>";
    }
    $("ttCard").innerHTML = `<div class="row between" style="margin-bottom:8px">
        <h2>${esc(id)}</h2><span class="chip">${g.entries.length} classes</span></div>
      <div class="scroll-x"><table class="tt"><thead><tr><th></th>${g.days.map((d) => `<th>${esc(d)}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } catch (e) { $("ttCard").innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
}

async function explain(sessionId) {
  const card = $("explainCard");
  card.classList.remove("hidden");
  card.innerHTML = '<div class="muted spin">checking the rules…</div>';
  try {
    const r = await api(`/api/timetable/sessions/${encodeURIComponent(sessionId)}/explain`);
    card.innerHTML = `<h2>Why is ${esc(sessionId)} at ${esc(r.placement.day)} P${r.placement.start_period}?</h2>
      <p>${esc(r.summary)}</p>
      <div class="list">${r.reasons.map((x) => `<div class="list-item">✓ ${esc(x)}</div>`).join("")}</div>
      ${r.tradeoffs.length ? `<h3 style="margin-top:12px">Trade-offs accepted</h3>
        <div class="list">${r.tradeoffs.map((x) => `<div class="list-item">~ ${esc(x)}</div>`).join("")}</div>` : ""}
      <h3 style="margin-top:12px">Slots that would also work</h3>
      <div class="pill-row">${r.alternatives.map((a) => `<span class="pill">${esc(a.day)} P${a.start_period}</span>`).join("") || '<span class="muted">none free</span>'}</div>`;
  } catch (e) { card.innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
}

/* ------------------------------------------------------------------ bookings */
async function loadBookings() {
  const filter = $("bookFilter").value;
  try {
    const r = await api("/api/bookings" + (filter ? `?status=${filter}` : ""));
    const t = r.totals;
    $("bookStats").innerHTML = [
      stat("Score", `${t.score}/${t.max}`, "good", "credit ÷ maximum"),
      stat("Approved", t.approved, "good", "full weight"),
      stat("Alternatives", t.alternatives, "warn", "half weight"),
      stat("Rejected", t.rejected + (t.cancelled ? ` (+${t.cancelled} cancelled)` : ""), "bad", "reason required"),
    ].join("");
    $("bookTable").innerHTML = `<table><thead><tr>
        <th>Request</th><th>Asking for</th><th>Category</th><th>Decision</th><th>Why (short)</th></tr></thead><tbody>` +
      r.bookings.map((b) => {
        const d = b.decision || {};
        const status = b.cancelled ? "cancelled" : (d.status || "undecided");
        return `<tr class="clickable" onclick="bookingDetail('${esc(b.request_id)}')">
          <td><b>${esc(b.request_id)}</b><br><small class="muted">${esc(b.title || "")}</small></td>
          <td>${esc(b.attendance)} people<br><small class="muted">${(b.windows || []).map((w) => `${esc(w.day)} P${w.from_period}-${w.to_period}`).join(" ")}</small></td>
          <td>${esc(b.effective_category)}${b.category_note ? `<br><small class="muted">capped from ${esc(b.requested_category)}</small>` : ""}</td>
          <td><span class="badge ${esc(status)}">${esc(status.replace(/_/g, " "))}</span>
            ${d.room_id ? `<br><small class="muted">${esc(d.day)} P${d.start_period}-${d.end_period} · ${esc(d.room_id)}</small>` : ""}</td>
          <td><small>${esc((d.reason || "").slice(0, 90))}</small></td></tr>`;
      }).join("") + "</tbody></table>";
  } catch (e) { toast("Bookings: " + e.message, "bad"); }
}

async function bookingDetail(id) {
  const card = $("bookDetail");
  card.classList.remove("hidden");
  try {
    const r = await api(`/api/bookings/${encodeURIComponent(id)}`);
    const q = r.request;
    card.innerHTML = `<div class="row between"><h2>${esc(q.id)} — ${esc(q.title)}</h2>
        <span class="badge info">${esc(r.effective_category)} · weight ${r.weight}</span></div>
      <p class="muted">Original message: “${esc(q.raw_text || "")}”</p>
      <div class="list">${r.why.map((w) => `<div class="list-item">${esc(w)}</div>`).join("")}</div>`;
  } catch (e) { card.innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
}

/* ------------------------------------------------------------------ changes */
async function loadSample() {
  try {
    const r = await api("/api/disruption/sample");
    $("changeJson").value = JSON.stringify(r.changes, null, 2);
    toast(`Loaded ${r.file} (${r.changes.length} change(s))`, "good");
  } catch (e) { toast(e.message, "bad"); }
}

function uploadChange(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      $("changeJson").value = JSON.stringify(parsed.changes || parsed, null, 2);
      toast("Change file loaded", "good");
    } catch { toast("That is not valid JSON", "bad"); }
  };
  reader.readAsText(file);
}

async function previewChanges() {
  let changes;
  try { changes = JSON.parse($("changeJson").value); } catch { return toast("changes must be valid JSON", "bad"); }
  if (Array.isArray(changes) && changes[0] && changes[0].type === undefined && changes[0].changes) changes = changes[0].changes;
  $("previewState").textContent = "solving… this can take up to a minute";
  try {
    const r = await api("/api/disruption/preview-file", { method: "POST", body: JSON.stringify({ changes }) });
    $("previewState").textContent = "";
    renderPreview(r);
  } catch (e) { $("previewState").textContent = ""; toast("Preview: " + e.message, "bad"); }
}

function renderPreview(r) {
  const box = $("previewResult");
  if (!r.valid) {
    const ex = r.explanation || {};
    box.innerHTML = `<span class="badge bad">refused</span>
      <p style="margin-top:10px"><b>No valid fix exists.</b></p>
      <div class="list">${(ex.suggestions || []).map((s) => `<div class="list-item">${esc(s)}</div>`).join("")}</div>
      ${ex.core_sessions ? `<p class="muted" style="margin-top:8px">blocking sessions: ${esc(ex.core_sessions.join(", "))}</p>` : ""}`;
    return;
  }
  box.innerHTML = `<div class="row between" style="margin-bottom:8px">
      <span class="badge approved">valid · 0 hard violations</span>
      <span class="chip"><b>${r.moves}</b> sessions move</span></div>
    <div class="list">${(r.moved || []).slice(0, 12).map((m) => {
      const b = m.before || {}, a = m.after || {};
      return `<div class="list-item"><b>${esc(m.session_id)}</b> <small class="muted">${esc(m.kind || "")}</small><br>
        <span class="diff-before">${esc(b.day)} P${b.start_period} ${esc(b.room_id)}</span> →
        <span class="diff-after">${esc(a.day)} P${a.start_period} ${esc(a.room_id)}</span></div>`;
    }).join("") || '<div class="muted">nothing needs to move</div>'}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn good" onclick="approveProposal('${esc(r.proposal_id)}')">Approve &amp; apply</button>
      <button class="btn bad" onclick="rejectProposal('${esc(r.proposal_id)}')">Reject</button>
      <small class="muted">A different admin must press approve${store.user && store.user.role !== "admin" ? " — you are signed in as " + esc(store.user.role.replace(/_/g, " ")) : ""}.</small>
    </div>`;
  loadProposals();
}

async function approveProposal(id) {
  try {
    const r = await api(`/api/disruption/${encodeURIComponent(id)}/apply`, { method: "POST" });
    toast(`Applied — ${r.moves} session(s) moved, exports rewritten`, "good");
    loadProposals(); loadDashboard();
  } catch (e) {
    toast(e.status === 403 ? "That is your own request — sign in as dean@cit.edu to approve it."
                           : "Apply failed: " + e.message, "bad");
  }
}

async function rejectProposal(id) {
  const note = prompt("Why are you rejecting this change?", "not needed this week") || "";
  try {
    await api(`/api/disruption/${encodeURIComponent(id)}/reject?note=${encodeURIComponent(note)}`, { method: "POST" });
    toast("Rejected", "good"); loadProposals();
  } catch (e) { toast(e.message, "bad"); }
}

async function loadProposals() {
  try {
    const r = await api("/api/disruption/proposals");
    const items = r.proposals || [];
    $("proposalList").innerHTML = items.length
      ? `<table><thead><tr><th>Id</th><th>Title</th><th>Asked by</th><th>Moves</th><th>Status</th><th></th></tr></thead><tbody>` +
        items.map((p) => `<tr><td>${esc(p.id)}</td><td>${esc(p.title || "")}</td>
          <td>${esc(p.requested_by || "")}</td><td>${p.moves ?? "—"}</td>
          <td><span class="badge ${esc(p.status)}">${esc(p.status)}</span></td>
          <td>${p.status === "pending"
              ? (p.can_i_approve
                  ? `<button class="btn small good" onclick="approveProposal('${esc(p.id)}')">Approve</button>
                     <button class="btn small bad" onclick="rejectProposal('${esc(p.id)}')">Reject</button>`
                  : '<small class="muted">another admin must decide</small>')
              : ""}</td></tr>`).join("") +
        `</tbody></table>`
      : '<span class="muted">No proposals yet — preview a change file above.</span>';
  } catch (e) { $("proposalList").innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
}

/* ------------------------------------------------------------------ ai */
async function aiModeLabel() {
  try {
    const s = await api("/api/ai/status");
    $("aiMode").textContent = `Mode: ${s.mode}. ${s.note}`;
  } catch { /* ignore */ }
}

async function aiSamples() {
  try {
    const r = await api("/api/ai/samples");
    const list = r.samples || r.requests || [];
    if (!list.length) return toast("no samples found", "bad");
    sampleIndex = (sampleIndex + 1) % list.length;
    const item = list[sampleIndex];
    $("aiText").value = typeof item === "string" ? item : (item.text || item.raw_text || "");
    toast(`Sample ${sampleIndex + 1} of ${list.length}`, "good");
  } catch (e) { toast(e.message, "bad"); }
}

let lastDraft = null;
let sampleIndex = -1;

async function aiParse() {
  const text = $("aiText").value.trim();
  if (!text) return toast("Type a request first", "bad");
  $("aiChecks").innerHTML = '<span class="muted spin">reading…</span>';
  try {
    const r = await api("/api/ai/parse", { method: "POST", body: JSON.stringify({ text }) });
    lastDraft = r.draft;
    const d = r.draft;
    const win = d.windows[0] || {};
    $("aiDraft").innerHTML = `<div class="grid" style="gap:8px">
        <div class="field"><label>attendance</label><input type="number" id="dAtt" value="${d.attendance ?? ""}"></div>
        <div class="field"><label>periods</label><input type="number" id="dDur" value="${d.duration_periods ?? ""}"></div>
        <div class="row"><div class="field" style="flex:1"><label>day</label><input type="text" id="dDay" value="${esc(win.day || "")}"></div>
          <div class="field" style="width:90px"><label>from</label><input type="number" id="dFrom" value="${win.from_period ?? ""}"></div>
          <div class="field" style="width:90px"><label>to</label><input type="number" id="dTo" value="${win.to_period ?? ""}"></div></div>
        <div class="field"><label>needs</label><input type="text" id="dNeeds" value="${esc((d.needs || []).join(", "))}"></div>
        <div class="field"><label>room types</label><input type="text" id="dTypes" value="${esc((d.room_types || []).join(", "))}"></div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" onclick="aiCheck()">Check with the rules</button>
        <button class="btn good" onclick="aiBook()">Book it</button>
      </div>`;
    $("aiChecks").innerHTML = `
      <div class="row" style="margin-bottom:8px">${Object.entries(r.confidence).map(([k, v]) =>
        `<span class="chip">${esc(k)} <b>${Math.round(v * 100)}%</b></span>`).join("")}</div>
      ${r.follow_up ? `<div class="list-item" style="margin-bottom:8px">❓ ${esc(r.follow_up)}</div>` : ""}
      ${(r.assumptions || []).map((a) => `<div class="list-item">↳ assumed <b>${esc(a.field)}</b> = ${esc(JSON.stringify(a.value))}<br><small class="muted">${esc(a.why)}</small></div>`).join("")}
      ${(r.warnings || []).map((w) => `<div class="list-item" style="border-color:#7f2b3a">⚠ ${esc(w)}</div>`).join("")}
      <div class="list-item" style="margin-top:8px"><b>feasible:</b> ${r.feasibility.ok ? "yes" : "no"}
        ${(r.feasibility.conflicts || []).map((c) => `<br><small class="muted">✗ ${esc(c)}</small>`).join("")}
        ${(r.feasibility.candidate_rooms || []).length ? `<br><small class="muted">rooms that fit: ${esc(r.feasibility.candidate_rooms.join(", "))}</small>` : ""}</div>
      <small class="muted">read by: ${esc(r.source.provider)}${r.source.llm ? " + " + esc(r.source.llm.model) : " (no model)"}</small>`;
  } catch (e) { $("aiChecks").innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
}

function draftPayload() {
  const needs = $("dNeeds").value.split(",").map((s) => s.trim()).filter(Boolean);
  const types = $("dTypes").value.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    title: $("aiText").value.slice(0, 90),
    attendance: Number($("dAtt").value) || 0,
    duration_periods: Number($("dDur").value) || 1,
    windows: [{ day: $("dDay").value.trim().toUpperCase(), from_period: Number($("dFrom").value) || 1,
                to_period: Number($("dTo").value) || 9 }],
    needs, room_types: types.length ? types : null,
  };
}

async function aiCheck() {
  const data = draftPayload();
  if (!data.attendance) return toast("attendance is required", "bad");
  try {
    const r = await api("/api/bookings/manual/check", { method: "POST", body: JSON.stringify(data) });
    $("aiChecks").innerHTML = r.ok
      ? `<div class="badge approved">fits</div><div class="list" style="margin-top:8px">${r.candidates.map((c) =>
          `<div class="list-item">${esc(c.day)} P${c.start_period}-${c.end_period} · ${esc(c.room_id)} (${c.capacity} seats)</div>`).join("")}</div>`
      : `<div class="badge rejected">blocked</div><div class="list" style="margin-top:8px">${r.conflicts.map((c) =>
          `<div class="list-item">✗ ${esc(c)}</div>`).join("")}</div>`;
  } catch (e) { toast(e.message, "bad"); }
}

async function aiBook() {
  const data = draftPayload();
  if (!data.attendance) return toast("attendance is required", "bad");
  try {
    const r = await api("/api/bookings/manual", { method: "POST", body: JSON.stringify(data) });
    toast(`Booked ${r.created.id}: ${r.created.day} P${r.created.start_period}-${r.created.end_period} in ${r.created.room_id}`, "good");
    $("aiChecks").innerHTML = `<div class="badge approved">booked</div>
      <p class="muted" style="margin-top:8px">${esc(r.created.day)} P${r.created.start_period}-${r.created.end_period} · ${esc(r.created.room_id)}</p>`;
  } catch (e) {
    toast("Not booked: " + e.message, "bad");
  }
}

async function loadFacultyPicker() {
  const wrap = $("facPickerWrap");
  const isFaculty = store.user && store.user.faculty_id;
  wrap.classList.toggle("hidden", !!isFaculty);
  if (isFaculty) {
    $("facWho").textContent = `asking as ${store.user.faculty_id} (${store.user.email})`;
    return;
  }
  $("facWho").textContent = "your account is not a faculty member - pick who this is about";
  const e = await loadEntities();
  $("facPicker").innerHTML = e.faculty
    .map((f) => `<option value="${esc(f.id)}">${esc(f.id)} — ${esc(f.name)}</option>`).join("");
}

async function facultyChange() {
  const text = $("facText").value.trim();
  if (!text) return toast("Type what changed", "bad");
  const facultyId = (store.user && store.user.faculty_id) || ($("facPicker") && $("facPicker").value) || "";
  $("facState").textContent = "checking…";
  try {
    const r = await api("/api/ai/change-request", { method: "POST",
      body: JSON.stringify({ text, faculty_id: facultyId || null }) });
    $("facState").textContent = "";
    $("facResult").innerHTML = `<div class="list-item">${esc(r.answer)}</div>
      ${r.proposal_id ? `<small class="muted">proposal ${esc(r.proposal_id)} · ${esc(r.status)}</small>` : ""}
      ${(r.conflicts || []).length ? `<div class="list" style="margin-top:8px">${r.conflicts.map((c) => `<div class="list-item">✗ ${esc(c)}</div>`).join("")}</div>` : ""}`;
  } catch (e) { $("facState").textContent = ""; toast(e.message, "bad"); }
}

/* ------------------------------------------------------------------ admin */
async function loadAdmin() {
  try {
    const d = await api("/api/admin/db");
    $("dbInfo").innerHTML = `<div class="row" style="gap:8px;margin-bottom:8px">
        <span class="chip">engine <b>${esc(d.engine)}</b></span>
        <span class="chip">file <b>${d.file_bytes ? Math.round(d.file_bytes / 1024) + " KB" : "—"}</b></span>
        <span class="chip">versions <b>${d.tables.timetable_version}</b></span></div>
      <pre class="pre">${esc(JSON.stringify(d.tables, null, 2))}</pre>
      <small class="muted">${esc(d.note)}</small>`;
  } catch (e) { $("dbInfo").innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  const e = await loadEntities();
  $("meDay").innerHTML = ["MON", "TUE", "WED", "THU", "FRI"].map((d) => `<option>${d}</option>`).join("");
}

async function aiSelftest() {
  $("selftestState").textContent = "calling the provider…";
  try {
    const r = await api("/api/ai/selftest", { method: "POST" });
    $("selftestState").textContent = "";
    $("selftestResult").innerHTML = r.ok
      ? `<div class="badge approved">live</div> <span class="pill">${esc(r.model || "")}</span>
         <span class="pill">${r.latency_ms} ms</span>`
      : `<div class="badge rejected">not configured / failed</div>
         <div class="list-item" style="margin-top:6px">${esc(r.reason || r.error || "unknown")}</div>`;
  } catch (e) { $("selftestState").textContent = ""; toast(e.message, "bad"); }
}

async function generateNow() {
  const btn = $("genBtn");
  btn.disabled = true;
  $("genResult").innerHTML = '<div class="muted spin">solving — up to 40 seconds…</div>';
  try {
    const r = await api("/api/timetable/generate", { method: "POST", body: JSON.stringify({}) });
    $("genResult").innerHTML = `<div class="badge ${r.hard_violations ? "rejected" : "approved"}">
        ${r.hard_violations} hard · soft ${r.soft_total}</div>
      <small class="muted">seed ${r.seed} · ${r.solve_seconds}s</small>`;
    toast("Timetable regenerated", "good");
  } catch (e) { $("genResult").innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
  btn.disabled = false;
}

async function exportNow() {
  try {
    const r = await api("/api/admin/exports", { method: "POST" });
    toast("Exports written: " + Object.keys(r.written).join(", "), "good");
  } catch (e) { toast(e.message, "bad"); }
}

async function resetDemo() {
  if (!confirm("Reset demo data? Users are reseeded and the committed exports are reloaded.")) return;
  try {
    const r = await api("/api/admin/reset", { method: "POST" });
    toast(`Reset: ${r.users} users, ${r.sessions} sessions loaded`, "good");
    loadAdmin(); loadDashboard();
  } catch (e) { toast(e.message, "bad"); }
}

function manualPayload() {
  return {
    title: $("meTitle").value,
    attendance: Number($("meAtt").value) || 0,
    duration_periods: Number($("meDur").value) || 1,
    windows: [{ day: $("meDay").value, from_period: Number($("meFrom").value) || 1,
                to_period: Number($("meTo").value) || 9 }],
  };
}

async function manualCheck() {
  try {
    const r = await api("/api/bookings/manual/check", { method: "POST", body: JSON.stringify(manualPayload()) });
    $("meResult").innerHTML = r.ok
      ? `<div class="badge approved">fits</div> ${r.candidates.map((c) => `<span class="pill">${esc(c.day)} P${c.start_period} · ${esc(c.room_id)}</span>`).join(" ")}`
      : `<div class="badge rejected">blocked</div><div class="list" style="margin-top:6px">${r.conflicts.map((c) => `<div class="list-item">✗ ${esc(c)}</div>`).join("")}</div>`;
  } catch (e) { toast(e.message, "bad"); }
}

async function manualBook() {
  try {
    const r = await api("/api/bookings/manual", { method: "POST", body: JSON.stringify(manualPayload()) });
    $("meResult").innerHTML = `<div class="badge approved">booked</div> ${esc(r.created.id)} · ${esc(r.created.day)} P${r.created.start_period}-${r.created.end_period} · ${esc(r.created.room_id)}`;
  } catch (e) { toast("Blocked: " + e.message, "bad"); }
}

/* ------------------------------------------------------------------ init */
function wireOnce() {
  if (wireOnce.done) return;
  wireOnce.done = true;
  $("logoutBtn").addEventListener("click", logout);
  // one listener per tab, installed once - registering inside start() stacked handlers
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => show(t.dataset.view)));
}

window.addEventListener("DOMContentLoaded", () => {
  wireOnce();
  bootLogin();
  if (store.token && store.user) start();
});
