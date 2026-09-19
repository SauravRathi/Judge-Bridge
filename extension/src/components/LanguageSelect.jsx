/**
 * LanguageSelect — Dropdown for selecting the submission language.
 * Groups C++ variants separately from other languages.
 */
export default function LanguageSelect({
  groupedLanguages,
  selectedLang,
  onSelect,
  loading,
  disabled,
  hasProblemCode,
}) {
  const isEmpty =
    !groupedLanguages ||
    (groupedLanguages.cpp.length === 0 && groupedLanguages.other.length === 0);

  const placeholder = loading
    ? "Loading languages…"
    : !hasProblemCode
      ? "Enter problem code first"
      : isEmpty
        ? "No languages available"
        : "— Select language —";

  return (
    <div className="field">
      <label htmlFor="language-select" className="field__label">
        Language
      </label>
      <div className="field__select-wrapper">
        <select
          id="language-select"
          className="field__select"
          value={selectedLang}
          onChange={(e) => onSelect(e.target.value)}
          disabled={disabled || loading || isEmpty}
        >
          <option value="">{placeholder}</option>

          {groupedLanguages.cpp.length > 0 && (
            <optgroup label="C++ (Recommended)">
              {groupedLanguages.cpp.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </optgroup>
          )}

          {groupedLanguages.other.length > 0 && (
            <optgroup label="Other Languages">
              {groupedLanguages.other.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <svg
          className="field__select-chevron"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          />
        </svg>
      </div>
    </div>
  );
}
