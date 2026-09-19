import { useMemo } from "react";

/**
 * Map a verdict status string to icon, CSS class, and color.
 */
function getVerdictMeta(status) {
  if (!status) return { cls: "pending", icon: "⏳" };
  const s = status.toLowerCase();
  if (s.includes("accepted")) return { cls: "ac", icon: "✅" };
  if (s.includes("wrong answer")) return { cls: "wa", icon: "❌" };
  if (s.includes("time limit")) return { cls: "tle", icon: "⏱️" };
  if (s.includes("memory limit")) return { cls: "mle", icon: "💾" };
  if (s.includes("runtime error")) return { cls: "re", icon: "💥" };
  if (s.includes("compilation error")) return { cls: "ce", icon: "⚠️" };
  if (s.includes("internal error")) return { cls: "wa", icon: "🔧" };
  if (s.includes("compiling")) return { cls: "pending", icon: "🔨" };
  if (s.includes("running")) return { cls: "pending", icon: "▶️" };
  if (s.includes("waiting") || s.includes("judging"))
    return { cls: "pending", icon: "⏳" };
  return { cls: "pending", icon: "⏳" };
}

/**
 * VerdictPanel — Displays live polling progress and final verdict.
 */
export default function VerdictPanel({ pollUpdate, verdict, onClose }) {
  // Determine what to display: final verdict takes priority over poll update
  const data = verdict || pollUpdate;

  const meta = useMemo(
    () => getVerdictMeta(data?.status),
    [data?.status]
  );

  if (!data) return null;

  const isTerminal = data.terminal || !!verdict;
  const progressPct = data.maxPolls && data.poll
    ? isTerminal
      ? 100
      : Math.min((data.poll / data.maxPolls) * 100, 98)
    : 0;

  return (
    <section className="verdict-panel">
      {/* Header */}
      <div className="verdict-panel__header">
        <h2 className="verdict-panel__title">Verdict</h2>
        <button
          className="verdict-panel__close"
          onClick={onClose}
          title="Close"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="verdict-progress">
        <div
          className={`verdict-progress__bar ${isTerminal ? `verdict-progress__bar--${meta.cls}` : ""}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Status text */}
      <div className={`verdict-status verdict-status--${meta.cls}`}>
        <span className="verdict-status__icon">{meta.icon}</span>
        <span className="verdict-status__text">
          {data.status || "Waiting…"}
        </span>
      </div>

      {/* Details (shown on terminal verdict) */}
      {isTerminal && data.id && (
        <div className="verdict-details">
          <div className="verdict-detail">
            <span className="verdict-detail__label">Submission ID</span>
            <span className="verdict-detail__value">{data.id || "—"}</span>
          </div>
          <div className="verdict-detail">
            <span className="verdict-detail__label">Time</span>
            <span className="verdict-detail__value">{data.time || "—"}</span>
          </div>
          <div className="verdict-detail">
            <span className="verdict-detail__label">Memory</span>
            <span className="verdict-detail__value">{data.mem || "—"}</span>
          </div>
          <div className="verdict-detail">
            <span className="verdict-detail__label">Language</span>
            <span className="verdict-detail__value">{data.lang || "—"}</span>
          </div>
        </div>
      )}
    </section>
  );
}
