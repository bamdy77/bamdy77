// data/chatbotKnowledge.js - FAQ Chatbot knowledge base.
// Every entry has: keywords (for matching, both languages), sw (Swahili
// answer), en (English answer). The engine mirrors whichever language the
// question was asked in. Special-case entries (identity, programming
// language, secrets) are handled separately in chatbotEngine.js because
// they need exact, fixed wording regardless of phrasing.

export const FAQ = [
  // ── Login / Password ──────────────────────────────────────────────
  {
    keywords: ["login", "log in", "ingia", "kuingia", "password imesahaulika", "forgot password", "nimesahau password", "sijui password", "reset password"],
    sw: "Kwenye ukurasa wa kuingia (Login), bonyeza 'Umesahau Password?' kisha weka barua pepe (Gmail) uliyosajiliwa. Utapokea link ya kuweka password mpya - link hiyo inaisha muda baada ya saa moja.",
    en: "On the Login page, click 'Forgot Password?' and enter your registered Gmail address. You'll receive a link to set a new password - the link expires after one hour.",
  },
  {
    keywords: ["hostel password", "contributions password", "password ya hostel", "password ya michango", "matron password", "patron password", "password ya matron", "password ya patron"],
    sw: "Akaunti za School Patron/Matron zinatumia 'Umesahau Password?' (Gmail) kama akaunti nyingine yoyote. Kama haijawahi kufanya kazi, muombe Mkuu wa Shule/Makamu wa Shule ahakikishe barua pepe (Gmail) yako imesajiliwa sahihi kwenye USER ACCOUNTS - bila email hapo, 'Umesahau Password?' haiwezi kutuma link.",
    en: "School Patron/Matron accounts use 'Forgot Password?' (Gmail) just like any other account. If it isn't working, ask the Head Master/Second Master to confirm your Gmail address is correctly saved in USER ACCOUNTS - without an email on file there, 'Forgot Password' has nowhere to send the reset link.",
  },

  // ── Student Management ────────────────────────────────────────────
  {
    keywords: ["ongeza mwanafunzi", "sajili mwanafunzi", "add student", "register student", "enroll student"],
    sw: "Kuongeza mwanafunzi (usajili) - iwe kwa ujumla au ndani ya RESULTS MANAGEMENT kwa ajili ya mtihani - inafanywa na Mkuu wa Shule au Makamu wa Shule pekee. Academic Master na Walimu hawawezi kuongeza wala kufuta mwanafunzi yeyote.",
    en: "Adding a student - whether generally or from within RESULTS MANAGEMENT for an exam - can only be done by the Head Master or Second Master. The Academic Master and teachers cannot add or delete any student.",
  },
  {
    keywords: ["registration number", "index number", "reg no", "namba ya usajili", "namba ya mtihani"],
    sw: "Namba ya usajili (Registration Number) inajitengeneza yenyewe kiotomatiki kwa muundo S4005/xxxx unapomsajili mwanafunzi au unapomtuma kwenye orodha ya mtihani.",
    en: "The Registration Number is generated automatically in the format S4005/xxxx when a student is enrolled or added to an exam list.",
  },

  // ── Results Management ────────────────────────────────────────────
  {
    keywords: ["andika alama", "ingiza alama", "enter marks", "enter scores", "submit scores", "tuma alama"],
    sw: "Kwenye RESULTS MANAGEMENT, chagua kipindi cha mtihani (period) na kidato, kisha andika alama za somo lako pekee. Baada ya kumaliza, bonyeza 'Submit' kupeleka kwa Academic Master kwa ajili ya kuidhinishwa (Include).",
    en: "In RESULTS MANAGEMENT, choose the exam period and form, then enter marks for your own subject only. When done, click 'Submit' to send it to the Academic Master for approval (Include).",
  },
  {
    keywords: ["division", "best seven", "best 7", "gpa", "jinsi division inavyohesabiwa"],
    sw: "Division inahesabiwa kwa kutumia masomo bora saba (Best 7) ya mwanafunzi pekee, kulingana na alama zilizoidhinishwa (Included) na Academic Master.",
    en: "Division is calculated using only the student's best seven (Best 7) subjects, based on marks that have been approved (Included) by the Academic Master.",
  },
  {
    keywords: ["tangazo", "announcement", "matokeo yametoka"],
    sw: "Mkuu wa Shule au Makamu wa Shule wanaweza kutuma tangazo (Online Announcement) kupitia COMMUNICATIONS - unachagua litaonekana kwa nani: Walimu (Staff), Wazazi (Parents & public), au wote (Both), na pia unachagua litaonekana kwa muda gani (siku, tarehe maalum, au milele hadi ulifute). Academic Master hawezi kuona au kutuma matangazo.",
    en: "The Head Master or Second Master can post an Online Announcement from COMMUNICATIONS - you choose who it is for: Staff, Parents & public, or Both, and how long it stays (days, until a date, or forever until you delete it). The Academic Master cannot see or send announcements.",
  },

  // ── TAMS ───────────────────────────────────────────────────────────
  {
    keywords: ["tams", "mahudhurio", "check in", "checkin", "attendance", "gps"],
    sw: "Kwenye TAMS, ingia kwenye mfumo ukiwa shuleni, kisha bonyeza 'Check In' - andika majina yako matatu na password yako kama yalivyosajiliwa, kisha simu yako itatuma mahali ulipo (GPS). Lazima uwe ndani ya mita 50 kutoka shuleni na kati ya saa 12:00 asubuhi na 2:00 (6:00–8:00 AM). Baada ya saa 1:30 (7:30 AM) utahesabiwa umechelewa. Makamu wa Shule (Second Master) pia husaini mahudhurio kama Mwalimu.",
    en: "In TAMS, log in while at school, then tap 'Check In' - type your full name and password as registered, and your phone will send your GPS location. You must be within 50 metres of school and between 6:00–8:00 AM. After 7:30 AM you'll be marked late. The Second Master also checks in like a teacher.",
  },
  {
    keywords: ["sikuweza check in", "attendance haikufanya kazi", "distance error", "mbali na shule"],
    sw: "Kama umepata ujumbe wa 'mbali na shule', hakikisha GPS/Location ya simu yako imewashwa na uko ndani ya eneo la shule. Kama tatizo linaendelea, mjulishe Mkuu wa Shule.",
    en: "If you got a 'too far from school' message, make sure your phone's Location/GPS is turned on and you're within the school grounds. If the problem continues, inform the Head Master.",
  },

  // ── Timetable ──────────────────────────────────────────────────────
  {
    keywords: ["ratiba", "timetable", "muda wa somo", "kujenga ratiba", "generate timetable"],
    sw: "Ratiba (Timetable) hutengenezwa kiotomatiki na mfumo kutoka TIMETABLE GENERATOR. Baada ya kutengenezwa, inachapishwa (published) na inapatikana kwenye ukurasa wa Publications kwa mtazamo wa GENERAL, PER TEACHER, au PER CLASS.",
    en: "The Timetable is generated automatically by the TIMETABLE GENERATOR. Once generated, it's published and available on the Publications page as GENERAL, PER TEACHER, or PER CLASS view.",
  },

  // ── Hostel ─────────────────────────────────────────────────────────
  {
    keywords: ["hostel", "bweni", "chumba", "room allocation", "mgao wa chumba", "accommodation", "gharama za hostel", "hostel fees"],
    sw: "HOSTEL MANAGEMENT ina tabo tatu: Accommodation (mgao wa vyumba/mahali pa kulala), Hostel Fees (gharama za huduma za hosteli kwa TZS), na History (kumbukumbu ya wanafunzi wote kwa kila darasa). Mwanafunzi lazima awe amesajiliwa STUDENT MANAGEMENT kwanza, na anaweza kusajiliwa hostel MOJA tu (Boys au Girls).",
    en: "HOSTEL MANAGEMENT has three tabs: Accommodation (room/bed allocation), Hostel Fees (accommodation service costs in TZS), and History (every student's record, by class). A student must first be enrolled in STUDENT MANAGEMENT, and can only be registered in ONE hostel (Boys or Girls).",
  },

  // ── Contributions ──────────────────────────────────────────────────
  {
    keywords: ["michango", "contribution", "malipo", "part time", "part-time teachers", "ream"],
    sw: "CONTRIBUTIONS MANAGEMENT sasa ina sehemu tatu: Part-Time Teachers (TZS 2,000/mwezi, inakusanywa na Class Teacher kwa darasa lake pekee), Ream, na Other Expenses. Mkuu wa Shule, Makamu, na Academic Master wanaona muhtasari wa madarasa yote; Class Teacher anaona darasa lake tu.",
    en: "CONTRIBUTIONS MANAGEMENT now has three sections: Part-Time Teachers (TZS 2,000/month, collected by the Class Teacher for their own class only), Ream, and Other Expenses. Head Master, Second Master, and Academic Master see the summary for every class; a Class Teacher only sees their own class.",
  },
  {
    keywords: ["class teacher", "mwalimu wa darasa"],
    sw: "Class Teacher ni role mpya - anaona TAMS, Results Management, na Contributions Management (kwa darasa lake pekee kwenye Part-Time Teachers). Anasajiliwa kwenye USER ACCOUNTS akichaguliwa darasa lake.",
    en: "Class Teacher is a role that sees TAMS, Results Management, and Contributions Management (their own class only, for Part-Time Teachers collection). They're registered in USER ACCOUNTS with their class assigned.",
  },
  {
    keywords: ["mwalimu wa chakula", "nataka kujaza wanafunzi wanaotoa chakula", "Mwalimu wa chakula ana kazi gani", "food teacher", "food contributions", "michango ya chakula"],
    sw: "FOOD CONTRIBUTIONS ni module mpya, inaonekana kwa Food Teacher na Mkuu wa Shule/Makamu. Ina sehemu mbili: Boarding Students na Day Students, pamoja na History kwa kila mwaka.",
    en: "FOOD CONTRIBUTIONS is a new module, visible to the Food Teacher role and the Head Master/Second Master. It has two sections: Boarding Students and Day Students, plus a History view for any year.",
  },
  {
    keywords: ["roles mbili", "role zaidi ya moja", "multiple roles", "two roles", "academic na matron"],
    sw: "Mwalimu mmoja anaweza kuwa na roles zaidi ya moja (mfano Academic Master na pia anaweza kuwa Matron). Hii inawekwa na Mkuu wa Shule/Makamu kwenye USER ACCOUNTS - 'Additional Role(s)'. Mwalimu ataona kila kitu roles zake zote zinamruhusu kuona.",
    en: "One teacher can hold more than one role at once (e.g. Academic Master AND Matron). This is set by the Head Master/Second Master in USER ACCOUNTS under 'Additional Role(s)'. The teacher sees everything any of their roles unlocks.",
  },

  // ── Communications / SMS ───────────────────────────────────────────
  {
    keywords: ["sms", "nataka kutuma ujumbe, tuma ujumbe", "send message", "nataka kutuma ujumbe kwa wazazi", "text parents"],
    sw: "SMS Service (ndani ya COMMUNICATIONS) inatumika na Mkuu wa Shule au Makamu wa Shule kutuma ujumbe mfupi kwa wazazi, walimu(staff) wote au mtu mmoja mmoja. Fuata maelekezo kama yalivyo kwenye mfumo",
    en: "SMS Service (inside COMMUNICATIONS) is used by the Head Master or Second Master to send text messages to parents, staff, or an individual.",
  },
];

