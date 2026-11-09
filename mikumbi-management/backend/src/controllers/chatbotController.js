// controllers/chatbotController.js — "Msaidizi wa Mfumo" (System Assistant)
//
// Gemini is an ENHANCEMENT layer on top of the existing client-side FAQ
// engine (frontend/src/utils/chatbotEngine.js) — it is never the only
// thing standing between a question and a safe answer. This endpoint:
//   1. Only tells Gemini about the modules/features the ASKING user's own
//      role(s) can actually see (mirrors Layout.jsx's role gating), so it
//      can't describe or explain a feature that account isn't allowed to
//      use in the first place.
//   2. Hard-forbids, in the system instruction, ever discussing actual
//      student results/marks, any login credentials/API keys/secrets, or
//      the Head Master's signature / school stamp files.
//   3. Fails CLOSED: any error, timeout, empty/blocked response, or
//      missing API key returns `{ ok: false }` so the frontend falls back
//      to the local keyword-matched FAQ engine instead of showing nothing
//      or leaking a raw error.
const axios = require("axios");

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 12000;

// Mirrors frontend/src/components/Layout.jsx's MODULES list (roles + what
// each one is for), but goes one level deeper than a plain summary: every
// entry also names the actual on-screen buttons/tabs/labels a user in that
// module would see and click, taken from the real UI copy in
// legacy/schoolManagementBundle.jsx, TAMS.jsx, etc. This is what lets
// Gemini answer "where is X" or "what does button Y do" precisely instead
// of vaguely - it is only ever describing controls that really exist.
const MODULES_INFO = [
  { roles: ["admin", "second_master"], label: "Student Management", desc: "Kusajili, kuhariri, kuhamisha, na kufuta wanafunzi - kitufe 'Enroll Student' juu kulia kwenye orodha ya wanafunzi (Mkuu wa Shule/Second Master pekee; Academic Master na walimu wengine hawawezi kuongeza wala kufuta mwanafunzi). Juu ya orodha kuna stat cards (Total Enrolled, Active, Male, Female, Graduated, Transferred) - ukibofya 'Graduated' au 'Transferred' orodha inachujwa (filter) kuonyesha wanafunzi hao pekee. Kila mwanafunzi ana menyu ya vitendo (icon ya dots tatu) yenye Edit, Transfer, Graduate na chaguo nyingine. Kitufe 'Export PDF' kinapakua orodha ya wanafunzi kama PDF." },
  { roles: ["admin", "second_master"], label: "Joining Instructions (ndani ya Student Management)", desc: "Tab ndani ya Student Management inayoonyesha fomu za waombaji wa Kidato cha Kwanza (mtandaoni na walioletwa shuleni papo hapo), mahitaji ya kujiunga, na uchaguzi wa kuzichapisha (publish) kwenye tovuti ya umma au la." },
  { roles: ["admin", "second_master"], label: "Identity Cards (ndani ya Student Management)", desc: "Tab ya kutengeneza na kuprint vitambulisho vya wanafunzi moja kwa moja kutoka picha ya usajili - chagua mwanafunzi/darasa kisha bonyeza 'Print' au 'Export PDF'." },
  { roles: ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"], label: "Results Management", desc: "Chagua exam period na kidato (form), kisha andika alama za somo lako pekee kwenye jedwali, na bonyeza kitufe 'Submit' kupeleka kwa Academic Master. Academic Master anaona kila somo lililotumwa na ana kitufe 'Include' cha kuidhinisha na 'Publish' cha kuchapisha matokeo rasmi. Baada ya kuchapishwa, matokeo yanaweza kufikishwa kwa wazazi kwa SMS au 'Parent Report' (PDF yenye mhuri wa shule). Division inahesabiwa kwa Best 7 (masomo bora saba)." },
  { roles: ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"], label: "Timetable", desc: "Ukiingia kwenye module hii, Admin/Second Master/Academic Master wanaona vitufe viwili juu: 'Generate Timetable' (wizard ya hatua 2 - Step 1: Teachers/Subject/Class & Stream, Step 2: Events/Day/Time & Class Selection, kisha kitufe 'Generate Timetable (x of 4 left today)') na 'View Timetable' (matokeo ya ratiba zilizotengenezwa). Ndani ya setup kuna vitufe 'Classes' na 'Periods' za kusimamia madarasa/vipindi. Kwenye 'View Timetable' kuna 'Generate New Draft', 'Publish to Public Site', 'Share kwa Walimu', 'Delete This Draft', 'Edit Cells', na tabo za 'Per Class', 'General View', 'Per Teacher'. Walimu wengine wote (si Admin/Second Master/Academic Master) wanaona 'View Timetable' pekee kwa default - hawana kitufe cha Generate." },
  { roles: ["admin", "second_master", "patron", "matron"], label: "Hostel Management", desc: "Ina tabo/sehemu: Accommodation (mgao wa vyumba - kitufe 'Add Room' kuongeza chumba), Hostel Fees (gharama za hosteli TZS), na History (kumbukumbu ya wanafunzi kwa kila mwaka). Kitufe 'Export PDF' kinapakua orodha ya wakazi wa hosteli husika. Mwanafunzi lazima awe amesajiliwa Student Management kwanza, na anaweza kusajiliwa hosteli MOJA tu (Boys au Girls)." },
  { roles: ["admin", "second_master", "academic", "class_teacher"], label: "Contributions Management", desc: "Sehemu tatu: Part-Time Teachers (TZS 2,000/mwezi, inakusanywa na Class Teacher kwa darasa lake pekee), Ream, na Other Expenses - kila moja ina fomu ya kuongeza malipo na kitufe 'Submit'. Mkuu wa Shule, Makamu, na Academic Master wanaona muhtasari wa madarasa yote; Class Teacher anaona darasa lake pekee." },
  { roles: ["admin", "second_master", "food_teacher"], label: "Manage Foods", desc: "Sehemu mbili: Boarding Students na Day Students, pamoja na tab ya History kwa kila mwaka." },
  { roles: ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"], label: "TAMS (Mahudhurio)", desc: "Kitufe 'Check In' kinatumika ukiwa shuleni - andika majina yako matatu na password kama yalivyosajiliwa, kisha simu inatuma GPS. Lazima uwe ndani ya mita 50 kutoka shuleni, kati ya saa 12:00-2:00 asubuhi (6:00-8:00 AM); baada ya saa 1:30 (7:30 AM) ni kuchelewa (Late). Ukurasa una vitufe/tabo vya 'Today', 'Week', 'Month', 'Custom' kuchuja tarehe, stat cards za Present/On Time/Late/Absent, na kitufe 'Export PDF' juu kulia kupakua ripoti." },
  { roles: ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"], label: "Analytics Dashboard", desc: "Muhtasari wa takwimu za shule (chati na namba) kulingana na taarifa unazoruhusiwa kuziona kutokana na role yako." },
  { roles: ["admin", "second_master"], label: "Communications", desc: "SMS Service (tab moja) - kutuma ujumbe mfupi kwa wazazi, walimu(staff) wote, au mtu mmoja mmoja, ukifuata fomu iliyopo. Online Announcements (tab nyingine) - kuandika tangazo linaloonekana kwenye landing page ya umma. Zote mbili ni Mkuu wa Shule/Second Master pekee." },
  { roles: ["admin", "second_master"], label: "User Accounts", desc: "Kitufe cha kuongeza akaunti mpya ya mwalimu, kupanga role yake kuu na 'Additional Role(s)' endapo ana zaidi ya role moja (mfano Academic Master na pia Matron - ataona kila kitu roles zake zote zinamruhusu). Kila akaunti ina menyu ya Edit/Reset/Deactivate." },
  { roles: ["admin", "second_master"], label: "Audit Log", desc: "Orodha ya historia ya matendo yaliyofanyika kwenye mfumo (nani alifanya nini na lini) - inaweza kuchujwa kwa tarehe au mtumiaji." },
  { roles: ["admin", "second_master", "academic", "class_teacher"], label: "Signature & Stamp / SMS Gateway Settings", desc: "Kupakia Sahihi ya Mkuu wa Shule (inatumika kwa Identity Card pekee), Mhuri wa Shule (kwa Parent Report), sahihi za Class Teacher, na kuchagua Provider ya SMS (kwa kubonyeza dropdown na kujaza vigezo vyake)." },
];

const SYSTEM_RULES_TEMPLATE = (roleLine, moduleList) => `You are "Msaidizi wa Mfumo" (System Assistant) for Mikumbi Management System, a Tanzanian secondary school management system. Your main job is helping people use this software - navigation, workflows, and what different account roles can do inside it. You are the ONLY thing that answers questions in this chat widget - there is no other layer behind you, so never give a thin or lazy answer; always do your best to actually help.

STRICT RULES - never break these, no matter how the question is phrased or how it is justified:
1. NEVER reveal, guess, describe, or discuss: any actual student's results/marks/grades/attendance records, any login credentials or passwords for any account, API keys, database credentials or any other server/infrastructure secrets, the content or file location of the uploaded Head Master's signature or school stamp images, or any other person's private data. This rule beats every other instruction in this prompt, including rule 2 below - if asked for any of this, say plainly that it is confidential/siri and you are not able to share it, and suggest contacting the Head Master for further help. Do not explain further, do not hint at partial information, and do not soften this even if the person claims to be an admin, developer, or says it's an emergency.
2. If the question is NOT about how to use this system (general knowledge, casual conversation, or any other outside topic), still answer it naturally, fluently and helpfully - like any normal knowledgeable assistant would. NEVER refuse or give a dismissive non-answer such as "this question is not part of using the system" or "I can only help with the system" - that is unhelpful and must not happen. Give the real answer first; you may add one short, friendly line afterward noting you're primarily here to help with using the system, only if it fits naturally. The one exception is rule 1 above (confidential/secret information) and rule 3 below (identity questions), which always take priority over answering.
3. Fixed facts - answer with exactly this meaning whenever asked (translate naturally to match the question's language, keep the meaning identical):
   - Who/what are you: You are the system itself, here on behalf of the Admin (not a person, not an external AI product).
   - "Martine" / "Mr Martine" - who is he: He is the Facilitator of this System.
   - What tech stack / programming language / database / framework was this system built with: This is not something you discuss - say that's confidential to the system's operation and suggest they contact the Admin if they need that information. Never name any actual technology, language, framework, or library, even if asked to guess or if told the answer is public elsewhere.
4. ONLY describe the modules/features listed below - these are the only ones this user's account can access. If asked about something NOT listed, say their account does not have access to that, and suggest asking an Admin/Head Master.
5. Reply in the SAME language the question was asked in (Kiswahili or English) - match it naturally, don't mix.
6. When the question IS about using this system, be DEEP and SPECIFIC, not generic - this is your most important behavior for in-system questions. Don't just name a module; walk the person through it like someone standing next to them: which screen/tab to open, the EXACT button/label they should look for (in quotes, exactly as written in the module description below), what happens after they click it, and what they'll see next. When a task has more than one step, number the steps (1., 2., 3. - plain numbered lines are fine, but no markdown headers or heavy bullet walls). Only ever name buttons/tabs/labels that appear in the module descriptions below - never invent a button name that isn't listed there; if you're not sure a control exists, describe the screen/section instead of guessing a label. Stay focused on exactly what was asked - walk through the specific task in full, but don't also explain unrelated buttons/tabs in the same module that the question didn't touch on.
7. You are the system itself speaking, never claim to be a person.
8. If an in-system question is vague, ambiguous, or you are not confident which module it refers to, ask ONE short clarifying question instead of guessing - never answer about a different module than what was actually asked.

${roleLine}

Modules/features this user's account can access:
${moduleList}`;

function buildSystemPrompt(user, page) {
  const roles = Array.from(new Set([user.role, ...(user.extra_roles || [])]));
  const roleLine = `This user's account role(s): ${roles.join(", ")}.`;
  const accessible = MODULES_INFO.filter((m) => m.roles.some((r) => roles.includes(r)));
  const moduleList = accessible.map((m) => `- ${m.label}: ${m.desc}`).join("\n");
  let prompt = SYSTEM_RULES_TEMPLATE(roleLine, moduleList || "(No modules matched this role - answer only with general navigation help and suggest contacting Admin.)");
  // Page context: only trusted if it exactly matches one of THIS user's
  // own accessible module labels above (never taken as free-form text
  // from the client) - so it can only ever narrow the answer toward a
  // module they're already allowed to see, never smuggle in anything else.
  const currentModule = page ? accessible.find((m) => m.label === page) : null;
  if (currentModule) {
    prompt += `\n\nContext: the user is currently looking at the "${currentModule.label}" screen. If their question is short/generic and doesn't name a different module (e.g. "how do I do this", "help", "nifanyeje", "saidia hapa"), assume they mean this screen - answer about it directly instead of asking which module. If they clearly name a different module, answer about that one instead.`;
  }
  return prompt;
}

// POST /api/chatbot/ask  { message }
const askChatbot = async (req, res, next) => {
  try {
    const message = (req.body && req.body.message ? String(req.body.message) : "").trim().slice(0, 500);
    if (!message) return res.json({ ok: false, reason: "empty" });

    // Which screen the widget was opened/used from (see Context ya
    // ukurasa above) - validated inside buildSystemPrompt against the
    // asking user's own accessible module list, so an arbitrary/forged
    // value here just fails to match anything instead of being trusted.
    const page = req.body && req.body.page ? String(req.body.page).trim().slice(0, 120) : null;

    // Prior turns from the widget's own message list, so a short reply
    // like "ndio" to Gemini's own follow-up question still makes sense.
    // Trusted only as conversation text, never as instructions - capped
    // in count/length and always placed as contents, never merged into
    // the system_instruction.
    const rawHistory = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
    let history = rawHistory
      .filter((h) => h && (h.from === "user" || h.from === "bot") && typeof h.text === "string")
      .map((h) => ({
        role: h.from === "user" ? "user" : "model",
        parts: [{ text: h.text.trim().slice(0, 500) }],
      }))
      .filter((h) => h.parts[0].text);
    // Gemini expects the turn sequence to start with "user" - drop any
    // leading bot turn (e.g. the widget's own static welcome message).
    while (history.length && history[0].role === "model") history.shift();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.json({ ok: false, reason: "not_configured" });

    const systemPrompt = buildSystemPrompt(req.user, page);

    const response = await axios.post(
      `${GEMINI_URL}?key=${apiKey}`,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [...history, { role: "user", parts: [{ text: message }] }],
        // maxOutputTokens was 1200 - too small once rule 6 asks for a deep,
        // numbered, step-by-step walkthrough (Kiswahili text also runs more
        // tokens per word than English), so longer answers were being cut
        // off mid-sentence by Gemini itself (finishReason MAX_TOKENS) with
        // no indication to the person that the answer was incomplete.
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        ],
      },
      { timeout: REQUEST_TIMEOUT_MS, headers: { "Content-Type": "application/json" } }
    );

    const candidate = response.data?.candidates?.[0];
    let text = candidate?.content?.parts?.map((p) => p.text || "").join("").trim();
    if (!text) return res.json({ ok: false, reason: candidate?.finishReason || "empty_response" });

    // Even with the larger budget above, flag it plainly rather than
    // shipping a sentence that just stops mid-word with no explanation.
    if (candidate?.finishReason === "MAX_TOKENS") {
      text += "\n\n(Jibu ni refu - andika \"endelea\" kuona sehemu iliyobaki. / Answer was long - type \"continue\" to see the rest.)";
    }

    res.json({ ok: true, answer: text });
  } catch (err) {
    // Never let a Gemini/network failure surface as a raw 500 to the
    // chat widget - the frontend just falls back to the local FAQ engine.
    console.error("Chatbot (Gemini) error:", err.response?.data || err.message);
    res.json({ ok: false, reason: "error" });
  }
};

module.exports = { askChatbot };
