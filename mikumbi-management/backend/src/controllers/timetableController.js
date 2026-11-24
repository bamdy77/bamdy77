const path = require("path");
const { spawnSync } = require("child_process");
const { query } = require("../db/db");
const PDFDocument = require("pdfkit");
const { tzColumn, formatTZ } = require("../utils/tz");
const { drawLetterhead, drawFooter } = require("../utils/pdfHeader");
const { resolveClassFormStream, resolveClassFormStreamBatch } = require("../utils/classHelper");

// Builds a class label from form+stream, matching how school_classes.label is built
// (never adds a trailing space when stream is empty - critical for stream-less classes).
const labelOf = (form, stream) => (stream ? `${form} ${stream}` : form);

// ── Constants ─────────────────────────────────────────────────────────────────
const FORMS   = ["Form I", "Form II", "Form III", "Form IV"];
const STREAMS = ["A", "B", "C"];
const DAYS    = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ALL_CLASSES = FORMS.flatMap(f => STREAMS.map(s => `${f} ${s}`));
const MAX_GENERATIONS_PER_DAY = 4;
const DRAFT_LABELS = ["1st Draft", "2nd Draft", "3rd Draft", "4th Draft"];
const PY_SCRIPT = path.join(__dirname, "..", "python", "generate_timetable.py");



// Runs the Python constraint solver. Throws a friendly Error on failure.
const runSolver = (payload) => {
  const result = spawnSync("python3", [PY_SCRIPT], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("python3 is not installed on this server. Install Python 3 to use the timetable generator (e.g. 'sudo apt install python3').");
    }
    throw new Error(`Failed to run timetable solver: ${result.error.message}`);
  }
  if (result.status !== 0 && !result.stdout) {
    throw new Error(`Timetable solver crashed: ${result.stderr || "unknown error"}`);
  }
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error(`Timetable solver returned invalid output: ${result.stdout?.slice(0,300)}`); }

  if (!parsed.success) throw new Error(parsed.error || "Timetable solver failed.");
  return parsed;
};

// Tanzania "today" as YYYY-MM-DD, used to cap generations at 5/day.
const tzToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const m = {}; parts.forEach(p => m[p.type] = p.value);
  return `${m.year}-${m.month}-${m.day}`;
};

// ── Periods (core P1-P7 + optional afternoon periods, admin-managed) ─────────

