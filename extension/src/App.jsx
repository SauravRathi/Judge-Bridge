import { useState, useEffect } from "react";
import Header from "./components/Header";
import ProblemInput from "./components/ProblemInput";
import LanguageSelect from "./components/LanguageSelect";
import CodeEditor from "./components/CodeEditor";
import SubmitButton from "./components/SubmitButton";
import VerdictPanel from "./components/VerdictPanel";
import ErrorToast from "./components/ErrorToast";

import useSession from "./hooks/useSession";
import useLanguages from "./hooks/useLanguages";
import useSubmission from "./hooks/useSubmission";
import { storage } from "./services/chromeMessaging";

export default function App() {
  const session = useSession();
  const [problemCode, setProblemCode] = useState("");
  const [sourceCode, setSourceCode] = useState("");

  const {
    groupedLanguages,
    selectedLang,
    setSelectedLang,
    hiddenFields,
    loading: languagesLoading,
    error: languagesError,
  } = useLanguages(problemCode);

  const {
    isSubmitting,
    verdict,
    pollUpdate,
    error: submissionError,
    submit,
    reset,
  } = useSubmission();

  // Load last problem code on mount
  useEffect(() => {
    storage.get(["lastProblemCode"]).then((data) => {
      if (data.lastProblemCode) {
        setProblemCode(data.lastProblemCode);
      }
    });
  }, []);

  // Save problem code on change
  useEffect(() => {
    if (problemCode) {
      storage.set({ lastProblemCode: problemCode });
    }
  }, [problemCode]);

  const handleSubmit = () => {
    if (isSubmitting) return;

    if (!session.valid) {
      return;
    }

    if (!problemCode || !selectedLang || !sourceCode.trim()) {
      return;
    }

    const languageName = (() => {
      for (const group of [groupedLanguages.cpp, groupedLanguages.other]) {
        const lang = group?.find((l) => l.id === selectedLang);
        if (lang) return lang.name;
      }
      return "Unknown";
    })();

    submit({
      problemCode,
      langId: selectedLang,
      language: languageName,
      sourceCode,
      username: session.username,
      hiddenFields,
    });
  };

  const isFormValid =
    session.valid && problemCode && selectedLang && sourceCode.trim();

  // Handle global errors
  const activeError = session.error || languagesError || submissionError;

  return (
    <div className="app">
      <Header session={session} />

      <main className="main">
        <ProblemInput
          value={problemCode}
          onChange={(val) => {
            setProblemCode(val);
            reset();
          }}
          disabled={isSubmitting}
        />

        <LanguageSelect
          groupedLanguages={groupedLanguages}
          selectedLang={selectedLang}
          onSelect={setSelectedLang}
          loading={languagesLoading}
          disabled={isSubmitting}
          hasProblemCode={!!problemCode}
        />

        <CodeEditor
          value={sourceCode}
          onChange={setSourceCode}
          disabled={isSubmitting}
        />

        <SubmitButton
          onClick={handleSubmit}
          disabled={!isFormValid}
          isSubmitting={isSubmitting}
        />
      </main>

      {(pollUpdate || verdict) && (
        <VerdictPanel
          pollUpdate={pollUpdate}
          verdict={verdict}
          onClose={reset}
        />
      )}

      <ErrorToast message={activeError} />
    </div>
  );
}
