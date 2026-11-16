import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { useLang, LangToggle } from "./index";

// Staff site only.
// A signed-in person's saved language (users.preferred_language, NULL =
// English) is applied after login and whenever /me refreshes, so it follows
// them to every device. Exception: if they picked a language on THIS device
// just before signing in (e.g. on the login page), that fresh choice wins
// and is saved to the account instead of being overwritten.
const PICKED_KEY = "mikumbi_lang_picked_before_login";

async function saveToAccount(token, language, updateUser) {
  const res = await apiFetch("/auth/preferences/language", { method: "PUT", body: JSON.stringify({ language }) }, token);
  updateUser({ preferred_language: res.preferred_language || language });
}

export function StaffLangSync() {
  const { user, token, updateUser } = useAuth();
  const { lang, setLang } = useLang();
  const saved = user && Object.prototype.hasOwnProperty.call(user, "preferred_language") ? (user.preferred_language || "en") : null;
  useEffect(() => {
    if (!saved || !token) return;
    let picked = null;
    try { picked = sessionStorage.getItem(PICKED_KEY); sessionStorage.removeItem(PICKED_KEY); } catch { /* ignore */ }
    if (picked && picked === lang && picked !== saved) {
      saveToAccount(token, picked, updateUser).catch(() => {});
      return;
    }
    setLang(saved);
  }, [user?.id, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// EN | SW switch for the staff site: changes the screen at once and, when
// signed in, saves the choice on the account (failure only means it is not
// remembered on other devices; this device keeps it).
export function StaffLangToggle({ dark = true }) {
  const { token, updateUser } = useAuth();
  const busy = useRef(false);
  const save = async (language) => {
    if (!token) { try { sessionStorage.setItem(PICKED_KEY, language); } catch { /* ignore */ } return; }
    if (busy.current) return;
    busy.current = true;
    try { await saveToAccount(token, language, updateUser); } catch { /* kept on this device only */ } finally { busy.current = false; }
  };
  return <LangToggle dark={dark} onChange={save} />;
}
