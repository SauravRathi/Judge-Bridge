/**
 * ProblemInput — Controlled text input for the SPOJ problem code.
 */
export default function ProblemInput({ value, onChange, disabled }) {
  return (
    <div className="field">
      <label htmlFor="problem-code" className="field__label">
        Problem Code
      </label>
      <input
        type="text"
        id="problem-code"
        className="field__input"
        placeholder="e.g. TEST, PRIME1"
        spellCheck="false"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
