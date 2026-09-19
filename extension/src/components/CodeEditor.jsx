import { useRef, useMemo, useCallback } from "react";

/**
 * CodeEditor — Textarea with synchronized line numbers and Tab key support.
 */
export default function CodeEditor({ value, onChange, disabled }) {
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  // Compute line numbers string
  const lineNumbers = useMemo(() => {
    const count = (value || "").split("\n").length;
    return Array.from({ length: count }, (_, i) => i + 1).join("\n");
  }, [value]);

  // Sync scroll between line numbers and textarea
  const handleScroll = useCallback(() => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Handle Tab key — insert 4 spaces instead of moving focus
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          value.substring(0, start) + "    " + value.substring(end);

        onChange(newValue);

        // Restore cursor position after React re-renders
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 4;
        });
      }
    },
    [value, onChange]
  );

  return (
    <div className="field">
      <label htmlFor="source-code" className="field__label">
        Source Code
      </label>
      <div className="code-area">
        <div
          ref={lineNumbersRef}
          className="code-area__lines"
          aria-hidden="true"
        >
          {lineNumbers}
        </div>
        <textarea
          ref={textareaRef}
          id="source-code"
          className="code-area__textarea"
          placeholder="Paste your C++ code here..."
          spellCheck="false"
          autoComplete="off"
          rows={14}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
