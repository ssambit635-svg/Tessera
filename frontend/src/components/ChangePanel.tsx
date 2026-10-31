import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "./Icon";
import { DAY_LONG } from "../lib/format";
import { plural } from "../lib/format";

const STATE_LABEL = {
  valid: "Compatible",
  warning: "Compatible with warnings",
  invalid: "Blocked by the rules",
} as const;

export function ChangePanel({ compact = false }: { compact?: boolean }) {
  const { pending, applyPending, discardChange, source } = useWorkspace();
  const navigate = useNavigate();
  if (!pending) return null;

  const { local } = pending;
  const remoteValid = pending.remote?.valid;
  const verdict = local.state;
  const canApply = remoteValid ?? verdict !== "invalid";
  const checks = local.checks.filter((c) => c.status !== "pass");
  const shown = compact ? checks.slice(0, 3) : checks;

  return (
    <div className="change-panel">
      <div className="change-panel-head">
        <span className={`status ${verdict}`}>
          <Icon name={verdict === "invalid" ? "alert" : verdict === "warning" ? "alert" : "check"} size={11} strokeWidth={2.2} />
          {STATE_LABEL[verdict]}
        </span>
        <span className="cp-title">
          {local.session.courseId} · {local.from.day} P{local.from.startPeriod} → {local.to.day} P{local.to.startPeriod}
        </span>
        <button className="icon-square sm" onClick={discardChange} aria-label="Discard proposal" style={{ marginLeft: "auto" }}>
          <Icon name="x" size={12} />
        </button>
      </div>

      <div className="change-panel-body">
        <div className="row gap-6 wrap" style={{ fontSize: 11, color: "var(--text-soft)" }}>
          <span className="chip outline">
            <Icon name="pin" size={10} /> {local.from.roomName}
          </span>
          <Icon name="arrowRight" size={12} style={{ color: "var(--muted)" }} />
          <span className="chip outline">
            <Icon name="pin" size={10} /> {local.to.roomName}
          </span>
          <span className="chip outline">
            <Icon name="clock" size={10} /> {DAY_LONG[local.to.day].slice(0, 3)} · P{local.to.startPeriod}–P{local.to.endPeriod}
          </span>
        </div>

        {pending.remoteError ? (
          <div className="callout coral" style={{ fontSize: 11 }}>
            <Icon name="alert" size={14} />
            <span>
              <b>The scheduling API rejected the request.</b> {pending.remoteError}
            </span>
          </div>
        ) : null}

        {pending.remote ? (
          <div className={`verdict ${pending.remote.valid ? "valid" : "invalid"}`}>
            <Icon name={pending.remote.valid ? "shield" : "alert"} size={14} />
            <span>
              <b>{pending.remote.valid ? "Validated by the scheduling API." : "Refused by the scheduling API."}</b>{" "}
              {pending.remote.valid
                ? `${plural(pending.remote.moves ?? 0, "session")} modified. ${pending.remote.next ?? ""}`
                : String(pending.remote.explanation ?? pending.remote.next ?? "The target slot breaks a hard constraint.")}
            </span>
          </div>
        ) : (
          <div className="callout" style={{ fontSize: 10.5, padding: "9px 11px" }}>
            <Icon name="info" size={13} />
            <span>
              <b>Instant local rule check.</b>{" "}
              {source.mode === "live"
                ? "The authoritative verdict is computed by the scheduling API when the move is proposed."
                : "This preview is computed in the browser — nothing is written to the schedule."}
            </span>
          </div>
        )}

        {shown.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shown.map((check) => (
              <div key={check.id} className={`check-row ${check.status}`}>
                <span className="check-icon">
                  <Icon
                    name={check.status === "fail" ? "x" : check.status === "warn" ? "alert" : "check"}
                    size={9}
                    strokeWidth={2.6}
                  />
                </span>
                <span>
                  <b>{check.label}</b>
                  <span className="detail">{check.detail}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="check-row pass">
            <span className="check-icon">
              <Icon name="check" size={9} strokeWidth={2.6} />
            </span>
            <span>
              <b>All ten checks pass</b>
              <span className="detail">Venue, capacity, faculty, groups and teaching window all agree.</span>
            </span>
          </div>
        )}

        <div className="impact-grid">
          <div className="impact-cell">
            <span className="ic-label">Sessions modified</span>
            <span className="ic-value">{local.impact.sessionsModified}</span>
          </div>
          <div className="impact-cell">
            <span className="ic-label">People affected</span>
            <span className="ic-value">
              {local.impact.peopleAffected}
              <small style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)", marginLeft: 5 }}>
                {local.impact.studentsAffected} students
              </small>
            </span>
          </div>
          <div className="impact-cell">
            <span className="ic-label">Resources affected</span>
            <span className="ic-value">{local.impact.resourcesAffected}</span>
          </div>
          <div className="impact-cell">
            <span className="ic-label">Conflicts</span>
            <span className="ic-value" style={{ color: local.impact.conflictsIntroduced ? "#8c2c19" : "var(--text)" }}>
              {local.impact.conflictsIntroduced}
              <small style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)", marginLeft: 5 }}>
                introduced
              </small>
            </span>
          </div>
        </div>

        <div className="row gap-8" style={{ fontSize: 10.5, color: "var(--muted)" }}>
          <span className="row gap-4">
            <Icon name={local.impact.facultyPreserved ? "check" : "x"} size={11} /> Faculty preserved
          </span>
          <span className="row gap-4">
            <Icon name={local.impact.resourcePreserved ? "check" : "x"} size={11} /> Resource assignments
          </span>
        </div>
      </div>

      <div className="change-panel-foot">
        <button className="btn sm" onClick={() => navigate("/ripple")}>
          <Icon name="route" size={13} /> Review Ripple Effect
        </button>
        <button className="btn sm primary" onClick={() => void applyPending()} disabled={!canApply}>
          <Icon name="check" size={13} /> Approve &amp; apply
        </button>
      </div>
    </div>
  );
}
