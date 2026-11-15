import PublicLayout from "../../components/public/PublicLayout";
import LegalDoc, { ul, li } from "../../components/LegalDoc";
import { useLang } from "../../i18n/publicLang";
import { siteConfig, toTelHref } from "../../config/siteConfig";
import { SCHOOL } from "../../styles/theme";

// Privacy / Terms / Support for the PARENTS' website (Kiswahili default,
// full English when EN is chosen). The staff versions are in
// pages/LegalPages.jsx. Keep both in line with what the system really does.
const UPDATED = { sw: "15 Novemba 2026", en: "15 November 2026" };

const tabsFor = (sw) => [
  { to: "/privacy", label: sw ? "Sera ya Faragha" : "Privacy Policy" },
  { to: "/terms", label: sw ? "Masharti ya Matumizi" : "Terms of Use" },
  { to: "/support", label: sw ? "Msaada" : "Help & Support" },
];
const labelsFor = (sw) => ({ updated: sw ? "Imesasishwa" : "Last updated", contents: sw ? "Yaliyomo" : "Contents", tabsLabel: sw ? "Kurasa za sera" : "Policy pages" });

function Phones() {
  return siteConfig.phones.map((p, i) => (
    <span key={p}>{i ? ", " : ""}<a href={toTelHref(p)} style={{ color: "inherit", fontWeight: 700 }}>{p}</a></span>
  ));
}
function Email() { return <a href={`mailto:${siteConfig.email}`} style={{ color: "inherit", fontWeight: 700 }}>{siteConfig.email}</a>; }
const contactFor = (sw) => ({
  title: sw ? "Wasiliana na shule" : "Contact the school",
  body: <>{sw ? "Simu" : "Phone"}: <Phones /><br />{sw ? "Barua pepe" : "Email"}: <Email /><br />{sw ? "Anwani" : "Address"}: {SCHOOL.poBox}, {SCHOOL.region}</>,
});

