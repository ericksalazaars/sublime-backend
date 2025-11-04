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

// ✅ DB
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


// ✅ AUTH MIDDLEWARE
const auth = (roles = []) => {
  return (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "No token" });

    try {
      const data = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
      if (!roles.length) return next();
      if (!roles.includes(data.role)) return res.status(403).json({ error: "No autorizado" });
      next();
    } catch {
      return res.status(401).json({ error: "Token inválido" });
    }
  };
};


// ✅ LOGIN
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


// ✅ GET Citas
app.get("/appointments", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM appointments ORDER BY date ASC, time ASC");
    res.json(rows); // ✅ fecha se devuelve tal cual sin modificar
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ POST Agregar cita
app.post("/appointments", async (req, res) => {
  try {
    const { client, phone, service, date, time, employee, notes, price } = req.body;

    // ✅ Duplicado
    const dup = await pool.query(
      "SELECT id FROM appointments WHERE date=$1 AND time=$2 AND employee=$3 LIMIT 1",
      [date, time, employee]
    );
    if (dup.rows.length) {
      return res.status(400).json({ error: "Ya existe una cita para ese empleado a esa hora." });
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


// ✅ PUT Editar cita
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


// ✅ DELETE Eliminar cita
app.delete("/appointments/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM appointments WHERE id=$1", [id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ RUTA TEMPORAL PARA CREAR ARIELA (bórrala después)
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


// ✅ Start
app.listen(PORT, () =>
  console.log(`✅ API funcionando en puerto ${PORT}`)
);