// GET /api/timetable/periods
const getPeriods = async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM timetable_periods WHERE is_active = true ORDER BY sort_order`);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/timetable/periods/all  (including inactive, for admin management screen)
const getAllPeriods = async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM timetable_periods ORDER BY sort_order`);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/timetable/periods - add an OPTIONAL afternoon period (from 14:10 onward, admin-managed)
const addPeriod = async (req, res, next) => {
  try {
    const { label, start_time, end_time } = req.body;
    if (!label || !start_time || !end_time)
      return res.status(400).json({ success: false, message: "Label, start time and end time are required." });

    const maxOrder = await query(`SELECT COALESCE(MAX(sort_order),0) AS m FROM timetable_periods`);
    const result = await query(`
      INSERT INTO timetable_periods (label, start_time, end_time, sort_order, is_break, is_core, is_active)
      VALUES ($1,$2,$3,$4,false,false,true)
      RETURNING *
    `, [label, start_time, end_time, maxOrder.rows[0].m + 1]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// PATCH /api/timetable/periods/:id/toggle
const togglePeriod = async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE timetable_periods SET is_active = NOT is_active WHERE id = $1 AND is_core = false RETURNING *
    `, [req.params.id]);
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Optional period not found (core periods can't be disabled)." });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/timetable/periods/:id
const deletePeriod = async (req, res, next) => {
  try {
    const result = await query(`DELETE FROM timetable_periods WHERE id = $1 AND is_core = false RETURNING id`, [req.params.id]);
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Optional period not found (core periods can't be removed)." });
    res.json({ success: true, message: "Period removed." });
  } catch (err) { next(err); }
};

// ── Special Event Types ───────────────────────────────────────────────────────

// GET /api/timetable/events
const getEventTypes = async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM timetable_event_types ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/timetable/events - add a new event type (e.g. custom club)
const addEventType = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ success: false, message: "Event name required." });
    const result = await query(`
      INSERT INTO timetable_event_types (name) VALUES ($1)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `, [name.trim()]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// ── Scheduled Events (event + day + time + classes, chosen before generating) ─

// GET /api/timetable/event-schedule?academic_year=&term=
const getEventSchedule = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const result = await query(`
      SELECT es.*, et.name AS event_name
      FROM timetable_event_schedule es
      JOIN timetable_event_types et ON et.id = es.event_type_id
      WHERE es.academic_year = $1 AND es.term = $2
      ORDER BY es.day, es.period_label
    `, [academic_year, term]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/timetable/event-schedule - add one scheduled event slot
const addEventSchedule = async (req, res, next) => {
  try {
    const { event_type_id, day, period_label, classes, academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.body;
    if (!event_type_id || !day || !period_label || !classes?.length)
      return res.status(400).json({ success: false, message: "Event, day, time and at least one class are required." });

    const result = await query(`
      INSERT INTO timetable_event_schedule (event_type_id, day, period_label, classes, academic_year, term)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [event_type_id, day, period_label, classes, academic_year, term]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/timetable/event-schedule/:id
const deleteEventSchedule = async (req, res, next) => {
  try {
    await query(`DELETE FROM timetable_event_schedule WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: "Scheduled event removed." });
  } catch (err) { next(err); }
};

// ── Generation status (how many of the 5 daily attempts are used) ────────────

// GET /api/timetable/generation-status?academic_year=&term=
const getGenerationStatus = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const result = await query(`
      SELECT COUNT(*) AS used FROM timetable_generations
      WHERE academic_year = $1 AND term = $2 AND generation_date = $3
    `, [academic_year, term, tzToday()]);
    const used = parseInt(result.rows[0].used);
    res.json({ success: true, data: { used, remaining: Math.max(0, MAX_GENERATIONS_PER_DAY - used), max: MAX_GENERATIONS_PER_DAY, date_tz: tzToday() } });
  } catch (err) { next(err); }
};

// ── Timetable read ────────────────────────────────────────────────────────────

// Returns the most recent generation record (selected_classes + draft_label) for a year/term, or null.
const getLatestGeneration = async (academic_year, term) => {
  const r = await query(`
    SELECT selected_classes, draft_label FROM timetable_generations
    WHERE academic_year = $1 AND term = $2
    ORDER BY created_at DESC LIMIT 1
  `, [academic_year, term]);
  return r.rows.length ? r.rows[0] : null;
};

// Returns the currently PUBLISHED draft for a year/term, or null if the
// Head Master hasn't published anything yet. Public timetable exports must
// use this - never getLatestGeneration - so an unpublished draft is never
// visible to parents/students on the public Publications page.
const getPublishedGeneration = async (academic_year, term) => {
  const r = await query(`
    SELECT selected_classes, draft_label FROM timetable_generations
    WHERE academic_year = $1 AND term = $2 AND is_published = true
    ORDER BY created_at DESC LIMIT 1
  `, [academic_year, term]);
  return r.rows.length ? r.rows[0] : null;
};

// GET /api/timetable/public/status?academic_year=&term= - lets the public
// Publications page know whether a timetable exists to show at all, before
// rendering any download links.
const getPublicStatus = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const published = await getPublishedGeneration(academic_year, term);
    res.json({ success: true, published: !!published, draft_label: published?.draft_label || null });
  } catch (err) { next(err); }
};

// GET /api/timetable/public/classes-with-data?academic_year=&term= - for the
// Publications page's "Per Class" selector. Used behind requirePublishedDraft
// (sets req.query.draft to whichever draft is currently published), so this
// only ever returns classes that actually have at least one scheduled cell
// IN THAT PUBLISHED DRAFT - not every class configured in the school. A class
// that was set up but never got a timetable generated for it (or wasn't
// selected in that generation run) is left out, so the visitor never picks a
// class and gets a blank/empty PDF.
const getPublicClassesWithData = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1", draft } = req.query;
    const result = await query(
      `SELECT DISTINCT form, stream FROM timetable WHERE academic_year=$1 AND term=$2 AND draft_label=$3 ORDER BY form, stream`,
      [academic_year, term, draft]
    );
    const data = result.rows.map((r) => ({ form: r.form, stream: r.stream || "", label: labelOf(r.form, r.stream) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// POST /api/timetable/publish  { academic_year, term, draft_label } - Admin
// only. Marks ONE draft as the published/public one for that year+term
// (unpublishing any previously-published draft for the same period first).
const publishDraft = async (req, res, next) => {
  const { academic_year = String(new Date().getFullYear()), term = "Term 1", draft_label } = req.body;
  if (!draft_label) return res.status(400).json({ success: false, message: "draft_label is required." });
  try {
    await query(`UPDATE timetable_generations SET is_published = false WHERE academic_year=$1 AND term=$2`, [academic_year, term]);
    const result = await query(
      `UPDATE timetable_generations SET is_published = true WHERE academic_year=$1 AND term=$2 AND draft_label=$3`,
      [academic_year, term, draft_label]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "That draft was not found - generate it first." });
    res.json({ success: true, message: `${draft_label} is now published.` });
  } catch (err) { next(err); }
};

// POST /api/timetable/unpublish  { academic_year, term } - Admin only.
// Removes the public timetable entirely (e.g. to fix something before
// re-publishing) without deleting the underlying draft data.
const unpublishDraft = async (req, res, next) => {
  const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.body;
  try {
    await query(`UPDATE timetable_generations SET is_published = false WHERE academic_year=$1 AND term=$2`, [academic_year, term]);
    res.json({ success: true, message: "Timetable unpublished. It is no longer visible on the public Publications page." });
  } catch (err) { next(err); }
};

// ── Share with Teachers ─────────────────────────────────────────────────────
// Separate from is_published above (which controls the PUBLIC Publications
// site) - this controls whether ordinary Teachers/Patron/Matron/Class
// Teacher/Food Teacher (who only ever get "View Timetable") see a draft
// inside their own logged-in Timetable module at all. Same one-active-draft-
// per-year+term pattern as publish/unpublish.
const getSharedStatus = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const { rows } = await query(
      `SELECT draft_label, shared_at FROM timetable_generations WHERE academic_year=$1 AND term=$2 AND shared_with_teachers=true ORDER BY shared_at DESC LIMIT 1`,
      [academic_year, term]
    );
    res.json({ success: true, shared: !!rows.length, draft_label: rows[0]?.draft_label || null, shared_at: rows[0]?.shared_at || null });
  } catch (err) { next(err); }
};

// POST /api/timetable/share  { academic_year, term, draft_label } - Admin/
// Second Master/Academic Master. Makes this draft visible to every other
// teacher's own "View Timetable".
const shareDraft = async (req, res, next) => {
  const { academic_year = String(new Date().getFullYear()), term = "Term 1", draft_label } = req.body;
  if (!draft_label) return res.status(400).json({ success: false, message: "draft_label is required." });
  try {
    await query(`UPDATE timetable_generations SET shared_with_teachers = false, shared_at = NULL, shared_by = NULL WHERE academic_year=$1 AND term=$2`, [academic_year, term]);
    const result = await query(
      `UPDATE timetable_generations SET shared_with_teachers = true, shared_at = NOW(), shared_by = $4 WHERE academic_year=$1 AND term=$2 AND draft_label=$3`,
      [academic_year, term, draft_label, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "That draft was not found - generate it first." });
    res.json({ success: true, message: `${draft_label} imeshirikiwa kwa walimu wote.` });
  } catch (err) { next(err); }
};

// POST /api/timetable/unshare  { academic_year, term } - Admin/Second
// Master/Academic Master.
const unshareDraft = async (req, res, next) => {
  const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.body;
  try {
    await query(`UPDATE timetable_generations SET shared_with_teachers = false, shared_at = NULL, shared_by = NULL WHERE academic_year=$1 AND term=$2`, [academic_year, term]);
    res.json({ success: true, message: "Timetable haishirikiwi tena na walimu." });
  } catch (err) { next(err); }
};

// DELETE /api/timetable/draft  { academic_year, term, draft_label } - Admin/Academic.
// Permanently removes ONE saved draft (its timetable cells + its generation
// record). Blocked while that draft is the published one - unpublish first,
// so the public Publications page can never be left pointing at nothing.
const deleteDraft = async (req, res, next) => {
  const { academic_year = String(new Date().getFullYear()), term = "Term 1", draft_label } = req.body;
  if (!draft_label) return res.status(400).json({ success: false, message: "draft_label is required." });
  try {
    const pub = await query(
      `SELECT 1 FROM timetable_generations WHERE academic_year=$1 AND term=$2 AND draft_label=$3 AND is_published=true`,
      [academic_year, term, draft_label]
    );
    if (pub.rows.length) {
      return res.status(400).json({ success: false, message: `${draft_label} is currently published - unpublish it first, then delete.` });
    }
    await query(`DELETE FROM timetable WHERE academic_year=$1 AND term=$2 AND draft_label=$3`, [academic_year, term, draft_label]);
    const result = await query(`DELETE FROM timetable_generations WHERE academic_year=$1 AND term=$2 AND draft_label=$3`, [academic_year, term, draft_label]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "That draft was not found." });
    res.json({ success: true, message: `${draft_label} deleted.` });
  } catch (err) { next(err); }
};

// GET /api/timetable/drafts?academic_year=&term= - list all drafts generated so far (for the draft selector)
const getDrafts = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const r = await query(`
      SELECT DISTINCT draft_label, MIN(created_at) AS first_seen
      FROM timetable_generations WHERE academic_year = $1 AND term = $2
      GROUP BY draft_label
    `, [academic_year, term]);
    // Order by the canonical draft sequence, not alphabetically.
    const ordered = DRAFT_LABELS.filter(d => r.rows.some(row => row.draft_label === d));
    res.json({ success: true, data: ordered });
  } catch (err) { next(err); }
};

// GET /api/timetable?form=&stream=&academic_year=&term=&masterOnly=true&draft=
const getTimetable = async (req, res, next) => {
  try {
    const { form, stream, academic_year = String(new Date().getFullYear()), term = "Term 1", masterOnly } = req.query;
    let allowedClasses = null;

    const latest = await getLatestGeneration(academic_year, term);
    const draftLabel = req.query.draft || (latest ? latest.draft_label : "1st Draft");

    if (masterOnly === "true") {
      const forDraft = await query(`
        SELECT selected_classes FROM timetable_generations
        WHERE academic_year = $1 AND term = $2 AND draft_label = $3
        ORDER BY created_at DESC LIMIT 1
      `, [academic_year, term, draftLabel]);
      allowedClasses = forDraft.rows.length ? forDraft.rows[0].selected_classes : [];
    }

    let sql = `
      SELECT tt.*, COALESCE(u.username, t.short_name) AS teacher_name
      FROM timetable tt
      LEFT JOIN teachers t ON t.id = tt.teacher_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE tt.academic_year = $1 AND tt.term = $2 AND tt.draft_label = $3
    `;
    const params = [academic_year, term, draftLabel];
    let i = 4;
    if (form)   { sql += ` AND tt.form = $${i++}`;   params.push(form); }
    if (stream) { sql += ` AND tt.stream = $${i++}`; params.push(stream); }
    sql += " ORDER BY tt.form, tt.stream, tt.day, tt.period";

    const result = await query(sql, params);
    let rows = result.rows;
    if (allowedClasses) {
      const set = new Set(allowedClasses);
      rows = rows.filter(r => set.has(labelOf(r.form, r.stream)));
    }
    res.json({ success: true, data: rows, master_classes: allowedClasses, draft_label: draftLabel });
  } catch (err) { next(err); }
};

// ── Generate (Python solver) ──────────────────────────────────────────────────

// POST /api/timetable/generate   body: { academic_year, term, classes:[...] }
const generateTimetable = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.body;
    const classes = (req.body.classes && req.body.classes.length) ? req.body.classes : ALL_CLASSES;

    // 1) Count today's generations only to label this draft (1st Draft, 2nd
    //    Draft, ...). There is NO daily cap: each generation stays saved under
    //    its own draft_label so the school can go back and pick whichever draft
    //    they want to use.
    const today = tzToday();
    const usedRes = await query(`
      SELECT COUNT(*) AS used FROM timetable_generations
      WHERE academic_year = $1 AND term = $2 AND generation_date = $3
    `, [academic_year, term, today]);
    const used = parseInt(usedRes.rows[0].used);
    const attemptNumber = used + 1;
    const draftLabel = DRAFT_LABELS[attemptNumber - 1] || `Draft ${attemptNumber}`;

    // 2) Active periods.
    const periodsRes = await query(`SELECT label, is_break FROM timetable_periods WHERE is_active = true ORDER BY sort_order`);
    if (!periodsRes.rows.some(p => !p.is_break))
      return res.status(400).json({ success: false, message: "No active lesson periods configured." });

    // 3) Teacher assignments for the selected classes only (cls computed in JS,
    //    never via SQL string concat, so stream-less classes like "Form I" work correctly).
    const allAssignments = await query(`
      SELECT t.id AS teacher_id, COALESCE(u.username, t.short_name) AS teacher_name, ta.form, ta.stream, ta.subject, ta.periods_per_week
      FROM teacher_assignments ta
      JOIN teachers t ON t.id = ta.teacher_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.is_active = true
    `);
    const classSet = new Set(classes);
    const taResult = { rows: allAssignments.rows
      .map(r => ({ ...r, cls: labelOf(r.form, r.stream) }))
      .filter(r => classSet.has(r.cls)) };
    if (!taResult.rows.length)
      return res.status(400).json({ success: false, message: "No teacher assignments found for the selected classes. Add teachers first." });

    // 4) Scheduled events for these classes.
    const evResult = await query(`
      SELECT es.day, es.period_label, es.classes, et.name AS event_name
      FROM timetable_event_schedule es
      JOIN timetable_event_types et ON et.id = es.event_type_id
      WHERE es.academic_year = $1 AND es.term = $2
    `, [academic_year, term]);
    const events = evResult.rows
      .map(e => ({ day: e.day, period_label: e.period_label, event_name: e.event_name, classes: e.classes.filter(c => classes.includes(c)) }))
      .filter(e => e.classes.length);

    // 5) Run the Python solver with a fresh seed for this attempt (variety across the daily drafts).
    const seed = attemptNumber * 100000 + (Date.now() % 100000);
    const solverOut = runSolver({
      days: DAYS,
      periods: periodsRes.rows.map(p => ({ label: p.label, is_break: p.is_break })),
      classes,
      assignments: taResult.rows,
      events,
      seed,
    });

    // 6) Persist under THIS draft's label only - earlier drafts are never touched,
    //    so the school can compare/switch between all drafts generated today.
    const classMap = await resolveClassFormStreamBatch(classes);
    const formsArr = [], streamsArr = [];
    for (const cls of classes) {
      const { form, stream } = classMap[cls];
      formsArr.push(form); streamsArr.push(stream);
    }
    if (formsArr.length) {
      await query(
        `DELETE FROM timetable
         WHERE academic_year=$3 AND term=$4 AND draft_label=$5
           AND (form, stream) IN (SELECT * FROM UNNEST($1::text[], $2::text[]))`,
        [formsArr, streamsArr, academic_year, term, draftLabel]
      );
    }

    const teacherIdByName = {};
    taResult.rows.forEach(t => { teacherIdByName[t.teacher_name] = t.teacher_id; });

    // Resolve form/stream for every cell first (cheap - classMap already has
    // almost all of them from the batch lookup above; the per-cell fallback
    // only fires for the rare class that batch lookup missed).
    const rows = [];
    for (const cell of solverOut.cells) {
      const { form, stream } = classMap[cell.cls] || await resolveClassFormStream(cell.cls);
      rows.push([
        form, stream, cell.day, cell.period, cell.subject || null,
        cell.subject ? (teacherIdByName[cell.teacher_name] || null) : null,
        !!cell.is_event, cell.event_name || null, academic_year, term, draftLabel,
      ]);
    }

    // Was previously one `await query(...)` PER CELL - for a full school
    // timetable (hundreds of cells) that meant hundreds of sequential
    // network round-trips to the database, which is what made generation
    // take minutes. Batching into chunked multi-row INSERTs does the same
    // work in a handful of round-trips instead.
    const COLS = 11;
    const CHUNK = 400; // rows per statement - comfortably under Postgres's ~65535 parameter limit (400*11=4400)
    for (let start = 0; start < rows.length; start += CHUNK) {
      const chunk = rows.slice(start, start + CHUNK);
      const valuesSql = chunk.map((_, i) => {
        const base = i * COLS;
        const placeholders = Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`).join(",");
        return `(${placeholders})`;
      }).join(",");
      const params = chunk.flat();
      await query(`
        INSERT INTO timetable (form, stream, day, period, subject, teacher_id, is_event, event_name, academic_year, term, draft_label)
        VALUES ${valuesSql}
        ON CONFLICT (form, stream, day, period, academic_year, term, draft_label)
        DO UPDATE SET subject=EXCLUDED.subject, teacher_id=EXCLUDED.teacher_id, is_event=EXCLUDED.is_event, event_name=EXCLUDED.event_name, updated_at=NOW()
      `, params);
    }

    // 7) Log the generation attempt.
    await query(`
      INSERT INTO timetable_generations (academic_year, term, generation_date, attempt_number, draft_label, selected_classes, seed, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [academic_year, term, today, attemptNumber, draftLabel, classes, seed, req.user?.id || null]);

    const saved = await query(`
      SELECT tt.*, COALESCE(u.username, t.short_name) AS teacher_name
      FROM timetable tt LEFT JOIN teachers t ON t.id = tt.teacher_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE tt.academic_year = $1 AND tt.term = $2 AND tt.draft_label = $3
      ORDER BY tt.form, tt.stream, tt.day, tt.period
    `, [academic_year, term, draftLabel]);

    res.json({
      success: true,
      message: `${draftLabel} generated.`,
      data: saved.rows,
      selected_classes: classes,
      attempt_number: attemptNumber,
      draft_label: draftLabel,
      unplaced: solverOut.unplaced || [],
    });
  } catch (err) { next(err); }
};

// PUT /api/timetable/cell - edit a single cell
const updateCell = async (req, res, next) => {
  try {
    const { form, stream, day, period, subject, teacher_id, academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.body;
    const latest = await getLatestGeneration(academic_year, term);
    const draftLabel = req.body.draft_label || (latest ? latest.draft_label : "1st Draft");

    const result = await query(`
      INSERT INTO timetable (form, stream, day, period, subject, teacher_id, is_event, event_name, academic_year, term, draft_label)
      VALUES ($1,$2,$3,$4,$5,$6,false,NULL,$7,$8,$9)
      ON CONFLICT (form, stream, day, period, academic_year, term, draft_label)
      DO UPDATE SET subject = EXCLUDED.subject, teacher_id = EXCLUDED.teacher_id, is_event=false, event_name=NULL, updated_at = NOW()
      RETURNING *
    `, [form, stream, day, period, subject || null, teacher_id || null, academic_year, term, draftLabel]);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/timetable/cell - clear a cell
const clearCell = async (req, res, next) => {
  try {
    const { form, stream, day, period, academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.body;
    const latest = await getLatestGeneration(academic_year, term);
    const draftLabel = req.body.draft_label || (latest ? latest.draft_label : "1st Draft");
    await query(`
      DELETE FROM timetable
      WHERE form=$1 AND stream=$2 AND day=$3 AND period=$4 AND academic_year=$5 AND term=$6 AND draft_label=$7
    `, [form, stream, day, period, academic_year, term, draftLabel]);
    res.json({ success: true, message: "Cell cleared." });
  } catch (err) { next(err); }
};

// GET /api/timetable/teacher/:teacherId?academic_year=&term=&draft=
const getTeacherTimetable = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const latest = await getLatestGeneration(academic_year, term);
    const draftLabel = req.query.draft || (latest ? latest.draft_label : "1st Draft");
    const result = await query(`
      SELECT tt.*, COALESCE(u.username, t.short_name) AS teacher_name
      FROM timetable tt
      JOIN teachers t ON t.id = tt.teacher_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE tt.teacher_id = $1 AND tt.academic_year = $2 AND tt.term = $3 AND tt.draft_label = $4
      ORDER BY tt.day, tt.period
    `, [req.params.teacherId, academic_year, term, draftLabel]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// ── PDF Exports ────────────────────────────────────────────────────────────────

const cellLabel = (row) => {
  if (!row) return "-";
  if (row.is_event) return row.event_name;
  if (!row.subject) return "-";
  return `${row.subject}${row.teacher_name ? ` (${row.teacher_name})` : ""}`;
};

// ── Shared boxed-cell renderer ───────────────────────────────────────────────
// Every populated timetable cell (subject/teacher, or a scheduled event) is
// drawn as a small rounded, tinted box with a bold top line and a lighter
// bottom line underneath - matching the school's printed timetable style.
// An empty cell just gets a centered dash, no box.
const SUBJ_BOX_BG     = "#ECFDF5";
const SUBJ_BOX_BORDER = "#A7F3D0";
const SUBJ_TOP_COLOR  = "#065F46";
const SUBJ_SUB_COLOR  = "#64748B";
const EVENT_BOX_BG     = "#EFF6FF";
const EVENT_BOX_BORDER = "#BFDBFE";
const EVENT_TEXT_COLOR = "#1D4ED8";

// `cell` is either null/undefined (empty), { isEvent:true, top } or { top, bottom }.
function drawCellBox(doc, cell, x, y, w, h, { topSize = 7.5, subSize = 6.5 } = {}) {
  const pad = 3;
  if (!cell || !cell.top) {
    doc.font("Helvetica").fontSize(topSize).fillColor("#CBD5E1")
      .text("-", x, y + h / 2 - topSize / 2, { width: w, align: "center" });
    return;
  }
  const bg = cell.isEvent ? EVENT_BOX_BG : SUBJ_BOX_BG;
  const border = cell.isEvent ? EVENT_BOX_BORDER : SUBJ_BOX_BORDER;
  doc.roundedRect(x + 1.5, y + 1.5, Math.max(w - 3, 2), Math.max(h - 3, 2), 3)
    .fillAndStroke(bg, border);
  doc.lineWidth(0.7).strokeColor(border);

  const innerW = Math.max(w - pad * 2, 2);
  if (cell.isEvent) {
    doc.font("Helvetica-Bold").fontSize(topSize).fillColor(EVENT_TEXT_COLOR)
      .text(cell.top, x + pad, y + h / 2 - topSize / 2, { width: innerW, align: "center", ellipsis: true });
    return;
  }
  doc.font("Helvetica-Bold").fontSize(topSize).fillColor(SUBJ_TOP_COLOR)
    .text(cell.top, x + pad, y + pad, { width: innerW, height: h / 2 - 1, ellipsis: true });
  if (cell.bottom) {
    doc.font("Helvetica").fontSize(subSize).fillColor(SUBJ_SUB_COLOR)
      .text(cell.bottom, x + pad, y + h / 2 + 1, { width: innerW, height: h / 2 - pad, ellipsis: true });
  }
}

// Builds the { top, bottom, isEvent } shape drawCellBox expects, for a class
// or master-view cell (top = subject, bottom = teacher).
const classCellOf = (row) => {
  if (!row) return null;
  if (row.is_event) return { isEvent: true, top: row.event_name };
  if (!row.subject) return null;
  return { top: row.subject, bottom: row.teacher_name || "" };
};

// Same shape for a teacher-view cell (top = class, bottom = subject - the
// teacher is already known from the page, so it isn't repeated per cell).
const teacherCellOf = (row) => {
  if (!row) return null;
  return { top: labelOf(row.form, row.stream), bottom: row.subject || "" };
};

// Two-line "P1\n08:00–08:40" period header label, used consistently across
// every exported timetable PDF (class / teacher / general).
const periodHeaderText = (p) => `${p.label}\n${p.start_time}\u2013${p.end_time}`;

// GET /api/timetable/pdf/class?form=&stream=&academic_year=&term=
const exportClassPdf = async (req, res, next) => {
  try {
    const { form, academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const stream = req.query.stream || ""; // "" is valid - means a stream-less class like "Form I"
    if (!form) return res.status(400).json({ success: false, message: "form is required." });

    const latest = await getLatestGeneration(academic_year, term);
    const draftLabel = req.query.draft || (latest ? latest.draft_label : "1st Draft");

    const [rowsRes, periodsRes] = await Promise.all([
      query(`SELECT tt.*, COALESCE(u.username, t.short_name) AS teacher_name FROM timetable tt LEFT JOIN teachers t ON t.id=tt.teacher_id
             LEFT JOIN users u ON u.id = t.user_id
             WHERE tt.form=$1 AND tt.stream=$2 AND tt.academic_year=$3 AND tt.term=$4 AND tt.draft_label=$5`, [form, stream, academic_year, term, draftLabel]),
      query(`SELECT * FROM timetable_periods WHERE is_active=true ORDER BY sort_order`),
    ]);
    const map = {};
    rowsRes.rows.forEach(r => { map[`${r.day}|${r.period}`] = r; });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${labelOf(form, stream).replace(/\s+/g,"-")}-timetable.pdf"`);
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `Class Timetable - ${labelOf(form, stream)}  (${academic_year} · ${term} · ${draftLabel})`);

    const colW = 95, timeColW = 70;
    const left = doc.page.margins.left;
    const tableTop = doc.y;
    let x = left;
    const headerH = 22;
    doc.rect(left, tableTop, timeColW + colW * DAYS.length, headerH).fill("#334155");
    doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
    doc.text("Period", x + 4, tableTop + 6, { width: timeColW - 6 }); x += timeColW;
    DAYS.forEach(d => { doc.text(d, x + 4, tableTop + 6, { width: colW - 6 }); x += colW; });
    let y = tableTop + headerH;

    periodsRes.rows.forEach((p, ridx) => {
      const rowH = 28;
      if (ridx % 2 === 0 && !p.is_break) doc.rect(left, y, timeColW + colW * DAYS.length, rowH).fill("#F8FAFC");
      if (p.is_break) doc.rect(left, y, timeColW + colW * DAYS.length, rowH).fill("#F1F5F9");
      doc.font(p.is_break ? "Helvetica-Oblique" : "Helvetica-Bold").fontSize(7.5).fillColor(p.is_break ? "#94A3B8" : "#334155");
      doc.text(periodHeaderText(p), left + 4, y + 6, { width: timeColW - 8 });
      let cx = left + timeColW;
      DAYS.forEach(d => {
        if (p.is_break) {
          doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#94A3B8")
            .text(p.label, cx, y + rowH / 2 - 4, { width: colW, align: "center" });
        } else {
          drawCellBox(doc, classCellOf(map[`${d}|${p.label}`]), cx, y, colW, rowH);
        }
        cx += colW;
      });
      y += rowH;
    });
    doc.rect(left, tableTop, timeColW + colW * DAYS.length, y - tableTop).strokeColor("#CBD5E1").lineWidth(0.7).stroke();

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/timetable/pdf/teacher/:teacherId?academic_year=&term=
const exportTeacherPdf = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const tRes = await query(`SELECT t.*, u.username AS registered_username FROM teachers t LEFT JOIN users u ON u.id = t.user_id WHERE t.id=$1`, [req.params.teacherId]);
    if (!tRes.rows.length) return res.status(404).json({ success: false, message: "Teacher not found." });
    const teacher = tRes.rows[0];
    const teacherLabel = teacher.registered_username || teacher.short_name;

    const latest = await getLatestGeneration(academic_year, term);
    const draftLabel = req.query.draft || (latest ? latest.draft_label : "1st Draft");

    const [rowsRes, periodsRes] = await Promise.all([
      query(`SELECT * FROM timetable WHERE teacher_id=$1 AND academic_year=$2 AND term=$3 AND draft_label=$4`, [req.params.teacherId, academic_year, term, draftLabel]),
      query(`SELECT * FROM timetable_periods WHERE is_active=true ORDER BY sort_order`),
    ]);
    const map = {};
    rowsRes.rows.forEach(r => { map[`${r.day}|${r.period}`] = r; });
    // Counts distinct Day+Period slots this teacher is actually scheduled for
    // this week - teacher_id is only ever set on real lesson cells (never on
    // events), so this always matches exactly what's drawn on the grid below.
    const weeklyPeriods = new Set(rowsRes.rows.map(r => `${r.day}|${r.period}`)).size;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${teacherLabel}-timetable.pdf"`);
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `Teacher Timetable - ${teacherLabel}  ·  ${academic_year} · ${term} · ${draftLabel}  ·  ${weeklyPeriods} periods per week`);

    const colW = 95, timeColW = 70;
    const left = doc.page.margins.left;
    const tableTop = doc.y;
    let x = left;
    const headerH = 22;
    doc.rect(left, tableTop, timeColW + colW * DAYS.length, headerH).fill("#334155");
    doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
    doc.text("Period", x + 4, tableTop + 6, { width: timeColW - 6 }); x += timeColW;
    DAYS.forEach(d => { doc.text(d, x + 4, tableTop + 6, { width: colW - 6 }); x += colW; });
    let y = tableTop + headerH;

    periodsRes.rows.forEach((p, ridx) => {
      const rowH = 28;
      if (ridx % 2 === 0 && !p.is_break) doc.rect(left, y, timeColW + colW * DAYS.length, rowH).fill("#F8FAFC");
      if (p.is_break) doc.rect(left, y, timeColW + colW * DAYS.length, rowH).fill("#F1F5F9");
      doc.font(p.is_break ? "Helvetica-Oblique" : "Helvetica-Bold").fontSize(7.5).fillColor(p.is_break ? "#94A3B8" : "#334155");
      doc.text(periodHeaderText(p), left + 4, y + 6, { width: timeColW - 8 });
      let cx = left + timeColW;
      DAYS.forEach(d => {
        if (p.is_break) {
          doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#94A3B8")
            .text(p.label, cx, y + rowH / 2 - 4, { width: colW, align: "center" });
        } else {
          drawCellBox(doc, teacherCellOf(map[`${d}|${p.label}`]), cx, y, colW, rowH);
        }
        cx += colW;
      });
      y += rowH;
    });
    doc.rect(left, tableTop, timeColW + colW * DAYS.length, y - tableTop).strokeColor("#CBD5E1").lineWidth(0.7).stroke();

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/timetable/pdf/master?academic_year=&term=  - matches the day-by-day, class-rows layout
const exportMasterPdf = async (req, res, next) => {
  try {
    const { academic_year = String(new Date().getFullYear()), term = "Term 1" } = req.query;
    const latest = await getLatestGeneration(academic_year, term);
    const draftLabel = req.query.draft || (latest ? latest.draft_label : "1st Draft");
    const forDraft = await query(`
      SELECT selected_classes FROM timetable_generations
      WHERE academic_year=$1 AND term=$2 AND draft_label=$3 ORDER BY created_at DESC LIMIT 1
    `, [academic_year, term, draftLabel]);
    const classes = forDraft.rows.length ? forDraft.rows[0].selected_classes : ALL_CLASSES;

    const [rowsRes, periodsRes] = await Promise.all([
      query(`
        SELECT tt.*, COALESCE(u.username, t.short_name) AS teacher_name
        FROM timetable tt
        LEFT JOIN teachers t ON t.id = tt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE tt.academic_year=$1 AND tt.term=$2 AND tt.draft_label=$3
      `, [academic_year, term, draftLabel]),
      query(`SELECT * FROM timetable_periods WHERE is_active=true ORDER BY sort_order`),
    ]);
    const map = {};
    rowsRes.rows.forEach(r => { map[`${labelOf(r.form, r.stream)}|${r.day}|${r.period}`] = r; });

    // A class picked when generating (selected_classes) but with no teacher/
    // subject actually assigned to it produces zero rows - printing it would
    // just be an all-dashes row on every page for a class nobody "worked on".
    // Drop those from the printout (falling back to the full list only if
    // literally nothing has data, so the PDF is never blank).
    const classesWithData = classes.filter(cls => rowsRes.rows.some(r => labelOf(r.form, r.stream) === cls));
    const printClasses = classesWithData.length ? classesWithData : classes;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="general-school-timetable.pdf"`);
    const doc = new PDFDocument({ margin: 24, size: "A4", layout: "landscape", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `General school Timetable  ·  ${academic_year} · ${term} · ${draftLabel}`);

    const classColW = 68;
    const periodCols = periodsRes.rows;
    const availWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - classColW;
    const perColW = Math.max(40, Math.floor(availWidth / periodCols.length));

    DAYS.forEach(day => {
      if (doc.y > doc.page.height - 170) doc.addPage({ margin: 24, size: "A4", layout: "landscape" });
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#4F46E5").text(day);
      doc.moveDown(0.2);

      const left = doc.page.margins.left;
      const headerY = doc.y;
      const headerH = 24;
      doc.rect(left, headerY, classColW + perColW * periodCols.length, headerH).fill("#334155");
      let x = left;
      doc.fillColor("#FFFFFF").fontSize(7).font("Helvetica-Bold");
      doc.text("Class", x + 3, headerY + 8, { width: classColW - 4 }); x += classColW;
      periodCols.forEach(p => {
        doc.text(periodHeaderText(p), x + 3, headerY + 4, { width: perColW - 4, align: "center" });
        x += perColW;
      });
      let y = headerY + headerH;

      printClasses.forEach((cls, idx) => {
        const rowH = 24;
        if (idx % 2 === 0) doc.rect(left, y, classColW + perColW * periodCols.length, rowH).fill("#F8FAFC");
        let cx = left;
        doc.fontSize(7).font("Helvetica-Bold").fillColor("#0F172A").text(cls, cx + 3, y + rowH / 2 - 4, { width: classColW - 4 });
        cx += classColW;
        periodCols.forEach(p => {
          if (p.is_break) {
            doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#94A3B8")
              .text(p.label, cx, y + rowH / 2 - 3.5, { width: perColW, align: "center" });
          } else {
            drawCellBox(doc, classCellOf(map[`${cls}|${day}|${p.label}`]), cx, y, perColW, rowH, { topSize: 6.5, subSize: 5.5 });
          }
          cx += perColW;
        });
        y += rowH;
      });
      doc.rect(left, headerY, classColW + perColW * periodCols.length, y - headerY).strokeColor("#CBD5E1").lineWidth(0.6).stroke();
      doc.y = y + 12;
    });

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

module.exports = {
  getTimetable, generateTimetable, updateCell, clearCell, getTeacherTimetable,
  getPeriods, getAllPeriods, addPeriod, togglePeriod, deletePeriod,
  getEventTypes, addEventType,
  getEventSchedule, addEventSchedule, deleteEventSchedule,
  getGenerationStatus, getDrafts, deleteDraft,
  exportClassPdf, exportTeacherPdf, exportMasterPdf,
  getPublicStatus, publishDraft, unpublishDraft, getPublicClassesWithData,
  getSharedStatus, shareDraft, unshareDraft,
};
