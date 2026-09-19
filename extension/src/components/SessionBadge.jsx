/**
 * SessionBadge — Shows the SPOJ session status.
 * Green dot + username when valid, red dot + "Not logged in" when invalid.
 */
export default function SessionBadge({ valid, username, loading }) {
  const statusClass = loading
    ? "session-badge--loading"
    : valid
      ? "session-badge--valid"
      : "session-badge--invalid";

  const label = loading
    ? "Checking…"
    : valid
      ? username || "Connected"
      : "Not logged in";

  return (
    <div className={`session-badge ${statusClass}`}>
      <span className="session-badge__dot" />
      <span className="session-badge__label">{label}</span>
    </div>
  );
}
