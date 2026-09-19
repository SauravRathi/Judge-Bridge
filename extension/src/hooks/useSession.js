import { useState, useEffect } from "react";
import { sendMessage, storage } from "../services/chromeMessaging";

/**
 * Hook to validate the SPOJ session on mount.
 * Returns { valid, username, loading, error, recheck }.
 */
export default function useSession() {
  const [state, setState] = useState({
    valid: false,
    username: null,
    loading: true,
    error: null,
  });

  async function checkSession() {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await sendMessage({ action: "VALIDATE_SESSION" });

      if (result.valid) {
        // Persist username for later use
        if (result.username) {
          await storage.set({ spojUsername: result.username });
        }

        setState({
          valid: true,
          username: result.username,
          loading: false,
          error: null,
        });
      } else {
        setState({
          valid: false,
          username: null,
          loading: false,
          error: result.error || "Session invalid.",
        });
      }
    } catch (err) {
      setState({
        valid: false,
        username: null,
        loading: false,
        error: err.message,
      });
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  return { ...state, recheck: checkSession };
}
