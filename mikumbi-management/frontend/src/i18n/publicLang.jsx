import { createContext, useContext, useEffect, useState, useCallback } from "react";

// Language for the PUBLIC (parents / students) website only.
// Kiswahili is the DEFAULT - many parents do not read English. A visitor can
// switch to English with the SW | EN toggle in the navbar; that choice is
// remembered in this browser only. The staff site never mounts this provider,
// so anything calling useLang() there simply gets English.
const STORAGE_KEY = "mikumbi_public_lang";
const DEFAULT_LANG = "sw";

const LangContext = createContext({ lang: "en", setLang: () => {}, t: (k) => k });

function readSaved() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "en" || v === "sw" ? v : DEFAULT_LANG;
  } catch { return DEFAULT_LANG; }
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(readSaved);

  const setLang = useCallback((l) => {
    const next = l === "en" ? "en" : "sw";
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode - just not remembered */ }
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const t = useCallback((key, vars) => {
    const entry = STRINGS[key];
    let s = entry ? (entry[lang] ?? entry.en ?? key) : key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(String(v)); });
    return s;
  }, [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

// Small SW | EN switch used in the public navbar.
export function LangToggle({ dark = true }) {
  const { lang, setLang } = useLang();
  const btn = (code, label) => (
    <button
      type="button" onClick={() => setLang(code)} aria-pressed={lang === code}
      style={{
        border: "none", cursor: "pointer", padding: "4px 9px", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em",
        background: lang === code ? (dark ? "#fff" : "#0c426f") : "transparent",
        color: lang === code ? (dark ? "#0c426f" : "#fff") : (dark ? "#fff" : "#0c426f"),
      }}
    >{label}</button>
  );
  return (
    <div role="group" aria-label="Lugha / Language" style={{ display: "inline-flex", border: `1px solid ${dark ? "rgba(255,255,255,0.6)" : "#0c426f"}`, flexShrink: 0 }}>
      {btn("sw", "SW")}{btn("en", "EN")}
    </div>
  );
}

// ── Strings ──────────────────────────────────────────────────────────────
const STRINGS = {
  // Navbar / layout
  "nav.home": { sw: "Mwanzo", en: "Home" },
  "nav.about": { sw: "Kuhusu Shule", en: "About" },
  "nav.news": { sw: "Habari", en: "News" },
  "nav.publications": { sw: "Machapisho", en: "Publications" },
  "nav.contact": { sw: "Mawasiliano", en: "Contact" },
  "nav.results": { sw: "Matokeo", en: "Results" },
  "nav.joining": { sw: "Maelekezo ya Kujiunga", en: "Joining Instructions" },
  "nav.openMenu": { sw: "Fungua menyu", en: "Open menu" },
  "nav.closeMenu": { sw: "Funga menyu", en: "Close menu" },
  "nav.location": { sw: "Newala, Mtwara, Tanzania", en: "Newala, Mtwara, Tanzania" },
  "banner.country": { sw: "Jamhuri ya Muungano wa Tanzania", en: "The United Republic of Tanzania" },
  "school.name": { sw: "Shule ya Sekondari Mikumbi", en: "Mikumbi Secondary School" },
  "school.motto": { sw: "Elimu na Kazi", en: "Education with work" },

  // Footer
  "footer.tagline": { sw: "Kila kitu mwanao anachohitaji, mahali pamoja.", en: "Everything your child needs, in one place." },
  "footer.identity": { sw: "Utambulisho wa Shule", en: "School identity" },
  "footer.regNo": { sw: "Namba ya Usajili", en: "Reg. No." },
  "footer.centreNo": { sw: "Namba ya Kituo", en: "Centre No." },
  "footer.school": { sw: "Shule", en: "School" },
  "footer.aboutUs": { sw: "Kuhusu Sisi", en: "About Us" },
  "footer.boarding": { sw: "Bweni na Kambi", en: "Boarding & Hostels" },
  "footer.gallery": { sw: "Picha", en: "Gallery" },
  "footer.quickLinks": { sw: "Viungo Muhimu", en: "Quick Links" },
  "footer.privacy": { sw: "Sera ya Faragha", en: "Privacy Policy" },
  "footer.terms": { sw: "Masharti ya Matumizi", en: "Terms of Service" },
  "footer.support": { sw: "Msaada", en: "Support" },
  "footer.contactUs": { sw: "Wasiliana Nasi", en: "Contact Us" },
  "footer.postal": { sw: "Anwani ya Posta", en: "Postal Address" },
  "footer.follow": { sw: "Tufuatilie", en: "Follow Us On" },
  "footer.rights": { sw: "Haki zote zimehifadhiwa.", en: "All Rights Reserved." },

  // Home - hero
  "hero.place": { sw: "Newala · Mtwara · Tanzania", en: "Newala · Mtwara · Tanzania" },
  "hero.welcome": { sw: "Karibu Shule ya Sekondari Mikumbi", en: "Welcome to Mikumbi Secondary School" },
  "hero.text": {
    sw: "Shule ya kutwa, yenye bweni kwa wasichana wote na kambi kwa wavulana.",
    en: "A day school, with boarding for all girls and hostel facilities for boys.",
  },
  "hero.results": { sw: "Angalia Matokeo", en: "Check Results" },
  "hero.joining": { sw: "Maelekezo ya Kujiunga", en: "Joining Instructions" },

  // Home - quick access
  "qa.results.title": { sw: "Matokeo", en: "Results" },
  "qa.results.text": { sw: "Angalia matokeo ya mwanao mtandaoni.", en: "View your child's results online." },
  "qa.joining.title": { sw: "Maelekezo ya Kujiunga", en: "Joining Instructions" },
  "qa.joining.text": { sw: "Kwa wanafunzi wapya wa Kidato cha Kwanza.", en: "For new Form One students." },
  "qa.news.title": { sw: "Habari", en: "News" },
  "qa.news.text": { sw: "Matangazo mapya ya shule.", en: "Latest school announcements." },
  "qa.contact.title": { sw: "Wasiliana Nasi", en: "Contact Us" },
  "qa.contact.text": { sw: "Simu, anwani na barua pepe.", en: "Phone, address and email." },

  // Home - about
  "about.title": { sw: "Kuhusu Shule", en: "About the School" },
  "about.text": {
    sw: "Shule ya Sekondari Mikumbi ipo katika Halmashauri ya Wilaya ya Newala, Mtwara, Tanzania. Kauli mbiu yetu, “Elimu na Kazi”, inaongoza kila tunachofanya, darasani hadi kwenye jamii.",
    en: "Mikumbi Secondary School is located in Newala District Council, Mtwara, Tanzania. Our motto, “Education with work”, guides everything we do, from the classroom to the community.",
  },
  "about.headCaption": { sw: "Mkuu wa Shule", en: "Head Master" },
  "about.headAlt": { sw: "Mkuu wa Shule ya Sekondari Mikumbi", en: "Head Master of Mikumbi Secondary School" },
  "fact.postal": { sw: "Anwani ya Posta", en: "Postal Address" },
  "fact.regNo": { sw: "Namba ya Usajili", en: "Registration No." },
  "fact.centreNo": { sw: "Namba ya Kituo", en: "Centre No." },
  "fact.region": { sw: "Mkoa", en: "Region" },
  "fact.motto": { sw: "Kauli Mbiu", en: "Motto" },
  "fact.location": { sw: "Mahali", en: "Location" },

  // Home - boarding
  "boarding.title": { sw: "Taaluma, Bweni na Kambi", en: "Academics, Boarding & Hostels" },
  "boarding.subtitle": {
    sw: "Shule ya Sekondari Mikumbi ni shule ya kutwa, yenye bweni kwa wasichana wote na kambi kwa wavulana.",
    en: "Mikumbi Secondary School is a day school, with boarding for all girls and hostel facilities for boys.",
  },
  "boarding.academics.title": { sw: "Taaluma", en: "Academics" },
  "boarding.academics.text": { sw: "Mazingira mazuri ya kujifunzia yanayoongozwa na kauli mbiu yetu, “Elimu na Kazi”.", en: "A supportive learning environment guided by our motto, “Education with work”." },
  "boarding.girls.title": { sw: "Bweni la Wasichana", en: "Girls' Boarding" },
  "boarding.girls.text": { sw: "Huduma ya bweni inatolewa kwa wasichana wote.", en: "Boarding services are provided for all girls." },
  "boarding.ground.title": { sw: "Uwanja wa Shule", en: "School Grounds" },
  "boarding.ground.text": { sw: "Uwanja wa michezo na shughuli za wanafunzi nje ya darasa.", en: "Sports field and outdoor student activities." },
  "boarding.sports.title": { sw: "Michezo", en: "Sports" },
  "boarding.sports.text": { sw: "Wanafunzi hushiriki michezo mbalimbali kama mpira wa miguu, mpira wa wavu (volleyball) na netiboli.", en: "Students take part in sports such as football, volleyball and netball." },
  "boarding.farm.title": { sw: "Kazi za Shamba", en: "Farm Work" },
  "boarding.farm.text": { sw: "Wanafunzi hujifunza kwa vitendo kupitia kazi za shamba, kwa kauli mbiu yetu “Elimu na Kazi”.", en: "Students learn by doing through farm work, in line with our motto “Education with work”." },
  "boarding.life.title": { sw: "Maisha ya Mwanafunzi", en: "Student Life" },
  "boarding.life.text": { sw: "Kujifunza, nidhamu na maisha ya jamii nje ya darasa.", en: "Learning, discipline and community life beyond the classroom." },

  // Home - gallery
  "gallery.title": { sw: "Picha za Shule", en: "Photo Gallery" },
  "gallery.subtitle": { sw: "Maisha katika Shule ya Sekondari Mikumbi", en: "Life at Mikumbi Secondary School" },
  "gallery.cat.students": { sw: "Wanafunzi", en: "Students" },
  "gallery.cat.learning": { sw: "Kujifunza", en: "Learning" },
  "gallery.cat.leaders": { sw: "Uongozi", en: "Leadership" },
  "gallery.cat.farm": { sw: "Kazi za Shamba", en: "Farm Work" },
  "gallery.cat.hostel": { sw: "Hosteli ya Wasichana", en: "Girls' Hostel" },
  "gallery.cat.sports": { sw: "Michezo", en: "Sports" },
  "gallery.cat.grounds": { sw: "Mazingira ya Shule", en: "School Environment" },
  "gallery.open": { sw: "Fungua picha {n}", en: "Open photo {n}" },
  "gallery.photo": { sw: "Picha ya shule {n}", en: "School photo {n}" },
  "gallery.viewer": { sw: "Kitazamaji picha", en: "Photo viewer" },
  "gallery.prev": { sw: "Picha iliyotangulia", en: "Previous photo" },
  "gallery.next": { sw: "Picha inayofuata", en: "Next photo" },
  "common.close": { sw: "Funga", en: "Close" },

  // Home - contact
  "contact.title": { sw: "Wasiliana Nasi", en: "Contact Us" },
  "contact.subtitle": { sw: "Tunafurahi kusikia kutoka kwa wazazi, walezi na wanafunzi.", en: "We are happy to hear from parents, guardians and students." },
  "contact.location": { sw: "Mahali", en: "Location" },
  "contact.postal": { sw: "Anwani ya Posta", en: "Postal Address" },
  "contact.phone": { sw: "Simu", en: "Phone" },
  "contact.email": { sw: "Barua Pepe", en: "Email" },
  "map.title": { sw: "Mahali Shule Ilipo", en: "Find the School" },
  "map.text": { sw: "Shule ya Sekondari Mikumbi - kijiji cha Mikumbi, kata ya Mikumbi, Newala.", en: "Mikumbi Secondary School - Mikumbi village, Mikumbi ward, Newala." },
  "map.directions": { sw: "Pata Maelekezo", en: "Get Directions" },
  "map.activate": { sw: "Bonyeza kutumia ramani", en: "Tap to use the map" },
  "map.open": { sw: "Fungua kwenye Google Maps", en: "Open in Google Maps" },
  "map.frame": { sw: "Ramani ya mahali Shule ya Sekondari Mikumbi ilipo", en: "Map showing where Mikumbi Secondary School is" },

  // News
  "news.title": { sw: "Habari na Matangazo", en: "News & Announcements" },
  "news.subtitle": { sw: "Matangazo mapya kutoka Shule ya Sekondari Mikumbi", en: "The latest notices from Mikumbi Secondary School" },
  "news.loading": { sw: "Inapakia matangazo…", en: "Loading announcements…" },
  "news.error": { sw: "Matangazo hayakuweza kupakiwa kwa sasa. Tafadhali onyesha upya ukurasa baada ya muda mfupi.", en: "Announcements could not be loaded right now. Please refresh the page in a moment." },
  "news.empty": { sw: "Hakuna matangazo kwa sasa. Tafadhali angalia tena baadaye.", en: "No announcements at the moment. Please check back soon." },
  "news.latest": { sw: "Tangazo jipya", en: "Latest announcement" },
  "news.new": { sw: "JIPYA", en: "NEW" },
  "news.readMore": { sw: "Soma zaidi", en: "Read more" },

  // Publications shell
  "pub.back": { sw: "Rudi Mwanzo", en: "Back to Home" },
};
