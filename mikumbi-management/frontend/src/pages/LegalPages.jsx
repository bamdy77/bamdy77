// i18n-scan: bilingual-document (each text exists in English AND Kiswahili below)
import { Link } from "react-router-dom";
import { THEME, SCHOOL } from "../styles/theme";
import LegalDoc, { ul, li } from "../components/LegalDoc";
import { siteConfig, toTelHref } from "../config/siteConfig";
import { useLang } from "../i18n";
import { StaffLangToggle } from "../i18n/StaffLang";

// Privacy / Terms / Support for the STAFF site, in English and Kiswahili
// (the Kiswahili text is a careful translation of the English one; review it
// with the school before treating it as the official wording). The parents'
// versions are in pages/public/PublicLegal.jsx. Keep all of them in line with
// what the system really does.
const UPDATED = { en: "16 November 2026", sw: "16 Novemba 2026" };
const tabsFor = (sw) => [
  { to: "/privacy", label: sw ? "Sera ya Faragha" : "Privacy Policy" },
  { to: "/terms", label: sw ? "Masharti ya Matumizi" : "Terms of Use" },
  { to: "/support", label: sw ? "Msaada" : "Help & Support" },
];
const labelsFor = (sw) => ({ updated: sw ? "Imesasishwa" : "Last updated", contents: sw ? "Yaliyomo" : "Contents", tabsLabel: sw ? "Kurasa za sera" : "Policy pages" });
const contactFor = (sw) => ({
  title: sw ? "Wasiliana na wasimamizi wa mfumo" : "Contact the system administrators",
  body: <>{sw ? "Mkuu wa Shule na Makamu Mkuu wa Shule ndio wanaosimamia akaunti zote za walimu." : "The Head Master and the Second Master manage all staff accounts."}<br />
    {sw ? "Simu" : "Phone"}: {siteConfig.phones.map((p, i) => <span key={p}>{i ? ", " : ""}<a href={toTelHref(p)} style={{ color: "inherit", fontWeight: 700 }}>{p}</a></span>)}<br />
    {sw ? "Barua pepe" : "Email"}: <a href={`mailto:${siteConfig.email}`} style={{ color: "inherit", fontWeight: 700 }}>{siteConfig.email}</a></>,
});

function LegalShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: THEME.bg }}>
      <nav style={{ background: THEME.navy, padding: "14px 24px", display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between" }}>
        <Link to="/" style={{ color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>← {SCHOOL.name}</Link>
        <StaffLangToggle />
      </nav>
      {children}
    </div>
  );
}
const P = ({ children }) => <p style={{ margin: 0 }}>{children}</p>;
function useDoc() {
  const { lang } = useLang();
  const sw = lang === "sw";
  return { sw, common: { tabs: tabsFor(sw), labels: labelsFor(sw), updated: UPDATED[lang], contact: contactFor(sw) } };
}

export function PrivacyPolicy() {
  const { sw, common } = useDoc();
  if (sw) return (
    <LegalShell>
      <LegalDoc {...common} title="Sera ya Faragha"
        summary="Mfumo huu wa walimu unahifadhi kumbukumbu za wanafunzi, matokeo, mahudhurio na fedha za shule. Unakusanya tu kile ambacho shule inahitaji, unamwonyesha kila mtu kile tu ambacho jukumu lake linahitaji, na kamwe hauuzi wala kushirikisha taarifa."
        sections={[
          { id: "what", title: "Taarifa zilizo kwenye mfumo", body: <ul style={ul}>
            <li style={li}><b>Wanafunzi:</b> majina, kidato, jinsia, mawasiliano ya mzazi/mlezi, namba za usajili na za kuingia kwenye matokeo, picha, bweni, kumbukumbu za michango na chakula, na matokeo ya mitihani.</li>
            <li style={li}><b>Walimu:</b> majina, majina ya watumiaji, majukumu, masomo, simu/barua pepe, picha ya wasifu, na mahudhurio ya TAMS (muda, umbali wa GPS kutoka shuleni, kifaa).</li>
            <li style={li}><b>Nyaraka:</b> sahihi ya Mkuu wa Shule, muhuri wa shule na sahihi za Walimu wa Darasa, zinazotumika kwenye nyaraka rasmi tu.</li>
            <li style={li}><b>Mapendeleo:</b> mandhari, aina ya herufi na lugha. Aina ya herufi na lugha unazochagua huhifadhiwa kwenye akaunti yako ili zikufuate kwenye vifaa vingine.</li>
          </ul> },
          { id: "why", title: "Zinavyotumika", body: <P>Kwa ajili ya kuendesha shule tu: kumbukumbu za taaluma na matokeo, mahudhurio, ratiba, bweni, michango, mawasiliano na wazazi, na nyaraka rasmi. Namba za simu za wazazi/walezi zinatumika tu kwa jumbe za mwanafunzi husika na kama nenosiri la mzazi kwenye matokeo.</P> },
          { id: "who", title: "Nani anaona nini", body: <ul style={ul}>
            <li style={li}>Ruhusa zinategemea jukumu: kila jukumu (Mkuu wa Shule, Makamu Mkuu wa Shule, Mwalimu wa Taaluma, Mwalimu wa Darasa, Mwalimu, Mlezi, Mwalimu wa Chakula) linaona sehemu zake tu.</li>
            <li style={li}>Mwalimu wa Darasa anaona darasa lake tu; Mwalimu anaingiza alama za masomo na vidato vyake tu.</li>
            <li style={li}>Wazazi wanaona matokeo yaliyochapishwa ya mtoto wao tu kwenye tovuti ya wazazi, kwa kusoma tu.</li>
            <li style={li}>Shughuli nyeti zinarekodiwa kwenye Kumbukumbu za Shughuli (Audit Log).</li>
          </ul> },
          { id: "security", title: "Zinavyolindwa", body: <ul style={ul}>
            <li style={li}>Muunganisho salama (HTTPS), manenosiri yaliyofichwa (hashed) na hifadhidata yenye ulinzi; mipangilio nyeti imesimbwa (encrypted).</li>
            <li style={li}>Akaunti hufungwa kwa dakika 15 baada ya kukosea nenosiri mara 8. Kubadilisha nenosiri humtoa mtu kwenye vifaa vingine vyote.</li>
            <li style={li}>Kuingia kunaisha baada ya saa 12, au baada ya dakika 30 bila kutumia mfumo.</li>
            <li style={li}>Akaunti za Mkuu wa Shule, Makamu Mkuu wa Shule na Mwalimu wa Taaluma zinahitaji namba inayotumwa kwenye barua pepe zinapoingia kutoka kifaa kipya.</li>
            <li style={li}>Hifadhidata hunakiliwa (backup) kila siku yenyewe, husimbwa na kuhifadhiwa nje ya hifadhidata.</li>
            <li style={li}>Mipaka ya maombi inalinda mfumo dhidi ya mashambulizi ya kiotomatiki.</li>
            <li style={li}>QR code zilizo kwenye nyaraka zinaonyesha taarifa kamili kwa nyaraka halisi zilizotolewa na shule tu.</li>
          </ul> },
          { id: "retention", title: "Muda wa kuhifadhi kumbukumbu", body: <P>Kumbukumbu za taaluma na mahudhurio huhifadhiwa kama kumbukumbu rasmi za shule. Kumbukumbu za wanafunzi waliohitimu huondolewa zenyewe baada ya muda uliowekwa na shule. Nakala za akiba za kila siku zilizosimbwa huhifadhiwa kwa siku 14 kisha hufutwa zenyewe.</P> },
          { id: "rights", title: "Marekebisho", body: <P>Kama kumbukumbu yoyote kukuhusu wewe au mwanafunzi si sahihi, mwombe Mkuu wa Shule au Makamu Mkuu wa Shule airekebishe.</P> },
          { id: "changes", title: "Mabadiliko", body: <P>Sera hii husasishwa mfumo unapobadilika. Tarehe iliyo juu inaonyesha toleo la sasa.</P> },
        ]} />
    </LegalShell>
  );
  return (
    <LegalShell>
      <LegalDoc {...common} title="Privacy Policy"
        summary="This staff system holds the school's student, results, attendance and finance records. It collects only what the school needs, shows each person only what their role requires, and never sells or shares data."
        sections={[
          { id: "what", title: "What the system holds", body: <ul style={ul}>
            <li style={li}><b>Students:</b> names, form, gender, guardian contacts, admission and results login numbers, photos, hostel, contribution and food records, and exam results.</li>
            <li style={li}><b>Staff:</b> names, usernames, roles, subjects, phone/email, profile photo, and TAMS attendance (time, GPS distance from school, device).</li>
            <li style={li}><b>Documents:</b> the Head Master's signature, the school stamp and Class Teachers' signatures, used only on official documents.</li>
            <li style={li}><b>Preferences:</b> theme, font and language. Your font and language choices are saved on your account so they follow you to other devices.</li>
          </ul> },
          { id: "why", title: "Why it is used", body: <P>Only to run the school: academic records and results, attendance, timetable, hostel, contributions, communication with parents, and official documents. Guardian phone numbers are used only for that student's own messages and as the parent's results password.</P> },
          { id: "who", title: "Who can see what", body: <ul style={ul}>
            <li style={li}>Access is role-based: each role (Head Master, Second Master, Academic Master, Class Teacher, Teacher, Patron/Matron, Food Teacher) sees only its own modules.</li>
            <li style={li}>A Class Teacher sees only their own class; a Teacher enters scores only for their own subjects and forms.</li>
            <li style={li}>Parents see only their own child's published results on the parents' website, view-only.</li>
            <li style={li}>Sensitive actions are recorded in the Audit Log.</li>
          </ul> },
          { id: "security", title: "How it is protected", body: <ul style={ul}>
            <li style={li}>Encrypted connection (HTTPS), hashed passwords and a protected database; sensitive settings are encrypted.</li>
            <li style={li}>Accounts lock for 15 minutes after 8 wrong passwords. Changing a password signs out every other session.</li>
            <li style={li}>A sign-in ends after 12 hours, or after 30 minutes without using the system.</li>
            <li style={li}>Head Master, Second Master and Academic Master accounts need a code sent to their email when signing in from a new device.</li>
            <li style={li}>The database is backed up automatically every day, encrypted, and kept outside the database.</li>
            <li style={li}>Request limits protect the system from automated attacks.</li>
            <li style={li}>QR codes on documents show full details only for genuine, school-issued documents.</li>
          </ul> },
          { id: "retention", title: "How long records are kept", body: <P>Academic and attendance records are kept as official school records. Graduated students' records are removed automatically after the retention period set by the school. Encrypted daily backups are kept for 14 days and then deleted automatically.</P> },
          { id: "rights", title: "Corrections", body: <P>If any record about you or a student is wrong, ask the Head Master or Second Master to correct it.</P> },
          { id: "changes", title: "Changes", body: <P>This policy is updated when the system changes. The date at the top shows the current version.</P> },
        ]} />
    </LegalShell>
  );
}

export function TermsOfService() {
  const { sw, common } = useDoc();
  if (sw) return (
    <LegalShell>
      <LegalDoc {...common} title="Masharti ya Matumizi"
        summary="Mfumo huu ni kwa ajili ya walimu na watumishi walioidhinishwa wa Shule ya Sekondari Mikumbi tu. Kwa kuingia, unakubali kuutumia kwa uaminifu na kulinda taarifa za wanafunzi."
        sections={[
          { id: "accounts", title: "Akaunti yako", body: <ul style={ul}>
            <li style={li}>Akaunti hufunguliwa na Mkuu wa Shule au Makamu Mkuu wa Shule tu, na ni ya mtu binafsi. Usimpe mtu yeyote nenosiri lako.</li>
            <li style={li}>Tumia nenosiri imara (angalau herufi 8, likiwa na herufi na namba) na utoke kwenye mfumo ukitumia kifaa cha pamoja.</li>
            <li style={li}>Ripoti mara moja kwa Mkuu wa Shule ukipoteza simu au ukishuku mtu ameingia kwenye akaunti yako.</li>
          </ul> },
          { id: "use", title: "Matumizi yanayokubalika", body: <ul style={ul}>
            <li style={li}>Tumia mfumo kwa kazi rasmi za shule tu na ndani ya jukumu lako tu.</li>
            <li style={li}>Usijaribu kufungua taarifa zilizo nje ya jukumu lako, na usinakili taarifa za wanafunzi nje ya mfumo bila ruhusa.</li>
            <li style={li}>Usiingize matokeo, mahudhurio, malipo au kumbukumbu za uongo.</li>
          </ul> },
          { id: "tams", title: "Mahudhurio (TAMS)", body: <P>Jiandikishe kwa ukweli, wewe mwenyewe, kutoka kwenye kifaa chako kilichosajiliwa, ukiwa ndani ya eneo la shule na ndani ya muda wa kujiandikisha. Kumwandikisha mtu mwingine au kudanganya mahali ulipo ni kosa kubwa.</P> },
          { id: "results", title: "Matokeo na nyaraka", body: <P>Ni majukumu yaliyoidhinishwa tu yanayoweza kuingiza, kuandaa, kuchapisha au kuficha matokeo. Kuchapisha matokeo kwa wazazi ni uamuzi wa Mkuu wa Shule. Sahihi na muhuri vinaweza kupakiwa tu na mtu aliyeidhinishwa, na huwekwa vyenyewe kwenye nyaraka rasmi.</P> },
          { id: "privacy", title: "Faragha ya wanafunzi", body: <P>Chukulia kila kumbukumbu ya mwanafunzi kuwa siri. Usishirikishe matokeo, namba za simu au picha kwenye mitandao ya kijamii au kwa mtu yeyote asiyestahili. Faili la nakala ya akiba (backup) lililopakuliwa lina kumbukumbu zote za shule na lazima liwekwe kwa siri.</P> },
          { id: "breach", title: "Kuvunja masharti haya", body: <P>Matumizi mabaya yanaweza kusababisha akaunti kusimamishwa na hatua za kinidhamu kwa mujibu wa kanuni za shule na za Serikali.</P> },
          { id: "changes", title: "Mabadiliko", body: <P>Shule inaweza kusasisha masharti haya kadiri mfumo unavyoboreshwa. Kuendelea kutumia mfumo kunamaanisha unakubali masharti yaliyosasishwa.</P> },
        ]} />
    </LegalShell>
  );
  return (
    <LegalShell>
      <LegalDoc {...common} title="Terms of Use"
        summary="This system is for authorized Mikumbi Secondary School staff only. By signing in you agree to use it honestly and to protect students' information."
        sections={[
          { id: "accounts", title: "Your account", body: <ul style={ul}>
            <li style={li}>Accounts are created only by the Head Master or Second Master and are personal. Never share your password.</li>
            <li style={li}>Use a strong password (at least 8 characters, with letters and numbers) and sign out on shared devices.</li>
            <li style={li}>Report a lost phone or a suspected break-in to the Head Master straight away.</li>
          </ul> },
          { id: "use", title: "Acceptable use", body: <ul style={ul}>
            <li style={li}>Use the system only for official school work and only within your role.</li>
            <li style={li}>Do not try to open data outside your role, and do not copy student data out of the system without permission.</li>
            <li style={li}>Do not enter false results, attendance, payments or records.</li>
          </ul> },
          { id: "tams", title: "Attendance (TAMS)", body: <P>Check in truthfully, yourself, from your own registered device, inside the school area and within the registration window. Checking in for someone else or faking your location is a serious offence.</P> },
          { id: "results", title: "Results and documents", body: <P>Only authorized roles may enter, compile, publish or hide results. Publishing results to parents is a decision of the Head Master. Signatures and the stamp may be uploaded only by the person authorized to do so, and are applied automatically to official documents.</P> },
          { id: "privacy", title: "Student privacy", body: <P>Treat every student record as confidential. Do not share results, phone numbers or photos on social media or with anyone not entitled to them. A downloaded backup file contains all school records and must be kept private.</P> },
          { id: "breach", title: "Breaking these terms", body: <P>Misuse may lead to the account being suspended and to disciplinary action under the school's and the Government's rules.</P> },
          { id: "changes", title: "Changes", body: <P>The school may update these terms as the system evolves. Continuing to use the system means you accept the updated terms.</P> },
        ]} />
    </LegalShell>
  );
}

export function SupportPage() {
  const { sw, common } = useDoc();
  if (sw) return (
    <LegalShell>
      <LegalDoc {...common} title="Msaada"
        summary="Majibu mafupi ya maswali yanayoulizwa mara kwa mara. Bonyeza swali kuona jibu lake. Ukishaingia, unaweza pia kumuuliza msaidizi wa mfumo (kitufe cha mazungumzo, chini kulia)."
        faqs={[
          { id: "account", title: "Kuingia", items: [
            { q: "Nimesahau nenosiri langu.", a: "Tumia \"Umesahau nenosiri?\" kwenye ukurasa wa kuingia na uandike barua pepe uliyosajiliwa nayo. Kama akaunti yako haina barua pepe bado, mwombe Mkuu wa Shule au Makamu Mkuu wa Shule aiweke kwenye Akaunti za Watumiaji." },
            { q: "Akaunti yangu imefungwa.", a: "Baada ya kukosea nenosiri mara 8, akaunti hufungwa kwa dakika 15. Subiri kisha ujaribu tena, au mwombe Mkuu wa Shule abadilishe nenosiri lako." },
            { q: "Nimetolewa kwenye mfumo ghafla.", a: "Mfumo humtoa mtu baada ya dakika 30 bila kutumika au baada ya saa 12. Pia nenosiri likibadilishwa (na wewe au msimamizi), vifaa vingine vyote hutolewa. Ingia upya." },
            { q: "Kwa nini naombwa namba ya kuthibitisha?", a: "Akaunti za Mkuu wa Shule, Makamu Mkuu wa Shule na Mwalimu wa Taaluma lazima zithibitishe namba yenye tarakimu 6 inayotumwa kwenye barua pepe zinapoingia kutoka kifaa kipya. Baada ya hapo kifaa hukumbukwa kwa siku 30. Kubadilisha nenosiri husahau vifaa vyote vilivyokumbukwa." },
            { q: "Sioni sehemu fulani ya mfumo.", a: "Sehemu unazoziona zinategemea jukumu lako. Mwombe Mkuu wa Shule au Makamu Mkuu wa Shule aangalie jukumu lako kwenye Akaunti za Watumiaji." },
          ] },
          { id: "tams", title: "Mahudhurio (TAMS)", items: [
            { q: "Siwezi kujiandikisha.", a: "Washa GPS (mahali), hakikisha uko ndani ya eneo la shule, na ujiandikishe ndani ya muda wa kujiandikisha (saa 12:00 hadi 2:00 asubuhi)." },
            { q: "Inasema kifaa hiki ni cha mwalimu mwingine.", a: "Kila kifaa kinaweza kumwandikisha mwalimu mmoja tu. Tumia simu yako mwenyewe, au muone Mkuu wa Shule." },
          ] },
          { id: "results", title: "Matokeo na nyaraka", items: [
            { q: "Mwalimu hawezi kuingiza alama.", a: "Hakikisha masomo na vidato vya mwalimu vimewekwa kwenye Akaunti za Watumiaji, na kwamba karatasi ya alama haijafungwa." },
            { q: "Sahihi au muhuri unaonekana vibaya kwenye ripoti.", a: "Upakie upya kwenye Mipangilio → Sahihi na Muhuri ukitumia picha safi kwenye karatasi nyeupe; mandharinyuma huondolewa yenyewe." },
            { q: "Namba ya Kuingia kwenye Matokeo ya mwanafunzi iko wapi?", a: "Kwenye Usimamizi wa Wanafunzi, fungua menyu ⋮ kwenye safu ya mwanafunzi na uchague \"Login No.\"." },
          ] },
          { id: "backup", title: "Nakala za akiba (Backup)", items: [
            { q: "Je, taarifa za shule zina nakala ya akiba?", a: "Ndiyo. Nakala kamili iliyosimbwa hutengenezwa yenyewe kila siku, na nakala 14 za mwisho huhifadhiwa nje ya hifadhidata. Mkuu wa Shule anaweza kuziona kwenye Mipangilio → Nakala ya Akiba (Backup)." },
            { q: "Ninawezaje kuwa na nakala yangu mwenyewe?", a: "Mkuu wa Shule: fungua Mipangilio → Nakala ya Akiba (Backup) na ubonyeze Pakua. Weka faili hilo kwa siri (kwa mfano kwenye flash disk ofisini); lina kumbukumbu zote za shule." },
            { q: "Je, nakala ya akiba inaweza kurudishwa kupitia tovuti?", a: "Hapana. Kurudisha nakala hubadilisha taarifa zilizopo, kwa hiyo hufanywa na msimamizi wa mfumo tu kwa kifaa maalum, baada ya kuikagua nakala kwanza." },
          ] },
          { id: "app", title: "Programu, mandhari, herufi na lugha", items: [
            { q: "Ninawezaje kusakinisha programu?", a: "Fungua ukurasa wa mwanzo wa tovuti ya walimu na ubonyeze \"Pakua Programu\". Kwenye iPhone, tumia kitufe cha Share cha Safari → \"Add to Home Screen\"." },
            { q: "Ninawezaje kubadilisha aina ya herufi, mandhari au lugha?", a: "Fungua Mipangilio (alama ya gia) → Aina ya herufi, Mandhari au Lugha. Aina ya herufi na lugha huhifadhiwa kwenye akaunti yako." },
          ] },
        ]} />
    </LegalShell>
  );
  return (
    <LegalShell>
      <LegalDoc {...common} title="Help & Support"
        summary="Quick answers to common questions. Tap a question to see its answer. You can also ask the system assistant (chat button, bottom right) once signed in."
        faqs={[
          { id: "account", title: "Signing in", items: [
            { q: "I forgot my password.", a: "Use \"Forgot Password\" on the login page and enter your registered email. If your account has no email yet, ask the Head Master or Second Master to add one in User Accounts." },
            { q: "My account is locked.", a: "After 8 wrong passwords the account locks for 15 minutes. Wait, then try again, or ask the Head Master to reset your password." },
            { q: "I was signed out suddenly.", a: "The system signs you out after 30 minutes without use or after 12 hours. Also, when a password is changed (by you or an administrator), every other session is signed out. Sign in again." },
            { q: "Why am I asked for a login code?", a: "The Head Master, Second Master and Academic Master accounts must confirm a 6-digit code sent to their email when signing in from a new device. The device is then remembered for 30 days. Changing your password forgets all remembered devices." },
            { q: "I can't see a module.", a: "Modules depend on your role. Ask the Head Master or Second Master to check your role in User Accounts." },
          ] },
          { id: "tams", title: "Attendance (TAMS)", items: [
            { q: "My check-in fails.", a: "Turn on GPS (location), make sure you are inside the school area, and check in during the registration window (6:00 to 8:00 AM)." },
            { q: "It says this device belongs to another teacher.", a: "Each device can check in only one teacher. Use your own phone, or ask the Head Master." },
          ] },
          { id: "results", title: "Results and documents", items: [
            { q: "A teacher can't enter scores.", a: "Check that the teacher's subjects and forms are set in User Accounts, and that the sheet is not locked." },
            { q: "The signature or stamp looks wrong on reports.", a: "Re-upload it in Settings → Signature & Stamp using a clear photo on plain white paper; the background is removed automatically." },
            { q: "Where is a student's Results Login Number?", a: "In Student Management, open the ⋮ menu on the student's row and choose \"Login No.\"." },
          ] },
          { id: "backup", title: "Backups", items: [
            { q: "Is the school's data backed up?", a: "Yes. A full, encrypted copy is made automatically every day and the last 14 are kept outside the database. The Head Master can see them in Settings → Database Backup." },
            { q: "How do I keep my own copy?", a: "Head Master: open Settings → Database Backup and press Download. Keep the file private (for example on a flash disk in the office); it contains all school records." },
            { q: "Can a backup be restored from the website?", a: "No. Restoring replaces the current data, so it is done only by the system administrator with the restore tool, after checking the backup first." },
          ] },
          { id: "app", title: "App, theme, font and language", items: [
            { q: "How do I install the app?", a: "Open the staff site home page and tap \"Download the App\". On iPhone, use Safari's Share button → \"Add to Home Screen\"." },
            { q: "How do I change the font, theme or language?", a: "Open Settings (gear icon) → Font, Theme or Language. Your font and language choices are saved on your account." },
          ] },
        ]} />
    </LegalShell>
  );
}
