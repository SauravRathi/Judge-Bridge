import SessionBadge from "./SessionBadge";

/**
 * Header — Brand logo, title, and session badge.
 */
export default function Header({ session }) {
  return (
    <header className="header">
      <div className="header__brand">
        <img src="icons/icon48.png" alt="" className="header__icon" />
        <div>
          <h1 className="header__title">SPOJ Submitter</h1>
          <p className="header__subtitle">Proxy submission client</p>
        </div>
      </div>
      <SessionBadge
        valid={session.valid}
        username={session.username}
        loading={session.loading}
      />
    </header>
  );
}
