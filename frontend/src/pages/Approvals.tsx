import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import {
  ProposalRow,
  applyProposal,
  fetchSampleChanges,
  listProposalQueue,
  previewChangeFile,
  rejectProposal,
} from "../lib/api";

interface PreviewResult {
  status?: string;
  valid?: boolean;
  moves?: number;
  moved?: unknown[];
  conflicts?: unknown[];
  explanation?: unknown;
  broken_count?: number;
  new_sessions?: number;
  dropped_sessions?: number;
  proposal_id?: string | null;
  [key: string]: unknown;
}

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Approvals() {
  const { source, user, reload, notify } = useWorkspace();
  const token = source.token;
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Sign in live to read the proposal queue. Snapshot mode has no database behind it.");
      return;
    }
    try {
      const result = await listProposalQueue(token);
      setRows(result.proposals);
      setError(null);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not reach the proposals endpoint");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const decided = useMemo(() => rows.filter((r) => r.status !== "pending"), [rows]);

  const runPreview = async (changes: unknown[], label: string) => {
    if (!token) {
      notify({ tone: "danger", title: "Live sign-in needed", detail: "Repairs are computed by the API, not in the browser." });
      return;
    }
    setBusy("preview");
    setFileName(label);
    setPreview(null);
    try {
      const result = (await previewChangeFile(token, changes, label)) as PreviewResult;
      setPreview(result);
      await load();
      notify({
        tone: result.valid ? "valid" : "warn",
        title: result.valid ? "Repair computed — waiting for approval" : "The repair could not stay valid",
        detail: `${result.moves ?? 0} move(s) proposed. Nothing is applied until an admin approves it.`,
      });
    } catch (exc) {
      notify({ tone: "danger", title: "Change file rejected", detail: exc instanceof Error ? exc.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { changes?: unknown[] } | unknown[];
      const changes = Array.isArray(parsed) ? parsed : parsed.changes;
      if (!Array.isArray(changes) || !changes.length) {
        throw new Error("the file needs a non-empty \"changes\" list");
      }
      await runPreview(changes, file.name);
    } catch (exc) {
      notify({ tone: "danger", title: "Not a change file", detail: exc instanceof Error ? exc.message : "Invalid JSON" });
    }
  };

  const loadSample = async () => {
    if (!token) return;
    setBusy("sample");
    try {
      const sample = await fetchSampleChanges(token);
      await runPreview(sample.changes, sample.file);
    } catch (exc) {
      notify({ tone: "danger", title: "Sample file unavailable", detail: exc instanceof Error ? exc.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  };

  const approve = async (id: string) => {
    if (!token) return;
    setBusy(id);
    try {
      await applyProposal(token, id);
      notify({ tone: "valid", title: `${id} applied`, detail: "The repaired timetable is now in force and the board has been reloaded." });
      await load();
      await reload();
    } catch (exc) {
      notify({ tone: "danger", title: "Approval refused", detail: exc instanceof Error ? exc.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    if (!token) return;
    setBusy(id);
    try {
      await rejectProposal(token, id, rejectNote.trim() || "Rejected by admin");
      notify({ tone: "info", title: `${id} rejected`, detail: "The timetable was not touched." });
      setRejectFor(null);
      setRejectNote("");
      await load();
    } catch (exc) {
      notify({ tone: "danger", title: "Could not reject", detail: exc instanceof Error ? exc.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Approvals · four-eyes queue</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            Repairs wait here until a second admin says yes.
          </h2>
          <p>
            A disruption or a faculty change produces a <em>proposal</em>, never a silent edit. The
            request is computed by the constraint engine, stored in the database, and applied only
            when a different administrator approves it.
          </p>
        </div>
        <div className="row gap-8" style={{ flexShrink: 0 }}>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
              event.target.value = "";
            }}
          />
          <button className="btn quiet" onClick={() => fileInput.current?.click()} disabled={busy === "preview"}>
            <Icon name="upload" size={14} /> Upload change file
          </button>
          <button className="btn primary" onClick={() => void loadSample()} disabled={busy !== null}>
            <Icon name="sparkles" size={14} /> {busy === "sample" ? "Reading…" : "Load sample disruption"}
          </button>
        </div>
      </div>

      <div className="approval-strip">
        <div className="as-cell">
          <b>{pending.length}</b>
          <span>awaiting approval</span>
        </div>
        <div className="as-cell">
          <b>{decided.length}</b>
          <span>already decided</span>
        </div>
        <div className="as-cell">
          <b>{rows.filter((r) => r.valid === false).length}</b>
          <span>could not be made valid</span>
        </div>
        <div className="as-note">
          <Icon name="shield" size={14} />
          <span>
            Four-eyes rule: the admin who raised a proposal cannot approve it. {isAdmin ? "You are an admin — the buttons below are live." : "Sign in as an administrator to decide."}
          </span>
        </div>
      </div>

      {preview ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Repair preview · {fileName}</div>
              <strong style={{ fontSize: 16 }}>
                {preview.valid ? "Valid — every hard rule holds" : "Not valid — a hard rule is broken"}
              </strong>
            </div>
            <span className="spacer" />
            <span className={`chip ${preview.valid ? "lime" : "coral"}`}>{preview.status ?? "UNKNOWN"}</span>
            <button className="btn sm quiet" onClick={() => setPreview(null)} aria-label="Close preview">
              <Icon name="x" size={13} />
            </button>
          </div>
          <div className="preview-grid">
            <div>
              <span className="mono">moves</span>
              <b>{preview.moves ?? 0}</b>
            </div>
            <div>
              <span className="mono">broken after repair</span>
              <b>{preview.broken_count ?? 0}</b>
            </div>
            <div>
              <span className="mono">sessions added</span>
              <b>{preview.new_sessions ?? 0}</b>
            </div>
            <div>
              <span className="mono">sessions dropped</span>
              <b>{preview.dropped_sessions ?? 0}</b>
            </div>
            <div>
              <span className="mono">conflicts</span>
              <b>{Array.isArray(preview.conflicts) ? preview.conflicts.length : 0}</b>
            </div>
          </div>
          <div className="panel-foot">
            <Icon name="info" size={13} />
            <span>
              The repair moves as few sessions as possible, then re-checks every hard constraint from
              scratch. It is stored as a pending proposal — press Approve below to make it real.
            </span>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div className="eyebrow">Proposal queue</div>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {loading ? "READING…" : `${rows.length} TOTAL`}
          </span>
        </div>
        {error ? (
          <div className="empty">
            <Icon name="alert" size={18} />
            <p>{error}</p>
          </div>
        ) : loading ? (
          <div className="empty">
            <p>Reading the queue…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <Icon name="check" size={18} />
            <p>
              Nothing waiting. Upload a change file or load the sample disruption above — the repair
              will appear here as a pending proposal.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Proposal</th>
                  <th>Title</th>
                  <th style={{ width: 150 }}>Raised by</th>
                  <th style={{ width: 130 }}>When</th>
                  <th style={{ width: 80 }}>Moves</th>
                  <th style={{ width: 90 }}>Validity</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 190 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={open === row.id ? "on" : ""}>
                      <td className="mono">{row.id.slice(0, 12)}</td>
                      <td>
                        <button className="linkish" onClick={() => setOpen(open === row.id ? null : row.id)}>
                          {row.title}
                        </button>
                      </td>
                      <td className="mono">{row.requested_by}</td>
                      <td className="mono">{stamp(row.created_at)}</td>
                      <td className="mono">{row.moves ?? "—"}</td>
                      <td>
                        <span className={`chip ${row.valid === false ? "coral" : row.valid ? "lime" : ""}`}>
                          {row.valid === false ? "invalid" : row.valid ? "valid" : "unknown"}
                        </span>
                      </td>
                      <td>
                        <StatusChip status={row.status} />
                      </td>
                      <td>
                        <div className="row gap-6" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn sm primary"
                            disabled={!row.can_i_approve || busy === row.id}
                            title={
                              row.can_i_approve
                                ? "Apply this repair to the live timetable"
                                : row.status !== "pending"
                                  ? "This proposal is already decided"
                                  : "A different admin must approve your own proposal"
                            }
                            onClick={() => void approve(row.id)}
                          >
                            Approve
                          </button>
                          <button
                            className="btn sm quiet"
                            disabled={row.status !== "pending" || busy === row.id}
                            onClick={() => {
                              setRejectFor(row.id);
                              setRejectNote("");
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open === row.id ? (
                      <tr className="detail-row">
                        <td colSpan={8}>
                          <div className="proposal-detail">
                            <div>
                              <span className="mono">changes in this file</span>
                              <pre>{JSON.stringify(row.changes, null, 2)}</pre>
                            </div>
                            <div>
                              <span className="mono">decided by</span>
                              <p>{row.decided_by ?? "still pending"}</p>
                              <span className="mono">why it is here</span>
                              <p>
                                The engine computed the minimum-move repair and re-validated all hard
                                constraints. Approval is a human decision on top of that check — the
                                system never applies a repair by itself.
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="eyebrow">How a repair is computed</div>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            NOTHING IS APPLIED AUTOMATICALLY
          </span>
        </div>
        <div className="repair-steps">
          <div>
            <span className="rs-step">01</span>
            <b>Read the change file</b>
            <p>
              Every entry is checked against the dataset schema. An unknown room, a malformed day or a
              duplicate id is refused before anything is computed.
            </p>
          </div>
          <div>
            <span className="rs-step">02</span>
            <b>Mark what is now impossible</b>
            <p>
              A closed room or an away faculty member invalidates exactly the sessions that touch it.
              Everything else is left alone — the engine starts from the current timetable, not a blank page.
            </p>
          </div>
          <div>
            <span className="rs-step">03</span>
            <b>Move as little as possible</b>
            <p>
              Each broken session is re-placed by cost: fewest moves, then soft penalties, then the
              priority order. The result is re-validated against all hard rules from scratch.
            </p>
          </div>
          <div>
            <span className="rs-step">04</span>
            <b>Ask a human</b>
            <p>
              The repair lands in this queue as a pending proposal. A second admin approves or rejects it
              with a reason, and both outcomes are written to the audit trail.
            </p>
          </div>
        </div>
        <div className="panel-foot">
          <Icon name="shield" size={13} />
          <span>
            The validity you see is computed by <span className="mono">core/repair.py</span> and{" "}
            <span className="mono">core/constraints.py</span> — the model, when one is configured, only
            helps read the sentence.
          </span>
        </div>
      </div>

      {rejectFor ? (
        <div className="reject-sheet" role="dialog" aria-modal="true" aria-label="Reject proposal">
          <div className="rs-head">
            <div>
              <div className="eyebrow">Reject · {rejectFor.slice(0, 12)}</div>
              <strong>A reason is required — it goes into the audit trail.</strong>
            </div>
            <button className="btn sm quiet" onClick={() => setRejectFor(null)} aria-label="Cancel">
              <Icon name="x" size={13} />
            </button>
          </div>
          <input
            className="input"
            autoFocus
            value={rejectNote}
            onChange={(event) => setRejectNote(event.target.value)}
            placeholder="e.g. the alternative clashes with the mid-sem exam block"
            onKeyDown={(event) => {
              if (event.key === "Enter") void reject(rejectFor);
              if (event.key === "Escape") setRejectFor(null);
            }}
          />
          <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
            <button className="btn quiet" onClick={() => setRejectFor(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => void reject(rejectFor)} disabled={busy === rejectFor}>
              Reject proposal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = status === "applied" ? "lime" : status === "pending" ? "sand" : status === "rejected" ? "coral" : "";
  return <span className={`chip ${tone}`}>{status}</span>;
}
