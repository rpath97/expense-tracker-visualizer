// server/index.js
require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const COOKIE_NAME = process.env.COOKIE_NAME || 'auth_token';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  ...(isProduction && { secure: true }),
};

// --- DB pool ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- Middleware ---
app.use(express.json());
app.use(cookieParser());

// CORS: same origin in dev; in production use ORIGIN env (e.g. https://your-app.railway.app)
const corsOrigin = process.env.ORIGIN || ('http://localhost:' + PORT);
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// serve your existing static files (index.html, app.js, styles.css)
app.use(express.static(path.join(__dirname, '..')));

// --- Auth helper ---
function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.userId };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Auth routes ---

app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash]
    );
    const user = result.rows[0];
    const token = createToken(user.id);

    res
      .cookie(COOKIE_NAME, token, cookieOptions)
      .json({ id: user.id, email: user.email });
  } catch (err) {
    console.error('signup error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = createToken(user.id);

    res
      .cookie(COOKIE_NAME, token, cookieOptions)
      .json({ id: user.id, email: user.email });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions).json({ ok: true });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(401).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('me error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Finance helpers ---

async function getOrCreateMonth(userId, year, month) {
  let result = await pool.query(
    'SELECT id, income FROM months WHERE user_id = $1 AND year = $2 AND month = $3',
    [userId, year, month]
  );
  if (!result.rows.length) {
    result = await pool.query(
      'INSERT INTO months (user_id, year, month, income) VALUES ($1, $2, $3, 0) RETURNING id, income',
      [userId, year, month]
    );
  }
  return result.rows[0];
}

// --- Finance routes (protected) ---

// Get data for one month
app.get('/api/finance/month/:year/:month', authRequired, async (req, res) => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);

  if (!year || !month) return res.status(400).json({ error: 'Invalid year or month' });

  try {
    const monthRow = await getOrCreateMonth(req.user.id, year, month);
    const expensesRes = await pool.query(
      'SELECT id, name, amount FROM expenses WHERE month_id = $1 ORDER BY id',
      [monthRow.id]
    );

    res.json({
      year,
      month,
      income: Number(monthRow.income),
      expenses: expensesRes.rows.map((e) => ({
        id: e.id,
        name: e.name,
        amount: Number(e.amount),
      })),
    });
  } catch (err) {
    console.error('get month error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save a whole month (income + expenses array)
app.post('/api/finance/month/:year/:month', authRequired, async (req, res) => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);
  const { income, expenses } = req.body || {};

  if (!year || !month) return res.status(400).json({ error: 'Invalid year or month' });

  try {
    const monthRow = await getOrCreateMonth(req.user.id, year, month);
    const incomeNumber = Number(income) || 0;

    await pool.query('UPDATE months SET income = $1 WHERE id = $2', [incomeNumber, monthRow.id]);
    await pool.query('DELETE FROM expenses WHERE month_id = $1', [monthRow.id]);

    if (Array.isArray(expenses) && expenses.length) {
      const values = [];
      const placeholders = [];
      let idx = 1;
      for (const e of expenses) {
        const name = (e.name || '').trim();
        const amount = Number(e.amount) || 0;
        if (!name || amount <= 0) continue;
        placeholders.push(`($${idx++}, $${idx++}, $${idx++})`);
        values.push(monthRow.id, name, amount);
      }
      if (placeholders.length) {
        await pool.query(
          `INSERT INTO expenses (month_id, name, amount) VALUES ${placeholders.join(',')}`,
          values
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('save month error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get overview for a year (for Year in review)
app.get('/api/finance/months', authRequired, async (req, res) => {
  const year = parseInt(req.query.year, 10);
  if (!year) return res.status(400).json({ error: 'Year is required' });

  try {
    const monthsRes = await pool.query(
      'SELECT id, month, income FROM months WHERE user_id = $1 AND year = $2 ORDER BY month',
      [req.user.id, year]
    );

    const monthIdMap = new Map();
    monthsRes.rows.forEach((m) => monthIdMap.set(m.id, m));

    let expensesRes = { rows: [] };
    if (monthsRes.rows.length) {
      const ids = monthsRes.rows.map((m) => m.id);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      expensesRes = await pool.query(
        `SELECT month_id, SUM(amount) AS total
         FROM expenses
         WHERE month_id IN (${placeholders})
         GROUP BY month_id`,
        ids
      );
    }

    const expenseByMonthId = new Map();
    expensesRes.rows.forEach((row) => {
      expenseByMonthId.set(row.month_id, Number(row.total) || 0);
    });

    const result = [];
    for (let m = 1; m <= 12; m++) {
      const monthRow = monthsRes.rows.find((row) => row.month === m);
      const incomeVal = monthRow ? Number(monthRow.income) : 0;
      const expensesVal = monthRow ? (expenseByMonthId.get(monthRow.id) || 0) : 0;
      result.push({
        month: m,
        income: incomeVal,
        expenses: expensesVal,
        remaining: incomeVal - expensesVal,
      });
    }

    res.json({ year, months: result });
  } catch (err) {
    console.error('get months error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});