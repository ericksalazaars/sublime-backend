const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ CORS
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

// ✅ PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ✅ Asegurar tablas
const ensureTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      client TEXT,
      phone TEXT,
      service TEXT,
      date TEXT,
      time TEXT,
      employee TEXT,
      notes TEXT,
      price REAL
    )
  `);
};

ensureTables().catch(console.error);

// ✅ Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const q = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (!q.rows.length) return res.status(400).json({ error: "Usuario no existe" });

    const user = q.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Todas las citas (ya sin manipular fecha)
app.get("/appointments", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM appointments ORDER BY date ASC, time ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Crear cita
app.post("/appointments", async (req, res) => {
  try {
    const { client, phone, service, date, time, employee, notes, price } = req.body;

    const dup = await pool.query(
      "SELECT id FROM appointments WHERE date=$1 AND time=$2 AND employee=$3 LIMIT 1",
      [date, time, employee]
    );

    if (dup.rows.length) {
      return res.status(400).json({ error: "Ya existe una cita para ese empleado a esa hora." });
    }

    const r = await pool.query(
      `INSERT INTO appointments (client, phone, service, date, time, employee, notes, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [client, phone, service, date, time, employee, notes, price ?? null]
    );

    res.json({ id: r.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Editar cita
app.put("/appointments/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { client, phone, service, date, time, employee, notes, price } = req.body;

    await pool.query(
      `UPDATE appointments
       SET client=$1, phone=$2, service=$3, date=$4, time=$5, employee=$6, notes=$7, price=$8
       WHERE id=$9`,
      [client, phone, service, date, time, employee, notes, price ?? null, id]
    );

    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Eliminar cita
app.delete("/appointments/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM appointments WHERE id=$1", [id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ ✅ ✅ TEMPORAL — Fix para fechas mal guardadas
//    Convierte fechas con "2025-11-03T00:00:00.000Z" → "2025-11-03"

app.get("/fix-dates", async (req, res) => {
  try {
    await pool.query(`
      UPDATE appointments
      SET date = SUBSTRING(date FROM 1 FOR 10)
      WHERE date LIKE '%T%';
    `);

    res.json({ ok: true, msg: "✅ Fechas normalizadas correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ Crear usuario Ariela (borrar después)
app.get("/create-ariela", async (req, res) => {
  try {
    const hashed = await bcrypt.hash("123456", 10);

    await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      ["Ariela", "ariela@sublime.com", hashed, "employee"]
    );

    res.json({ ok: true, msg: "Ariela creada ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Start server
app.listen(PORT, () =>
  console.log(`✅ API funcionando en puerto ${PORT}`)
);
