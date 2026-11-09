// utils/joiningContent.js - the EDITABLE wording of the Form I Joining
// Instruction (Maelezo ya Kujiunga).
//
// Admin/Second Master edit this in Student Management -> Joining
// Instructions -> "Maudhui na Uchapishaji" BEFORE publishing it online. It is
// stored as JSON in joining_settings.content. When nothing has been saved yet
// (fresh install) DEFAULT_CONTENT below is used - it is the school's own
// "MIKUMBI JOINING INSTRUCTION" document, plus the discipline offences and
// attached forms the school asked to be added.
//
// Section body mini-markup (one instruction per line):
//   - text      numbered item (i, ii, iii... - numbering restarts after a
//               heading or a plain paragraph)
//   * text      bullet item
//   ## text     bold sub-heading (e.g. WAVULANA / WASICHANA)
//   **text      bold paragraph
//   NB: text    note - "NB:" printed in bold
//   other text  plain paragraph
// {MWAKA} anywhere in the text is replaced by the admission year, and
// {MWAKA_UJAO} by the year after it.

const DEFAULT_CONTENT = {
  phones: "0718197560, 0789451021",
  address: "SHULE YA SEKONDARI MIKUMBI,\nS.L.P. 363,\nNEWALA.",
  subject: "YAH: MAELEZO YA KUJIUNGA NA SHULE YA SEKONDARI MIKUMBI",
  intro:
    "Ninafuraha kukuarifu kuwa umechaguliwa kujiunga na kidato cha kwanza katika shule ya Sekondari ya Kutwa Mikumbi iliyopo Km 25 kutoka makao makuu ya Halmashauri ya wilaya ya Newala (Kitangali) katika kijiji cha Mikumbi, kata ya Mikumbi, tarafa ya Chilangala Halmashauri ya Newala.\n" +
    "Shule hii ni ya KUTWA (DAY SCHOOL) na HOSTEL (BWENI) kwa wasichana wanaoishi maeneo ya mbali. Hivyo unapaswa kuwahi nafasi kama una mpango wa kumleta kijana wako Hostel kwa wale wanaotoka mbali tu.\n" +
    "Yafuatayo ni maelekezo muhimu ya kuzingatia;-",
  sections: [
    {
      title: "MAELEKEZO MUHIMU YA AWALI",
      body:
        "- Shule itafunguliwa tarehe 11.01.{MWAKA} lakini kwa kidato cha kwanza wanatakiwa kuripoti kuanzia tarehe 06.01.{MWAKA}\n" +
        "- Kama hutofika mpaka tarehe 30/01/{MWAKA} nafasi yako atapewa mtu mwingine.",
    },
    {
      title: "MAHITAJI KWA AJILI YA WANAFUNZI",
      body:
        "* Daftari kubwa 11 (Counter Book quire 2 au 3)\n" +
        "* Daftari ndogo 10 aina ya msomi.\n" +
        "* Kamusi ya Kiingereza (English to English - Oxford Dictionary) ni ya LAZIMA kuwa nayo.\n" +
        "* Rimu moja (1) ya karatasi za A4 (LAZIMA)\n" +
        "* Jembe 1 na fyekeo 1 aje navyo siku ya kuripoti na kukabidhi shule\n" +
        "* Mkebe wa Hisabati (Mathematical set) na Rula moja ndefu. Non programmable Calculator (LAZIMA)\n" +
        "* Mchango wa Taaluma kwa mwaka 10,000/= aje nayo siku ya kuripoti\n" +
        "* Mchango wa chakula cha mchana, mahindi 6 kg, mboga (jamii ya kunde) 4kg, mafuta nusu, chumvi robo, gharama ya mpishi 10,000/= hii ni kwa kila mwezi (Wanafunzi wote ni lazima wale chakula cha mchana shuleni)",
    },
    {
      title: "SARE ZA SHULE (SCHOOL UNIFORM)",
      body:
        "## WAVULANA\n" +
        "- Shati nyeupe Mbili (2) za tetron (Tomato) mikono mifupi zenye kola zisiwe na mifuko miwili (2).\n" +
        "- Suruali za kaki mbili (2) chini nchi kumi (10) ifunike kiatu, isipite kisigino na isibane\n" +
        "- Viatu vyeusi jozi mbili (2) vya kamba viatu vyenye mikanda.\n" +
        "- Sandals, viatu visivyo na Kamba haviruhusiwi\n" +
        "- Mkanda mweusi wa ngozi wa kuvalia, wenye bizimu ya kawaida na si bakozi.\n" +
        "- Traki suti yenye rangi ya Blue Bahari ni LAZIMA.\n" +
        "- Tshirt ya shule inapatikana shuleni kwa gharama ya Tsh 15,000/=.\n" +
        "- Soksi nyeupe jozi mbili (2)\n" +
        "## WASICHANA\n" +
        "- Shati Nyeupe Mbili (2) za tetron (Tomato) mikono mifupi, zenye kola zisiwe na mifuko miwili (2).\n" +
        "- Sketi ndefu mbili (2) zenye rangi Nyekundu.\n" +
        "- Malinda yaliyolalia upande mmoja toka linda moja hadi linda moja kuwe na umbali wa sentimita tatu (Cm 3)\n" +
        "- Viatu jozi mbili (2) Vyeusi vya kufunga kwa kamba na soksi nyeupe jozi mbili (2)\n" +
        "- Sandals, Viatu vyenye mikanda na bajaji haviruhusiwi\n" +
        "- Track suti ni LAZIMA yenye rangi ya Blue Bahari.\n" +
        "**Wasichana wanaopenda vazi la Hijabu, Vazi linaruhusiwa kuvaliwa kwa utaratibu ufuatao;\n" +
        "- Awe na hijabu, sketi ndefu zinazoishia kifundo cha miguu mbili (2)\n" +
        "- Awe na hijabu (2) nyeupe aina ya tetroni (zisizo za kubana) zinazoishia magotini na mikono iwe mirefu.\n" +
        "- Awe na hijabu 1 ya blue bahari kwa ajili ya kuivaa siku ya kuvaa Tshirt ya shule\n" +
        "NB: ZINGATIA SIO LAZIMA KUVAA HIJABU BALI NI KWA WALE WANAOPENDA TU! HIVYO VIGEZO NA MASHARTI VIZINGATIWE BARABARA",
    },
    {
      title: "MAVAZI WAKATI WA KAZI",
      body:
        "Wanafunzi wote mnatakiwa kuvaa mavazi yafuatayo wakati wa kazi\n" +
        "- Raba nyeupe.\n" +
        "- Gauni ndefu la Blue kwa wasichana\n" +
        "- Tshirt ya Blue na Suruali ya Blue kwa wavulana (round collar)",
    },
    {
      title: "NGUO ZA MICHEZO KWA WAVULANA NA WASICHANA",
      body:
        "- Track ya michezo yenye rangi ya Blue Bahari\n" +
        "- Bukta nyeupe 1, na Jezi 1 nyekundu ya juu kwa wavulana\n" +
        "- Kiatu cha michezo (chenye njumu) au raba kwa wasichana",
    },
    {
      title: "SHERIA ZA SHULE",
      body:
        "- Mwanafunzi awe smati na mwenye heshima kwa wazazi/walezi, walimu, wafanyakazi wasio walimu, na watu wengine waliomzidi umri ndani na nje ya shule.\n" +
        "- Kujifunza masomo ya darasani kwa juhudi na maarifa na kufanya kazi za mikono.\n" +
        "- Kuvaa sare za shule wakati wote wa saa za shule (darasani) na hospitali.\n" +
        "- Kuhudhuria vipindi vyote bila kukosa na kuwepo darasani siku zote za masomo.\n" +
        "- Kuthamini muda; mwanafunzi anatakiwa awepo mahali anapotakiwa kwa wakati. Ratiba ya shule itaanza saa 1:00 asubuhi kwa kufanya usafi kisha masomo.\n" +
        "- Mwanafunzi anatakiwa kuwa nadhifu (usafi) muda wote.\n" +
        "- Kutunza mali mbalimbali za shule zinazohamishika na zisizohamishika.",
    },
    {
      title: "MAHITAJI KWA WANAFUNZI WA HOSTEL",
      body:
        "Shule ina huduma ya Hostel kwa wanafunzi wanaotoka mbali. Gharama za Hostel zinatokana na majadiliano yaliyofikiwa katika vikao halali vya wazazi wanaotaka watoto wao waishi Hostel. Hivyo kwa wale watakaohitaji Hostel wawahi nafasi kwani nafasi zenyewe ni chache.\n" +
        "**Yafuatayo ni baadhi ya vitu muhimu pindi mwanao atakapopata nafasi ya Hostel.\n" +
        "- Aje na Godoro la inchi 3 kwa 6.\n" +
        "- Aje na shuka mbili za rangi ya Dark Blue pamoja na net ya pembe 4.\n" +
        "- Ndoo 1, Sahani 1, kijiko 1, uma 1, kikombe 1, bakuli 1.\n" +
        "- Tranka kwa ajili ya kuhifadhi vitu vyake\n" +
        "- Gauni 2 za rangi ya Blue (shamba dress)\n" +
        "- Suruali 2 ya bluu bahari pamoja na shati la blue.\n" +
        "- Gharama ya mwaka kwa chakula kwa Fedha ni Tsh. 450,000/= na unaweza ukalipa kwa awamu mbili.\n" +
        "NB: Nunua vifaa vyote ulivyoagizwa na shule.\n" +
        "Kwa wale wanafunzi watakaoishi Hostel zingatia kila agizo hapo juu kwani mwanafunzi HATORUHUSIWA kuvaa nguo zozote tofauti na zilizoagizwa. HAIRUHUSIWI kuja na RADIO, SIMU, PASI YA UMEME au NGUO yoyote ile ya NYUMBANI.",
    },
    {
      title: "MAKOSA AMBAYO YANAWEZA KUSABABISHA MWANAFUNZI KUFUKUZWA SHULE",
      body:
        "Makosa yatakayosababisha mwanafunzi kufukuzwa shule ni pamoja na:\n" +
        "- Wizi;\n" +
        "- Kutohudhuria masomo kwa zaidi ya siku 90 bila taarifa (utoro);\n" +
        "- Kugoma na kuhamasisha mgomo;\n" +
        "- Kutoa lugha chafu kwa wanafunzi wenzake, walimu/walezi na jamii kwa ujumla;\n" +
        "- Kupigana mwanafunzi kwa mwanafunzi, kumpiga mwalimu au mtu yeyote yule;\n" +
        "- Kudharau na kukaidi maagizo halali ya walimu na uongozi wa shule;\n" +
        "- Ulevi au unywaji wa pombe na matumizi ya dawa za kulevya;\n" +
        "- Uvutaji wa sigara;\n" +
        "- Uasherati, mahusiano ya jinsi moja, kuoa au kuolewa;\n" +
        "- Kupata ujauzito au kutoa mimba;\n" +
        "- Kusababisha mimba;\n" +
        "- Kushiriki matendo ya uhalifu, siasa na matendo yoyote yale yanayovunja sheria za nchi;\n" +
        "- Kwenda kwenye nyumba za starehe na nyumba za kulala wageni;\n" +
        "- Kumiliki, kukutwa au kutumia simu ya mkononi katika mazingira ya shule;\n" +
        "- Kudharau Bendera ya Taifa;\n" +
        "- Kufanya jaribio lolote la kujiua, au kutishia kujiua kama kunywa sumu; na\n" +
        "- Uharibifu wa mali ya umma kwa makusudi.\n" +
        "Nakala kamili ya sheria za shule utapatiwa siku ya kuripoti shuleni.",
    },
    {
      title: "VIAMBATISHO NA FOMU MUHIMU",
      body:
        "Fomu zifuatazo zimeambatishwa pamoja na maelezo haya. Zijazwe kikamilifu na ziletwe siku ya kuripoti:\n" +
        "- Fomu Na. 1: Ahadi ya Mzazi/Mlezi;\n" +
        "- Fomu Na. 2: Ahadi ya Mwanafunzi;\n" +
        "- Fomu Na. 3: Maelezo Binafsi ya Mwanafunzi na Mkataba wa kutoshiriki katika migomo, fujo na makosa ya jinai; na\n" +
        "- Fomu Na. 4: Fomu ya Uchunguzi wa Afya (Medical Examination Form) ambayo itajazwa na Mganga Mkuu wa Hospitali ya Serikali.",
    },
  ],
  closing: "Karibu Sana Shule Ya Sekondari Mikumbi",
  head_name: "OCTAVIAN C. MILLANZI",
  head_title: "MKUU WA SHULE",
  include_forms: true,
  // Page with photos of the allowed / not-allowed uniform (faces blurred)
  include_uniform_page: true,
  // Background mark on every page: "text" | "logo" | "none"
  watermark: "text",
  // PDF font: "arimo" | "times" | "helvetica" | "courier"
  font: "arimo",
};