// ── Special fixed-answer cases (checked before the FAQ list) ─────────
export const SPECIAL_CASES = {
  who_are_you: {
    keywords: ["wewe ni nani", "who are you", "u ni nani", "nani wewe", "unaitwa nani", "jina lako nani", "jina lako ni nani?", "unaitwa jina gani", "unaitwa kwa jina gani"],
    sw: "Mimi ni mfumo, nipo hapa kwa niaba ya Admin.",
    en: "I am a system, here on behalf of Admin.",
  },
  who_is_martine: {
    keywords: ["martine ni nani", "who is martine", "who is mr martine", "mr martine ni nani", "ndo nani", "ndio nani", "mr. martine ni nani", "martine ndo nani", "martine ndio nani"],
    sw: "Ni Mwezeshaji wa huu Mfumo.",
    en: "He is the Facilitator of this System.",
  },
  programming_language: {
    keywords: ["programming language", "lugha ya programu", "umetengenezwa na nini", "built with", "coded in", "react au", "node au", "database gani", "umeandikwa kwa lugha gani", "language gani"],
    sw: "Kwa maswali kuhusu jinsi mfumo huu ulivyotengenezwa, tafadhali wasiliana na Admin.",
    en: "For questions about how this system was built, please contact Admin.",
  },
  secrets: {
    keywords: ["password ya database", "database password", "jwt secret", "credentials", "server password", "api key", "unaijua password yangu", "password yangu unaijua?", "password yangu unaijua", "siri za mfumo", "siri za mfumo huu", "unajua password za waimu", "unazijua password za walimu?", "secret key", "password ya admin ni ipi"],
    sw: "Hii ni siri, sitakiwi kuijua wala kuisema. Kwa msaada zaidi wasiliana na Mkuu wa Shule.",
    en: "This is confidential - I'm not able to share it. For further help, please contact the Head Master.",
  },
};

export const GREETING = {
  keywords: ["habari", "mambo", "hujambo", "hello", "hi ", "hi,", "vipi", "habari", "niaje", "nani wewe", "wewe ni nani", "habari yako", "mambo vipi", "inakuwaje"],
  sw: "Habari! Naitwa Msaidizi wa Mfumo. Niulize chochote kuhusu jinsi ya kutumia mfumo - mfano: jinsi ya kuingiza alama, Kutengeneza Timetable Automatically, ku-Mark Attendance kwenye TAMS, au kubadilisha password. n.k",
  en: "Hello! I'm the System Assistant. Ask me anything about using the system - e.g. how to enter marks, check in on TAMS, or reset your password.",
};

export const FALLBACK = {
  sw: "Samahani, swali hilo haliko ndani ya matumizi ya mfumo. Tafadhali wasiliana na Msimamizi (Admin/Mkuu wa Shule) kwa msaada zaidi. Aidha nenda kasome features kwenye ukurasa wa mwanzo kabisa (landing page) iki kujua mfumo huu unajishugulisha na nini",
  en: "Sorry, that question isn't about how to use this system. Please contact the Admin for further help.",
};
