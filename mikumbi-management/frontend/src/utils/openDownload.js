import { apiFetch, API_BASE } from "./api";
import { getLang } from "../i18n";

// Opens a PDF/download from the API in a new tab without putting the normal
// sign-in token in the address (addresses are kept in browser history and
// server logs). A 2-minute download token is fetched first. The tab is opened
// straight away (inside the click) so pop-up blockers allow it, then pointed
// at the file once the token arrives.
export async function openDownload(path, token) {
  const tab = window.open("", "_blank");
  try {
    const { token: dl } = await apiFetch("/auth/download-token", { method: "POST" }, token);
    const sep = path.includes("?") ? "&" : "?";
    const url = `${API_BASE}${path}${sep}token=${encodeURIComponent(dl)}&lang=${getLang()}`;
    if (tab) tab.location.href = url; else window.location.href = url;
  } catch (err) {
    if (tab) tab.close();
    throw err;
  }
}
