// ✅ server.js
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

// ✅ Conexión PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ✅ Crear tablas si no existen
const ensureTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      client TEXT,
      phone TEXT,
      service TEXT,
      date DATE,
      time TEXT,
      employee TEXT,
      notes TEXT,
      price REAL
    );
  `);
};
ensureTables();

// ✅ LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Usuario no existe" });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: "Contraseña incorrecta" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || "supersecret",
      { expiresIn: "7d" }
    );

    res.json({
      token,
      role: user.role,
      name: user.name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET citas
app.get("/appointments", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM appointments ORDER BY date DESC, time ASC"
    );

    const mapped = rows.map((r) => ({
      ...r,
      date: r.date ? r.date.toISOString().slice(0, 10) : null,
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ POST crear cita
app.post("/appointments", async (req, res) => {
  try {
    const { client, phone, service, date, time, employee, notes, price } =
      req.body;

    const dup = await pool.query(
      "SELECT id FROM appointments WHERE date=$1 AND time=$2 AND employee=$3 LIMIT 1",
      [date, time, employee]
    );

    if (dup.rows.length) {
      return res
        .status(400)
        .json({ error: "Ya existe una cita para ese empleado a esa hora." });
    }

    const result = await pool.query(
      `INSERT INTO appointments (client, phone, service, date, time, employee, notes, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [client, phone, service, date, time, employee, notes, price ?? null]
    );

    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ PUT editar
app.put("/appointments/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { client, phone, service, date, time, employee, notes, price } =
      req.body;

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

// ✅ DELETE eliminar
app.delete("/appointments/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM appointments WHERE id=$1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ ✅ RUTA TEMPORAL PARA CREAR ADMIN
// 👉 Luego se borra
app.get("/create-admin", async (req, res) => {
  try {
    const hashed = await bcrypt.hash("123456", 10);

    await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      ["Norys", "admin@sublime.com", hashed, "admin"]
    );

    res.json({ ok: true, msg: "Admin creado ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`✅ API lista en puerto ${PORT}`)
);
