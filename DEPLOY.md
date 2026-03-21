# Deploying Expense Tracker Visualizer

The app is a single Node.js server that serves the frontend (HTML/CSS/JS) and the API, with a PostgreSQL database.

## Environment variables

Set these in your hosting dashboard (and in `.env` for local runs):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string (e.g. `postgresql://user:pass@host:port/dbname`) |
| `JWT_SECRET` | Yes | Secret used to sign JWTs; use a long random string in production |
| `PORT` | No | Port to listen on (default `4000`; hosters often set this) |
| `ORIGIN` | No | Allowed CORS origin in production (e.g. `https://your-app.railway.app`) |
| `COOKIE_NAME` | No | Auth cookie name (default `auth_token`) |

## Railway

The repo includes a **`Dockerfile`** at the root so Railway builds a **Node** image (Express + static files). If Railway ever treats the project as a static/Caddy site, push the latest code so the Dockerfile is used, or in service **Settings** set the builder to **Dockerfile**.

1. **Create a project** at [railway.app](https://railway.app) and connect your GitHub repo (`rpath97/expense-tracker-visualizer`).

2. **Add PostgreSQL**  
   In the project: **+ New** → **Database** → **PostgreSQL**. Railway will create a `DATABASE_URL` variable.

3. **Configure the service**  
   - **Root directory:** leave default (repo root).  
   - **Build command:** `cd server && npm install`  
   - **Start command:** `npm start` (runs `node server/index.js` from repo root so static files are found).  
   - **Variables:**  
     - `DATABASE_URL` is set when you add Postgres (reference it from the Postgres service if needed).  
     - Set `JWT_SECRET` to a long random string (e.g. `openssl rand -hex 32`).  
     - Set `ORIGIN` to your app’s public URL (e.g. `https://expense-tracker-visualizer-production.up.railway.app`) so cookies and CORS work.

4. **Deploy**  
   Push to `main` or trigger a deploy from the dashboard. Open the generated URL to use the app.

5. **Database schema**  
   The app does not run migrations automatically. If your Postgres is empty, create the tables (e.g. run the SQL below once, or add a simple migration step):

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS months (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  income NUMERIC(12,2) DEFAULT 0,
  UNIQUE(user_id, year, month)
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  amount NUMERIC(12,2) NOT NULL
);
```

You can run this in Railway’s Postgres **Query** tab or via `psql` using `DATABASE_URL`.

## Render

1. **New** → **Web Service**; connect the repo.  
2. **Build:** `cd server && npm install`  
3. **Start:** `npm start` (from repo root; ensure root `package.json` has `"start": "node server/index.js"`).  
4. Add **PostgreSQL** via **New** → **PostgreSQL** and link `DATABASE_URL`.  
5. Set `JWT_SECRET` and `ORIGIN` (your Render URL, e.g. `https://your-service.onrender.com`).  
6. Run the SQL above once to create tables.

## After deploy

- Use the app URL as the single entry point (frontend and API are the same origin).  
- Log in / sign up and use **Log out** in the header to clear the session.
