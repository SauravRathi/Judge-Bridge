import { useState, useEffect, useCallback } from "react";
import { sendMessage, onMessage, storage } from "../services/chromeMessaging";

/**
 * Hook that manages the full submit → poll → save lifecycle.
 *
 * @returns {{
 *   isSubmitting: boolean,
 *   verdict: Object|null,
 *   pollUpdate: Object|null,
 *   error: string|null,
 *   submit: (params) => Promise<void>,
 *   reset: () => void,
 * }}
 */
export default function useSubmission() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [pollUpdate, setPollUpdate] = useState(null);
  const [error, setError] = useState(null);

  // Listen for streaming poll updates from the background service worker
  useEffect(() => {
    const cleanup = onMessage((message) => {
      if (message.type === "POLL_UPDATE") {
        setPollUpdate(message);

        if (message.terminal) {
          setVerdict(message);
        }
      }
    });

    return cleanup;
  }, []);

  /**
   * Submit a solution and poll for verdict.
   * @param {Object} params
   * @param {string} params.problemCode
   * @param {string} params.langId
   * @param {string} params.language - Human-readable language name
   * @param {string} params.sourceCode
   * @param {string} params.username
   * @param {Object} params.hiddenFields
   */
  const submit = useCallback(
    async ({ problemCode, langId, language, sourceCode, username, hiddenFields }) => {
      setIsSubmitting(true);
      setVerdict(null);
      setPollUpdate(null);
      setError(null);

      try {
        // Step 1: Submit to SPOJ
        const submitResult = await sendMessage({
          action: "SUBMIT",
          problemCode,
          langId,
          sourceCode,
          hiddenFields,
        });

        if (!submitResult.success) {
          setError(submitResult.error || "Submission failed.");
          setIsSubmitting(false);
          return;
        }

        // Step 2: Poll for verdict
        setPollUpdate({
          type: "POLL_UPDATE",
          poll: 0,
          maxPolls: 60,
          status: "Waiting for verdict…",
          terminal: false,
        });

        const verdictResult = await sendMessage({
          action: "POLL_VERDICT",
          username,
          problemCode,
          interval: 3000,
          maxPolls: 60,
        });

        setVerdict(verdictResult);

        if (verdictResult.error) {
          setError(verdictResult.error);
        }

        // Step 3: Save to backend (fire-and-forget)
        sendMessage({
          action: "SAVE_SUBMISSION",
          data: {
            submissionId: verdictResult.id,
            problemCode,
            language: language || "Unknown",
            languageId: langId,
            sourceCode,
            verdict: verdictResult.status,
            time: verdictResult.time,
            memory: verdictResult.mem,
            username,
          },
        }).catch(() => {
          // Backend might be offline — that's fine
          console.warn("Could not save submission to backend.");
        });
      } catch (err) {
        setError(err.message);
      }

      setIsSubmitting(false);
    },
    []
  );

  const reset = useCallback(() => {
    setVerdict(null);
    setPollUpdate(null);
    setError(null);
  }, []);

  return {
    isSubmitting,
    verdict,
    pollUpdate,
    error,
    submit,
    reset,
  };
}
