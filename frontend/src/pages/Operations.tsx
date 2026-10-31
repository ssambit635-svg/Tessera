import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import {
  BudgetSnapshot,
  EXPORT_NAMES,
  downloadExport,
  fetchAiStatus,
  fetchAudit,
  fetchDatabase,
  generateTimetable,
  resetDemo,
  restoreDataset,
  runAiSelfTest,
  uploadDataset,
  writeExports,
} from "../lib/api";

type Note = { tone: "valid" | "warn" | "danger" | "info"; title: string; detail: string };

interface DbStats {
  engine: string;
  url: string;
  file_bytes: number | null;
  tables: Record<string, number>;
  active_version: Record<string, unknown> | null;
  note: string;
}

interface AiStatus {
  enabled: boolean;
  mode: string;
  model: string | null;
  fallback_model: string | null;
  daily_limit: number;
  note: string;
  budget: BudgetSnapshot;
}

function bytes(n: number | null) {
  if (n == null) return "in memory";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function Operations() {
  const { source, user, reload, notify } = useWorkspace();
  const token = source.token;
  const isAdmin = user?.role === "admin";
  const [busy, setBusy] = useState<string | null>(null);
  const [db, setDb] = useState<DbStats | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [audit, setAudit] = useState<{ at: string; actor: string; role: string; action: string; detail: string }[]>([]);
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const datasetInput = useRef<HTMLInputElement>(null);

  const say = (note: Note) => notify({ tone: note.tone, title: note.title, detail: note.detail });

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [dbStats, aiStatus, auditRows] = await Promise.all([fetchDatabase(token), fetchAiStatus(token), fetchAudit(token, 25)]);
      setDb(dbStats as DbStats);
      setAi(aiStatus as AiStatus);
      setAudit(auditRows.audit);
    } catch {
      /* the panels show an honest empty state instead of inventing numbers */
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const guard = async (key: string, run: () => Promise<void>) => {
    if (!token) {
      say({ tone: "warn", title: "Live sign-in needed", detail: "This console drives the API. Snapshot mode cannot write." });
      return;
    }
    if (!isAdmin) {
      say({ tone: "warn", title: "Administrator only", detail: "Switch persona to admin@cit.edu from Settings to use these controls." });
      return;
    }
    setBusy(key);
    try {
      await run();
    } catch (exc) {
      say({ tone: "danger", title: "The API refused", detail: exc instanceof Error ? exc.message : "Unknown error" });
    } finally {
      setBusy(null);
      await load();
    }
  };

  const onGenerate = () =>
    guard("generate", async () => {
      const result = await generateTimetable(token, 25);
      setLastRun(result as unknown as Record<string, unknown>);
      say({
        tone: result.hard_violations === 0 ? "valid" : "danger",
        title: `${result.hard_violations === 0 ? "Schedule solved" : "Solved with hard violations"}`,
        detail: `${result.hard_violations} hard · ${result.soft_total} soft cost · ${result.solve_seconds.toFixed(1)}s · seed ${result.seed}`,
      });
      await reload();
    });

  const onExport = () =>
    guard("export", async () => {
      const result = await writeExports(token);
      say({ tone: "valid", title: "Files written", detail: Object.keys(result.written).join(", ") });
    });

  const onDownload = (name: string) =>
    guard(`dl-${name}`, async () => {
      await downloadExport(token, name);
      say({ tone: "valid", title: `${name} downloaded`, detail: "The exact file the validator reads — not a copy." });
    });

  const onReset = () =>
    guard("reset", async () => {
      const result = await resetDemo(token);
      setConfirmReset(false);
      say({
        tone: "valid",
        title: "Demo restored",
        detail: `${result.users} users · ${result.sessions} sessions · repaired timetable ${result.after ? "present" : "cleared"}`,
      });
      await reload();
    });

  const onUpload = async (file: File) => {
    if (!isAdmin) {
      say({ tone: "warn", title: "Administrator only", detail: "Dataset upload is an admin action." });
      return;
    }
    await guard("upload", async () => {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const result = await uploadDataset(token, payload);
      say({ tone: "valid", title: "Dataset accepted", detail: Object.entries(result).map(([k, v]) => `${k}: ${v}`).join(" · ") });
      await reload();
    });
  };

  const onSelfTest = () =>
    guard("selftest", async () => {
      const result = await runAiSelfTest(token);
      say({
        tone: result.ok ? "valid" : "warn",
        title: result.ok ? "Groq answered" : "Provider did not answer",
        detail: result.ok
          ? `${result.model} in ${result.latency_ms} ms. Budget left today: ${result.budget?.remaining_primary ?? "?"}.`
          : `${result.reason ?? result.error ?? "unknown"}. The deterministic parser stays in charge.`,
      });
    });

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Operations · administrator console</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            Load, solve, export, prove.
          </h2>
          <p>
            Every button here calls the scheduling API and is written to the audit trail with your
            name on it. Judges can load their own dataset, regenerate the timetable, and download the
            exact files the validator reads.
          </p>
        </div>
        <div className="row gap-8" style={{ flexShrink: 0 }}>
          <button className="btn quiet" onClick={() => void load()} disabled={busy !== null}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
          <button className="btn primary" onClick={() => void onGenerate()} disabled={busy !== null}>
            <Icon name="zap" size={14} /> {busy === "generate" ? "Solving…" : "Generate timetable"}
          </button>
        </div>
      </div>

      {lastRun ? (
        <div className="exam-strip">
          <div className="es-cell">
            <b className={Number(lastRun.hard_violations) ? "warn" : ""}>{String(lastRun.hard_violations)}</b>
            <span>hard violations</span>
          </div>
          <div className="es-cell">
            <b>{String(lastRun.soft_total)}</b>
            <span>soft cost</span>
          </div>
          <div className="es-cell">
            <b>{Number(lastRun.solve_seconds ?? 0).toFixed(1)}s</b>
            <span>solve time</span>
          </div>
          <div className="es-cell">
            <b>{String(lastRun.seed)}</b>
            <span>seed (reproducible)</span>
          </div>
        </div>
      ) : null}

      <div className="ops-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Dataset</div>
              <h3 style={{ marginTop: 3 }}>Load a judge’s dataset</h3>
            </div>
            <span className="spacer" />
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
              JSON · VALIDATED BEFORE USE
            </span>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              ref={datasetInput}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUpload(file);
                event.target.value = "";
              }}
            />
            <div className="row gap-8">
              <button className="btn" onClick={() => datasetInput.current?.click()} disabled={busy !== null}>
                <Icon name="upload" size={13} /> Upload dataset.json
              </button>
              <button
                className="btn quiet"
                disabled={busy !== null}
                onClick={() =>
                  guard("restore", async () => {
                    await restoreDataset(token);
                    say({ tone: "valid", title: "Bundled dataset restored", detail: "The committed CIT dataset is back in force." });
                    await reload();
                  })
                }
              >
                <Icon name="refresh" size={13} /> Restore bundled
              </button>
            </div>
            <div className="callout" style={{ fontSize: 11.5 }}>
              <Icon name="shield" size={13} />
              <span>
                A rejected file is refused with the field that failed — nothing is half-loaded and the
                old timetable keeps running.
              </span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Exports</div>
              <h3 style={{ marginTop: 3 }}>schedule.json, served by the API</h3>
            </div>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row gap-8">
              <button className="btn sm" onClick={() => void onExport()} disabled={busy !== null}>
                <Icon name="download" size={13} /> Rebuild files
              </button>
            </div>
            {EXPORT_NAMES.map((file) => (
              <div key={file.name} className="settings-row">
                <Icon name="clipboard" size={13} />
                <span style={{ flex: 1 }}>
                  <b className="mono" style={{ fontSize: 11.5 }}>{file.name}</b>
                  <span className="cell-sub">{file.note}</span>
                </span>
                <button className="btn sm quiet" onClick={() => void onDownload(file.name)} disabled={busy !== null}>
                  <Icon name="download" size={12} /> Download
                </button>
              </div>
            ))}
            <div className="callout" style={{ fontSize: 11.5 }}>
              <Icon name="info" size={13} />
              <span>
                Downloads are authenticated: the browser asks the API with your token, so the bytes
                come from the same writer the automated validator runs against.
              </span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Database</div>
              <h3 style={{ marginTop: 3 }}>What is actually stored</h3>
            </div>
            <span className={`status ${db ? "valid" : "warning"}`} style={{ marginLeft: "auto" }}>
              {db?.engine ?? "unavailable"}
            </span>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {db ? (
              <>
                <div className="settings-kv">
                  <span>Engine</span>
                  <b>{db.engine}</b>
                </div>
                <div className="settings-kv">
                  <span>Location</span>
                  <b className="mono" style={{ fontSize: 10.5 }}>{db.url}</b>
                </div>
                <div className="settings-kv">
                  <span>File size</span>
                  <b>{bytes(db.file_bytes)}</b>
                </div>
                {Object.entries(db.tables).map(([table, count]) => (
                  <div key={table} className="settings-kv">
                    <span className="mono">{table}</span>
                    <b>{count} rows</b>
                  </div>
                ))}
                <div className="callout" style={{ fontSize: 11.5 }}>
                  <Icon name="database" size={13} />
                  <span>{db.note}</span>
                </div>
              </>
            ) : (
              <div className="empty">
                <p>Database statistics need a live sign-in as an administrator.</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">AI provider</div>
              <h3 style={{ marginTop: 3 }}>Groq free tier, with a hard daily budget</h3>
            </div>
            <span className={`status ${ai?.enabled ? "valid" : "warning"}`} style={{ marginLeft: "auto" }}>
              {ai?.enabled ? ai.mode : "deterministic"}
            </span>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ai ? (
              <>
                <div className="settings-kv">
                  <span>Primary model</span>
                  <b className="mono" style={{ fontSize: 10.5 }}>{ai.model ?? "not configured"}</b>
                </div>
                <div className="settings-kv">
                  <span>Fallback</span>
                  <b className="mono" style={{ fontSize: 10.5 }}>{ai.fallback_model ?? "—"}</b>
                </div>
                <div className="settings-kv">
                  <span>Requests today</span>
                  <b>
                    {ai.budget.requests_today} / {ai.budget.daily_limit}
                  </b>
                </div>
                <div className="meter" style={{ maxWidth: 260 }}>
                  <i
                    style={{
                      width: `${Math.min(100, (ai.budget.requests_today / Math.max(1, ai.budget.daily_limit)) * 100)}%`,
                      background: "var(--lilac-ink, var(--sage-ink))",
                    }}
                  />
                </div>
                <div className="settings-kv">
                  <span>Fallback left</span>
                  <b>{ai.budget.remaining_fallback} / {ai.budget.daily_limit_fallback}</b>
                </div>
                <p style={{ fontSize: 11.5, color: "var(--muted)", margin: 0 }}>{ai.note}</p>
                <div className="row gap-8">
                  <button className="btn sm" onClick={() => void onSelfTest()} disabled={busy !== null}>
                    <Icon name="play" size={12} /> {busy === "selftest" ? "Calling Groq…" : "Test the key"}
                  </button>
                </div>
                <div className="callout" style={{ fontSize: 11.5 }}>
                  <Icon name="shield" size={13} />
                  <span>
                    The budget counter is stored in the database, so a restart cannot reset it. When the
                    free quota is gone the assistant falls back to the deterministic parser and says so.
                  </span>
                </div>
              </>
            ) : (
              <div className="empty">
                <p>Sign in as an administrator to see the provider status. No key is ever rendered.</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Demo control</div>
              <h3 style={{ marginTop: 3 }}>Reset to the committed state</h3>
            </div>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!confirmReset ? (
              <button className="btn" onClick={() => setConfirmReset(true)} disabled={busy !== null}>
                <Icon name="refresh" size={13} /> Reset demo data
              </button>
            ) : (
              <div className="callout" style={{ fontSize: 11.5, borderColor: "var(--coral-ink)" }}>
                <Icon name="alert" size={13} />
                <span>
                  This reseeds users, reloads the committed schedule and clears the repaired timetable.
                  Proposals stay in the audit trail.
                </span>
                <div className="row gap-8" style={{ marginTop: 8 }}>
                  <button className="btn sm" onClick={() => void onReset()} disabled={busy !== null}>
                    Yes, reset
                  </button>
                  <button className="btn sm quiet" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="callout" style={{ fontSize: 11.5 }}>
              <Icon name="lock" size={13} />
              <span>
                Admin-only. Every press records actor, role and result in the audit table below — that is
                what makes the demo checkable after the fact.
              </span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Audit trail</div>
              <h3 style={{ marginTop: 3 }}>Who did what</h3>
            </div>
            <span className="spacer" />
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
              {audit.length} EVENTS
            </span>
          </div>
          <div className="panel-body">
            {audit.length ? (
              <ol className="audit-list">
                {audit.map((row, index) => (
                  <li key={`${row.at}-${index}`}>
                    <span className="mono">{new Date(row.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <b>{row.action.replace(/_/g, " ")}</b>
                    <span>{row.detail}</span>
                    <i className="mono">{row.actor}</i>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty">
                <p>No audit events yet — press one of the buttons above.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
