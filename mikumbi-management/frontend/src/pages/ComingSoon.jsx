import { THEME } from "../styles/theme";

export default function ComingSoon({ title }) {
  return (
    <div style={{ padding: 40 }}>
      <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 8 }}>{title}</h2>
      <p style={{ color: THEME.muted, fontSize: 14 }}>This section is coming soon.</p>
    </div>
  );
}