export function PublicPrivacy() {
  const { lang } = useLang(); const sw = lang !== "en";
  const sections = sw ? [
    { id: "nini", title: "Taarifa tunazokusanya", body: <>
      <p style={{ margin: 0 }}>Tunakusanya taarifa chache tu zinazohitajika:</p>
      <ul style={ul}>
        <li style={li}><b>Maelekezo ya Kujiunga:</b> majina ya mwanafunzi, wilaya, kata, mtaa/kijiji, namba ya mtihani wa Darasa la Saba na mwaka aliomaliza.</li>
        <li style={li}><b>Matokeo:</b> Namba ya Kuingia ya mwanafunzi na namba ya simu ya mzazi/mlezi (inatumika kuthibitisha tu, haihifadhiwi upya).</li>
        <li style={li}><b>Mipangilio ya kifaa chako:</b> lugha na aina ya herufi unazochagua huhifadhiwa kwenye kivinjari chako tu, si kwenye seva ya shule.</li>
      </ul></> },
    { id: "matumizi", title: "Tunavyotumia taarifa hizi", body: <ul style={ul}>
      <li style={li}>Kutoa Maelekezo ya Kujiunga yenye jina la mwanafunzi na kujiandaa kupokea wanafunzi wapya.</li>
      <li style={li}>Kukuonyesha matokeo ya mwanao peke yake, baada ya kuthibitisha kuwa ni wewe.</li>
      <li style={li}>Kulinda tovuti dhidi ya matumizi mabaya (kwa mfano kuzuia majaribio mengi ya kuingia).</li>
    </ul> },
    { id: "kushirikisha", title: "Hatuuzi wala kushirikisha taarifa", body: <p style={{ margin: 0 }}>Taarifa zako haziuzwi, hazitolewi kwa matangazo, wala kwa mtu mwingine yeyote nje ya shule, isipokuwa pale sheria au mamlaka za elimu za Serikali zinapohitaji.</p> },
    { id: "ulinzi", title: "Jinsi tunavyolinda taarifa", body: <ul style={ul}>
      <li style={li}>Tovuti inatumia muunganisho salama (HTTPS) na data huhifadhiwa kwenye hifadhidata yenye ulinzi.</li>
      <li style={li}>Kuingia kwenye matokeo kunahitaji namba mbili; baada ya majaribio mengi yasiyo sahihi, kuingia husimamishwa kwa muda.</li>
      <li style={li}>Matokeo ni ya kusoma tu: hayapakuliwi wala kuchapishwa, na yana alama (watermark) ya namba ya mwanafunzi.</li>
      <li style={li}>QR code iliyo kwenye nyaraka za shule huonyesha taarifa kamili tu kwa nyaraka halisi iliyotolewa na shule.</li>
    </ul> },
    { id: "muda", title: "Muda wa kuhifadhi", body: <p style={{ margin: 0 }}>Taarifa za maombi ya kujiunga huhifadhiwa kwa kipindi cha usajili wa mwaka husika. Kumbukumbu za matokeo huhifadhiwa kama sehemu ya kumbukumbu rasmi za shule.</p> },
    { id: "haki", title: "Haki zako", body: <p style={{ margin: 0 }}>Unaweza kuomba kuona au kusahihisha taarifa za mwanao kwa kuwasiliana na shule. Ukiona taarifa isiyo sahihi kwenye matokeo au Maelekezo ya Kujiunga, wasiliana nasi mara moja.</p> },
    { id: "watoto", title: "Taarifa za watoto", body: <p style={{ margin: 0 }}>Tovuti hii imeandaliwa kwa ajili ya wazazi na walezi. Taarifa za wanafunzi zinashughulikiwa kwa uangalifu maalum na zinaonyeshwa kwa mzazi/mlezi aliyethibitishwa tu.</p> },
    { id: "ramani", title: "Ramani", body: <p style={{ margin: 0 }}>Ramani iliyo kwenye ukurasa wa mwanzo inaonyeshwa na Google Maps. Ukiitumia, Google inaweza kupokea taarifa za kawaida za kivinjari kwa mujibu wa sera yake.</p> },
    { id: "mabadiliko", title: "Mabadiliko ya sera hii", body: <p style={{ margin: 0 }}>Shule inaweza kuboresha sera hii. Tarehe iliyo juu inaonyesha toleo la sasa.</p> },
  ] : [
    { id: "what", title: "What we collect", body: <>
      <p style={{ margin: 0 }}>We collect only the little we need:</p>
      <ul style={ul}>
        <li style={li}><b>Joining Instructions:</b> the student's names, district, ward, village/street, Standard Seven exam number and completion year.</li>
        <li style={li}><b>Results:</b> the student's Results Login Number and the parent/guardian phone number (used only to confirm it is you).</li>
        <li style={li}><b>Your device settings:</b> the language and font you choose are kept in your own browser, not on the school's server.</li>
      </ul></> },
    { id: "use", title: "How we use it", body: <ul style={ul}>
      <li style={li}>To issue Joining Instructions in the student's name and to prepare for new students.</li>
      <li style={li}>To show you your own child's results only, after confirming it is you.</li>
      <li style={li}>To protect the website from misuse (for example, blocking repeated login attempts).</li>
    </ul> },
    { id: "share", title: "We do not sell or share it", body: <p style={{ margin: 0 }}>Your information is not sold, not used for advertising and not given to anyone outside the school, except where the law or the Government education authorities require it.</p> },
    { id: "protect", title: "How we protect it", body: <ul style={ul}>
      <li style={li}>The website uses a secure connection (HTTPS) and data is kept in a protected database.</li>
      <li style={li}>Results need two numbers to open; after too many wrong attempts, logging in is paused for a while.</li>
      <li style={li}>Results are view-only: they cannot be downloaded or printed, and carry a watermark with the student's number.</li>
      <li style={li}>The QR code on school documents shows full details only for a genuine document issued by the school.</li>
    </ul> },
    { id: "keep", title: "How long we keep it", body: <p style={{ margin: 0 }}>Joining applications are kept for that year's admission period. Results are kept as part of the school's official records.</p> },
    { id: "rights", title: "Your rights", body: <p style={{ margin: 0 }}>You may ask to see or correct your child's information by contacting the school. If you notice anything wrong in the results or the Joining Instructions, please contact us straight away.</p> },
    { id: "children", title: "Children's information", body: <p style={{ margin: 0 }}>This website is for parents and guardians. Students' information is handled with special care and shown only to a verified parent/guardian.</p> },
    { id: "map", title: "Map", body: <p style={{ margin: 0 }}>The map on the home page is provided by Google Maps. If you use it, Google may receive standard browser information under its own policy.</p> },
    { id: "changes", title: "Changes to this policy", body: <p style={{ margin: 0 }}>The school may improve this policy. The date at the top shows the current version.</p> },
  ];
  return (
    <PublicLayout>
      <LegalDoc tabs={tabsFor(sw)} labels={labelsFor(sw)} updated={UPDATED[sw ? "sw" : "en"]} contact={contactFor(sw)}
        title={sw ? "Sera ya Faragha" : "Privacy Policy"}
        summary={sw ? "Kwa ufupi: tunakusanya taarifa chache tu zinazohitajika kutoa Maelekezo ya Kujiunga na kukuonyesha matokeo ya mwanao. Hatuuzi wala kushirikisha taarifa hizi."
          : "In short: we collect only what is needed to issue Joining Instructions and show you your child's results. We never sell or share this information."}
        sections={sections} />
    </PublicLayout>
  );
}

export function PublicTerms() {
  const { lang } = useLang(); const sw = lang !== "en";
  const sections = sw ? [
    { id: "kukubali", title: "Kukubali masharti", body: <p style={{ margin: 0 }}>Kwa kutumia tovuti hii unakubali masharti haya. Kama huyakubali, tafadhali usitumie huduma zake.</p> },
    { id: "kweli", title: "Taarifa za kweli", body: <p style={{ margin: 0 }}>Unapojaza fomu ya Maelekezo ya Kujiunga, andika taarifa za kweli za mwanafunzi. Shule inaweza kumkataa au kumhakiki upya mwanafunzi ambaye taarifa zake si sahihi.</p> },
    { id: "matokeo", title: "Matumizi ya Matokeo", body: <ul style={ul}>
      <li style={li}>Matokeo yanaonyeshwa kwa mzazi/mlezi wa mwanafunzi husika peke yake. Usimpe mtu mwingine Namba ya Kuingia.</li>
      <li style={li}>Matokeo ni ya kusoma tu. Hairuhusiwi kuyapakua, kuyachapisha, kuyanakili au kuyasambaza.</li>
      <li style={li}>Kila ukurasa wa matokeo una alama (watermark) inayoonyesha namba ya mwanafunzi na muda wa kuangalia.</li>
      <li style={li}>Matokeo rasmi ni yale yaliyoko kwenye kumbukumbu za shule. Ukiona tofauti, wasiliana na shule.</li>
    </ul> },
    { id: "kujiunga", title: "Maelekezo ya Kujiunga", body: <p style={{ margin: 0 }}>Kila mwanafunzi anaweza kupakua Maelekezo ya Kujiunga mara 5. Hati yenye QR code ndiyo halali; usiibadilishe.</p> },
    { id: "marufuku", title: "Matumizi yasiyoruhusiwa", body: <ul style={ul}>
      <li style={li}>Kujaribu kuingia kwenye matokeo ya mwanafunzi mwingine.</li>
      <li style={li}>Kujaribu kudukua, kuvuruga au kuzidisha mzigo kwa tovuti.</li>
      <li style={li}>Kughushi au kubadilisha nyaraka zinazotolewa na tovuti.</li>
    </ul> },
    { id: "huduma", title: "Upatikanaji wa huduma", body: <p style={{ margin: 0 }}>Tunajitahidi tovuti ipatikane muda wote, lakini inaweza kusimama kwa muda kwa ajili ya matengenezo au matatizo ya mtandao.</p> },
    { id: "mabadiliko", title: "Mabadiliko", body: <p style={{ margin: 0 }}>Shule inaweza kubadilisha masharti haya wakati wowote. Kuendelea kutumia tovuti kunamaanisha unakubali masharti yaliyosasishwa.</p> },
  ] : [
    { id: "accept", title: "Accepting these terms", body: <p style={{ margin: 0 }}>By using this website you accept these terms. If you do not accept them, please do not use its services.</p> },
    { id: "true", title: "Correct information", body: <p style={{ margin: 0 }}>When you fill in the Joining Instructions form, enter the student's true details. The school may refuse or re-check a student whose details are wrong.</p> },
    { id: "results", title: "Using the Results", body: <ul style={ul}>
      <li style={li}>Results are shown only to the parent/guardian of that student. Do not give the Login Number to anyone else.</li>
      <li style={li}>Results are view-only. Downloading, printing, copying or sharing them is not allowed.</li>
      <li style={li}>Every results page carries a watermark showing the student's number and the viewing time.</li>
      <li style={li}>The official results are those in the school's records. If you notice a difference, contact the school.</li>
    </ul> },
    { id: "joining", title: "Joining Instructions", body: <p style={{ margin: 0 }}>Each student may download the Joining Instructions up to 5 times. The document with the QR code is the genuine one; do not alter it.</p> },
    { id: "forbidden", title: "What is not allowed", body: <ul style={ul}>
      <li style={li}>Trying to open another student's results.</li>
      <li style={li}>Trying to hack, disrupt or overload the website.</li>
      <li style={li}>Forging or altering documents issued by the website.</li>
    </ul> },
    { id: "availability", title: "Service availability", body: <p style={{ margin: 0 }}>We aim to keep the website available at all times, but it may pause for maintenance or network problems.</p> },
    { id: "changes", title: "Changes", body: <p style={{ margin: 0 }}>The school may change these terms at any time. Continuing to use the website means you accept the updated terms.</p> },
  ];
  return (
    <PublicLayout>
      <LegalDoc tabs={tabsFor(sw)} labels={labelsFor(sw)} updated={UPDATED[sw ? "sw" : "en"]} contact={contactFor(sw)}
        title={sw ? "Masharti ya Matumizi" : "Terms of Use"}
        summary={sw ? "Tovuti hii ni kwa wazazi, walezi na wanafunzi wapya. Tafadhali itumie kwa uaminifu na kulinda taarifa za mwanao."
          : "This website is for parents, guardians and new students. Please use it honestly and keep your child's information safe."}
        sections={sections} />
    </PublicLayout>
  );
}

export function PublicSupport() {
  const { lang } = useLang(); const sw = lang !== "en";
  const faqs = sw ? [
    { id: "matokeo", title: "Matokeo", items: [
      { q: "Nitaingiaje kuangalia matokeo?", a: "Fungua Machapisho → Matokeo. Andika Namba ya Kuingia ya mwanafunzi, kisha namba ya simu ya mzazi/mlezi iliyosajiliwa shuleni." },
      { q: "Sina Namba ya Kuingia.", a: "Wasiliana na shule. Kwa usalama wa mwanao, namba hii haitolewi kwa simu ya mtu asiyejulikana." },
      { q: "Inasema nimezuiwa kwa muda.", a: "Baada ya majaribio mengi yasiyo sahihi, kuingia husimamishwa kwa dakika 15 hadi 30. Subiri, kisha jaribu tena ukihakikisha namba ni sahihi." },
      { q: "Kwa nini siwezi kupakua au kuchapisha matokeo?", a: "Matokeo ni ya kusoma tu ili kulinda faragha ya mwanafunzi. Ukihitaji ripoti rasmi, wasiliana na shule." },
    ] },
    { id: "kujiunga", title: "Maelekezo ya Kujiunga", items: [
      { q: "Inasema fomu bado haijachapishwa.", a: "Shule itaifungua muda wa usajili wa Kidato cha Kwanza ukifika. Tafadhali angalia tena baadaye." },
      { q: "Nitapakuaje kwenye simu?", a: "Baada ya kuwasilisha taarifa, bonyeza \"Pakua (Download)\". Faili litahifadhiwa kwenye sehemu ya Downloads ya simu yako. Ukitaka kusoma tu, bonyeza \"Fungua kusoma\"." },
      { q: "Nimefikia kikomo cha kupakua.", a: "Kila mwanafunzi anaweza kupakua mara 5. Ukihitaji zaidi, wasiliana na shule." },
      { q: "Mwaka wa Kidato cha Kwanza umekosewa.", a: "Hakikisha umeandika kwa usahihi mwaka uliomaliza Darasa la Saba; mwaka wa Kidato cha Kwanza ni mwaka unaofuata." },
    ] },
    { id: "tovuti", title: "Kutumia tovuti", items: [
      { q: "Nitabadilishaje lugha?", a: "Bonyeza SW au EN juu kulia." },
      { q: "Nitabadilishaje aina ya herufi?", a: "Weka kipanya juu ya \"Aa\" (au fungua menyu kwenye simu, chagua \"Aina ya herufi\"), kisha chagua unayoipenda." },
      { q: "Je, hati yangu ni halali?", a: "Scan QR code iliyo kwenye hati. Ukurasa wa shule utaonyesha kama ni halali." },
    ] },
  ] : [
    { id: "results", title: "Results", items: [
      { q: "How do I check results?", a: "Open Publications → Results. Enter the student's Results Login Number, then the parent/guardian phone number registered at the school." },
      { q: "I don't have the Login Number.", a: "Contact the school. To protect your child, this number is not given to unknown callers." },
      { q: "It says I am blocked for a while.", a: "After too many wrong attempts, logging in pauses for 15 to 30 minutes. Wait, then try again carefully." },
      { q: "Why can't I download or print the results?", a: "Results are view-only to protect the student's privacy. For an official report, contact the school." },
    ] },
    { id: "joining", title: "Joining Instructions", items: [
      { q: "It says the form is not published yet.", a: "The school opens it when Form One admissions start. Please check again later." },
      { q: "How do I download on my phone?", a: "After submitting, tap \"Pakua (Download)\". The file is saved in your phone's Downloads. To just read it, tap \"Fungua kusoma\"." },
      { q: "I reached the download limit.", a: "Each student may download 5 times. If you need more, contact the school." },
      { q: "The Form One year is wrong.", a: "Make sure you entered the correct Standard Seven completion year; the Form One year is the year after it." },
    ] },
    { id: "site", title: "Using the website", items: [
      { q: "How do I change the language?", a: "Tap SW or EN at the top right." },
      { q: "How do I change the font?", a: "Point at \"Aa\" (or open the menu on a phone and choose \"Font\"), then pick the one you like." },
      { q: "Is my document genuine?", a: "Scan the QR code on the document. The school's page will confirm whether it is genuine." },
    ] },
  ];
  return (
    <PublicLayout>
      <LegalDoc tabs={tabsFor(sw)} labels={labelsFor(sw)} updated={UPDATED[sw ? "sw" : "en"]} contact={contactFor(sw)}
        title={sw ? "Msaada" : "Help & Support"}
        summary={sw ? "Majibu ya maswali yanayoulizwa mara kwa mara. Bonyeza swali kuona jibu lake." : "Answers to common questions. Tap a question to see its answer."}
        faqs={faqs} />
    </PublicLayout>
  );
}
