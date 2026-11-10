import PublicLayout from "../../components/public/PublicLayout";
import { useLang } from "../../i18n/publicLang";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { siteConfig } from "../../config/siteConfig";

// Privacy / Terms / Support pages for the PUBLIC (parents) website. These are
// written for parents and guardians - the staff-only versions live in
// pages/LegalPages.jsx and stay on the staff site. Kiswahili is the default.
const NAVY = "#0c426f";

function Shell({ title, children }) {
  const { isMobile } = useBreakpoint();
  return (
    <PublicLayout>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobile ? "30px 18px 50px" : "44px 24px 70px" }}>
        <h1 style={{ color: NAVY, fontSize: isMobile ? 23.5 : 27.5, fontWeight: 800, marginBottom: 18 }}>{title}</h1>
        <div style={{ color: "#0F172A", fontSize: 16, lineHeight: 1.8 }}>{children}</div>
      </div>
    </PublicLayout>
  );
}
const h2 = { color: NAVY, fontSize: 18.5, fontWeight: 700, marginTop: 24, marginBottom: 8 };
const phones = () => siteConfig.phones.join(", ");

export function PublicPrivacy() {
  const { lang } = useLang();
  if (lang === "en") {
    return (
      <Shell title="Privacy Policy">
        <p>This website lets parents and guardians check their child's published results and download Form One Joining Instructions.</p>
        <h2 style={h2}>What we collect</h2>
        <p>When you request a Joining Instruction we record the student's names, district, ward, village, Standard Seven exam number and year. When you check results you enter the student's Results Login Number and the guardian's phone number.</p>
        <h2 style={h2}>How we use it</h2>
        <p>Only to issue the Joining Instruction, prepare for the new intake and show you your own child's results. We never sell or share this information.</p>
        <h2 style={h2}>Contact</h2>
        <p>For any question about your information, contact the school: {phones()}.</p>
      </Shell>
    );
  }
  return (
    <Shell title="Sera ya Faragha">
      <p>Tovuti hii inawawezesha wazazi na walezi kuangalia matokeo ya mwanafunzi yaliyochapishwa na kupakua Maelekezo ya Kujiunga na Kidato cha Kwanza.</p>
      <h2 style={h2}>Taarifa tunazokusanya</h2>
      <p>Unapoomba Maelekezo ya Kujiunga tunahifadhi majina ya mwanafunzi, wilaya, kata, kijiji/mtaa, namba ya mtihani wa Darasa la Saba na mwaka aliomaliza. Unapoangalia matokeo unaandika Namba ya Kuingia ya mwanafunzi na namba ya simu ya mzazi/mlezi.</p>
      <h2 style={h2}>Tunavyozitumia</h2>
      <p>Kwa ajili ya kutoa Maelekezo ya Kujiunga, kujiandaa kupokea wanafunzi wapya na kukuonyesha matokeo ya mwanao pekee. Hatuuzi wala hatushirikishi taarifa hizi kwa mtu mwingine.</p>
      <h2 style={h2}>Mawasiliano</h2>
      <p>Kwa swali lolote kuhusu taarifa zako, wasiliana na shule: {phones()}.</p>
    </Shell>
  );
}

export function PublicTerms() {
  const { lang } = useLang();
  if (lang === "en") {
    return (
      <Shell title="Terms of Service">
        <p>By using this website you agree to enter true information about the student. Results are shown only to the parent/guardian who knows the student's Results Login Number and the guardian phone number registered at the school.</p>
        <h2 style={h2}>Joining Instructions</h2>
        <p>Each student may download a Joining Instruction a limited number of times. The school may refuse a student whose details are false.</p>
        <h2 style={h2}>Changes</h2>
        <p>The school may update these terms at any time.</p>
      </Shell>
    );
  }
  return (
    <Shell title="Masharti ya Matumizi">
      <p>Kwa kutumia tovuti hii unakubali kuandika taarifa za kweli kuhusu mwanafunzi. Matokeo yanaonyeshwa kwa mzazi/mlezi anayefahamu Namba ya Kuingia ya mwanafunzi na namba ya simu ya mzazi iliyosajiliwa shuleni.</p>
      <h2 style={h2}>Maelekezo ya Kujiunga</h2>
      <p>Kila mwanafunzi anaweza kupakua Maelekezo ya Kujiunga kwa idadi maalum ya mara. Shule inaweza kumkataa mwanafunzi ambaye taarifa zake si za kweli.</p>
      <h2 style={h2}>Mabadiliko</h2>
      <p>Shule inaweza kubadilisha masharti haya wakati wowote.</p>
    </Shell>
  );
}

export function PublicSupport() {
  const { lang } = useLang();
  if (lang === "en") {
    return (
      <Shell title="Support">
        <ul style={{ paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Can't log in to Results? Use the Results Login Number (e.g. 2026-48319) printed on the Parent Report, and the guardian phone number given when the student was registered.</li>
          <li style={{ marginBottom: 8 }}>The Joining Instruction form says it is not published yet? The school will open it when admissions start - please check again later.</li>
          <li style={{ marginBottom: 8 }}>Still need help? Call the school: {phones()}.</li>
        </ul>
      </Shell>
    );
  }
  return (
    <Shell title="Msaada">
      <ul style={{ paddingLeft: 20 }}>
        <li style={{ marginBottom: 8 }}>Huwezi kuingia kwenye Matokeo? Tumia Namba ya Kuingia (mfano 2026-48319) iliyopo kwenye Ripoti ya Mzazi, na namba ya simu ya mzazi/mlezi iliyotolewa wakati mwanafunzi anasajiliwa.</li>
        <li style={{ marginBottom: 8 }}>Fomu ya Maelekezo ya Kujiunga inasema bado haijachapishwa? Shule itaifungua muda wa usajili ukifika - tafadhali angalia tena baadaye.</li>
        <li style={{ marginBottom: 8 }}>Bado unahitaji msaada? Piga simu shuleni: {phones()}.</li>
      </ul>
    </Shell>
  );
}
