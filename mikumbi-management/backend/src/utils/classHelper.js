const { query } = require("../db/db");

// Resolves a class label (e.g. "Form I A" or just "Form I") to its real
// {form, stream} using the school_classes table — never guesses by splitting
// words, which breaks for stream-less classes (e.g. "Form I" alone would be
// mis-parsed as form="Form", stream="I").
// `stream` is returned as "" (empty string, never null) when the class has no stream,
// so it stays consistent with the NOT NULL `stream` columns on teacher_assignments/timetable.
async function resolveClassFormStream(label) {
  const r = await query(`SELECT form, stream FROM school_classes WHERE label = $1`, [label]);
  if (r.rows.length) return { form: r.rows[0].form, stream: r.rows[0].stream || "" };

  // Fallback (only hit if the class isn't registered in school_classes yet):
  // treat a single trailing A-E letter as a stream, otherwise no stream at all.
  const parts = label.trim().split(" ");
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^[A-E]$/.test(last)) {
    parts.pop();
    return { form: parts.join(" "), stream: last };
  }
  return { form: label.trim(), stream: "" };
}

// Builds a Map<label, {form,stream}> in one query for a batch of class labels
// (avoids N+1 queries when resolving many classes at once, e.g. during generation).
async function resolveClassFormStreamBatch(labels) {
  const r = await query(`SELECT form, stream, label FROM school_classes WHERE label = ANY($1)`, [labels]);
  const map = {};
  r.rows.forEach(row => { map[row.label] = { form: row.form, stream: row.stream || "" }; });
  for (const label of labels) {
    if (!map[label]) map[label] = await resolveClassFormStream(label);
  }
  return map;
}

module.exports = { resolveClassFormStream, resolveClassFormStreamBatch };
