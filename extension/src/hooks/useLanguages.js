import { useState, useEffect, useRef } from "react";
import { sendMessage } from "../services/chromeMessaging";

/**
 * Hook to fetch available languages for a SPOJ problem.
 * Debounces requests and caches hidden fields.
 *
 * @param {string} problemCode - The SPOJ problem code (e.g., "TEST")
 * @returns {{ languages, selectedLang, setSelectedLang, hiddenFields, loading, error }}
 */
export default function useLanguages(problemCode) {
  const [languages, setLanguages] = useState([]);
  const [selectedLang, setSelectedLang] = useState("");
  const [hiddenFields, setHiddenFields] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    // Clear on empty problem code
    if (!problemCode || !problemCode.trim()) {
      setLanguages([]);
      setSelectedLang("");
      setHiddenFields({});
      setError(null);
      return;
    }

    // Debounce the fetch by 600ms
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchLanguages(problemCode.trim().toUpperCase());
    }, 600);

    return () => clearTimeout(debounceRef.current);
  }, [problemCode]);

  async function fetchLanguages(code) {
    setLoading(true);
    setError(null);

    try {
      const result = await sendMessage({
        action: "FETCH_LANGUAGES",
        problemCode: code,
      });

      if (result.error) {
        setLanguages([]);
        setSelectedLang("");
        setError(result.error);
        setLoading(false);
        return;
      }

      setHiddenFields(result.hiddenFields || {});

      // Sort: C++ first, then rest alphabetically
      const cppLangs = result.languages.filter((l) =>
        l.name.toLowerCase().includes("c++")
      );
      const otherLangs = result.languages.filter(
        (l) => !l.name.toLowerCase().includes("c++")
      );
      cppLangs.sort((a, b) => a.name.localeCompare(b.name));
      otherLangs.sort((a, b) => a.name.localeCompare(b.name));

      const sorted = [...cppLangs, ...otherLangs];
      setLanguages(sorted);

      // Auto-select C++17 > C++14 > first C++
      const cpp17 = cppLangs.find((l) => l.name.includes("17"));
      const cpp14 = cppLangs.find((l) => l.name.includes("14"));
      const defaultLang = cpp17 || cpp14 || cppLangs[0] || sorted[0];
      if (defaultLang) {
        setSelectedLang(defaultLang.id);
      }
    } catch (err) {
      setError(err.message);
      setLanguages([]);
      setSelectedLang("");
    }

    setLoading(false);
  }

  // Helper to group languages for the select dropdown
  const groupedLanguages = {
    cpp: languages.filter((l) => l.name.toLowerCase().includes("c++")),
    other: languages.filter((l) => !l.name.toLowerCase().includes("c++")),
  };

  return {
    languages,
    groupedLanguages,
    selectedLang,
    setSelectedLang,
    hiddenFields,
    loading,
    error,
  };
}
