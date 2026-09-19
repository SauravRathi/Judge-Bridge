/**
 * SubmitButton — Submit with spinner state and Ctrl+Enter shortcut hint.
 */
export default function SubmitButton({ onClick, disabled, isSubmitting }) {
  return (
    <button
      id="submit-btn"
      className="submit-btn"
      onClick={onClick}
      disabled={disabled || isSubmitting}
    >
      {isSubmitting ? (
        <>
          <div className="spinner" />
          <span>Submitting…</span>
        </>
      ) : (
        <>
          <svg
            className="submit-btn__icon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M3.105 2.29a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25H13.5a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.085l-1.414 4.926a.75.75 0 00.826.95 28.897 28.897 0 0015.293-7.155.75.75 0 000-1.112A28.897 28.897 0 003.105 2.289z" />
          </svg>
          <span>Submit Solution</span>
        </>
      )}
    </button>
  );
}