const MAX_SECTIONS = 30;
const MAX_TEXT = 8000;

// Cleans up whatever the browser sent - never trust its shape. Returns
// { content } or { error }.
function sanitizeContent(raw) {
  if (!raw || typeof raw !== "object") return { error: "Maudhui ya Joining Instruction si sahihi." };
  const str = (v, max = 400) => String(v == null ? "" : v).replace(/\r\n/g, "\n").slice(0, max);
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  if (sections.length > MAX_SECTIONS) return { error: `Sehemu zisizidi ${MAX_SECTIONS}.` };
  const clean = {
    phones: str(raw.phones, 120).trim(),
    address: str(raw.address, 300).trim(),
    subject: str(raw.subject, 200).trim(),
    intro: str(raw.intro, MAX_TEXT).trim(),
    sections: sections
      .map((s) => ({ title: str(s && s.title, 200).trim(), body: str(s && s.body, MAX_TEXT).trim() }))
      .filter((s) => s.title || s.body),
    closing: str(raw.closing, 200).trim(),
    head_name: str(raw.head_name, 120).trim(),
    head_title: str(raw.head_title, 120).trim(),
    include_forms: raw.include_forms !== false,
    include_uniform_page: raw.include_uniform_page !== false,
    watermark: ["text", "logo", "none"].includes(raw.watermark) ? raw.watermark : "text",
    font: ["arimo", "times", "helvetica", "courier"].includes(raw.font) ? raw.font : "arimo",
  };
  if (!clean.sections.length) return { error: "Weka angalau sehemu moja ya maelekezo." };
  if (!clean.head_name) return { error: "Tafadhali jaza jina la Mkuu wa Shule." };
  return { content: clean };
}

// Returns the saved content merged over the defaults, so a row saved by an
// older version (or a NULL column) still renders a complete document.
function resolveContent(saved) {
  if (!saved || typeof saved !== "object" || !Array.isArray(saved.sections) || !saved.sections.length) {
    return JSON.parse(JSON.stringify(DEFAULT_CONTENT));
  }
  return { ...JSON.parse(JSON.stringify(DEFAULT_CONTENT)), ...saved };
}

function applyYear(text, year) {
  const y = Number(year) || new Date().getFullYear();
  return String(text || "").split("{MWAKA_UJAO}").join(String(y + 1)).split("{MWAKA}").join(String(y));
}

module.exports = { DEFAULT_CONTENT, sanitizeContent, resolveContent, applyYear };
