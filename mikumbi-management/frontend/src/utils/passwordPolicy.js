// Same rule the server enforces (backend/src/utils/passwordPolicy.js) -
// checked here first so staff see the problem before submitting.
// The message is shown in the language on screen.
import { translate, getLang } from "../i18n";

export function passwordProblem(pw) {
  const s = String(pw || "");
  if (s.length < 8) return translate(getLang(), "pw.short");
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return translate(getLang(), "pw.mix");
  return null;
}
export const passwordHint = () => translate(getLang(), "pw.hint");
