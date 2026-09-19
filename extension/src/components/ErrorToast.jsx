import { useEffect, useRef, useState } from "react";

/**
 * ErrorToast — Auto-dismissing error notification.
 */
export default function ErrorToast({ message, duration = 6000 }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (message) {
      setVisible(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), duration);
    } else {
      setVisible(false);
    }

    return () => clearTimeout(timerRef.current);
  }, [message, duration]);

  if (!visible || !message) return null;

  return (
    <div className="toast">
      <svg className="toast__icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}
