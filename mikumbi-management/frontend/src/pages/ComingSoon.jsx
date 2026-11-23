import { THEME } from "../styles/theme";
import { useLang } from "../i18n";

export default function ComingSoon({ title }) {
  const { t } = useLang();
  return (
    <div style={{ padding: 40 }}>
      <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 8 }}>{title}</h2>
      <p style={{ color: THEME.muted, fontSize: 14 }}>{t("common.comingSoon")}</p>
    </div>
  );
}
