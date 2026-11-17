import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";

// Exam types for the Results Management pickers, from User Accounts →
// Exam Types (server). The built-in list is used until the server answers
// (or if it cannot be reached), so the pickers are never empty.
// Shown only until the real list arrives from the server (User Accounts -> Exam Types).
export const DEFAULT_EXAM_TYPES = ["Monthly Test", "Mid-Term Examination", "Terminal Examination", "Annual Examination", "Fitness Examination", "Good Neighborliness Examination Mikumbi & Mkoma", "Good Neighborliness Examination Mikumbi & Chihangu"];

export function useExamTypes(token) {
  const [types, setTypes] = useState(DEFAULT_EXAM_TYPES);
  useEffect(() => {
    let off = false;
    apiFetch("/exam-types", {}, token)
      .then((d) => { const names = (d.exam_types || []).map((t) => t.name); if (!off && names.length) setTypes(names); })
      .catch(() => {});
    return () => { off = true; };
  }, [token]);
  return types;
}
