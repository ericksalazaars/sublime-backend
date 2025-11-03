// backend/server.js
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;

// Permite tu frontend (ajustaremos esto luego con tu dominio de Netlify)
app.use(
  cors({
    origin: "*", // En producción, cámbialo por tu dominio de frontend
  })
);
app.use(express.json());

// Conexión a PostgreSQL (Railway te dará DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // En Railway normalmente no hace falta SSL, si usas otros proveedores podrías necesitar:
  // ssl: { rejectUnauthorized: false }
});

// Crear tabla si no existe
const ensureTable = async () => {
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
    )
  `);
};
ensureTable().catch(console.error);

// GET todas
app.get("/appointments", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM appointments ORDER BY date DESC, time ASC");
    // Convertimos date a YYYY-MM-DD para el frontend
    const mapped = rows.map(r => ({
      ...r,
      date: r.date ? r.date.toISOString().slice(0, 10) : null,
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST crear (con validación de duplicados: fecha + hora + empleado)
app.post("/appointments", async (req, res) => {
  try {
    const { client, phone, service, date, time, employee, notes, price } = req.body;

    // Validar duplicado
    const dup = await pool.query(
      "SELECT id FROM appointments WHERE date = $1 AND time = $2 AND employee = $3 LIMIT 1",
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

// PUT editar
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

// DELETE eliminar
app.delete("/appointments/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM appointments WHERE id=$1", [id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`API lista en puerto ${PORT}`));
