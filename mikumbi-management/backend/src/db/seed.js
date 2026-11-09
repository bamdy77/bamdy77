require("dotenv").config();
const bcrypt = require("bcryptjs");
const { query, waitForDb } = require("./db");

async function seed() {
  console.log("Seeding database...");
  console.log("Checking database connection...");
  await waitForDb();
  console.log("Connected.");

  // ── Users ─────────────────────────────────────────────────────────────────
  const adminPass = await bcrypt.hash("admin123", 10);
  const academicPass = await bcrypt.hash("academic123", 10);

  await query(`
    INSERT INTO users (username, password, full_name, role)
    VALUES
      ('admin',    $1, 'admin',                'admin'),
      ('academic', $2, 'Academic Master',      'academic')
    ON CONFLICT (username) DO NOTHING;
  `, [adminPass, academicPass]);

  // Older installs may have this account mislabeled "Second Master" from a
  // previous seed — the 'academic' role IS the Academic Master, a distinct
  // person/position from the Second Master, so the display name must match.
  await query(`UPDATE users SET full_name = 'Academic Master' WHERE username = 'academic' AND full_name = 'Second Master';`);

  // ── Hostel Rooms (Girls Hostel only — Boys Hostel is one Hall, no rooms) ──
  const rooms = [];
  for (let i = 1; i <= 6; i++) {
    rooms.push(`('Girls Hostel', 'Room ${i}', 6, 'Female')`);
  }
  await query(`
    INSERT INTO hostel_rooms (hostel_name, room_number, capacity, gender)
    VALUES ${rooms.join(",")}
    ON CONFLICT (hostel_name, room_number) DO NOTHING;
  `);

  // ── Sample Students ───────────────────────────────────────────────────────
  const seedStudents = await query(`
    INSERT INTO students
      (prem_no, reg_no, first_name, middle_name, last_name, gender, dob,
       form, district, admission_date, status, parent_name, parent_phone)
    VALUES
      ('PREM-2024-001','S4005/0001','Amina','Juma','Ally','Female','2010-03-12',
       'Form I','Newala','2024-01-15','Active','Ally Hassan','0754000001'),
      ('PREM-2024-002','S4005/0002','David','Peter','Mchome','Male','2009-07-22',
       'Form II','Tandahimba','2024-01-15','Active','Grace Mchome','0754000002'),
      ('PREM-2024-003','S4005/0003','Fatuma','Salim','Mkwawa','Female','2008-11-05',
       'Form III','Newala','2023-01-15','Active','Mkwawa Salim','0754000003'),
      ('PREM-2023-004','S4005/0004','Emmanuel','Mary','Chacha','Male','2007-02-18',
       'Form IV','Masasi','2023-01-15','Active','Mary Chacha','0754000004')
    ON CONFLICT (form, reg_no) WHERE reg_no IS NOT NULL DO NOTHING
    RETURNING id, form, status;
  `);
  // Log an "Enrolled" history event (Tanzania time) for each freshly-seeded student
  for (const s of seedStudents.rows) {
    await query(`
      INSERT INTO student_history (student_id, event_type, to_value, note)
      VALUES ($1, 'Enrolled', $2, 'Into ' || $3 || ' (seed data).')
    `, [s.id, s.form, s.form]);
  }

  // NOTE: we deliberately do NOT seed sample rows into `teachers` here.
  // A `teachers` row with no `user_id` can never check in (no login account)
  // yet still showed up as a permanently "Absent" ghost entry on the TAMS
  // Admin dashboard. Teachers are now created ONLY via User Accounts (which
  // auto-creates the linked `teachers` row) — see usersController.createUser.

  console.log("Seed completed.");
  console.log("Default logins:");
  console.log("  Admin    — username: admin    | password: admin123");
  console.log("  Academic — username: academic | password: academic123");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
