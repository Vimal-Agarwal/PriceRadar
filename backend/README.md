# PriceRadar — Backend

Production-grade Full Stack Price Tracker API. FastAPI + PostgreSQL + SQLAlchemy + Alembic + JWT auth + APScheduler.

## Features

- JWT auth (register/login, bcrypt password hashing, protected routes)
- Product tracking: add by URL, nickname, target price, pause/resume, delete
- Hourly scraper (BeautifulSoup + httpx) with retries, exponential backoff, and CAPTCHA/403 handling
- Smart Alert Logic — only emails on a *new* low below target, never spams
- Edge cases handled: out-of-stock, page removed, HTML changed, duplicate URLs, invalid/redirected URLs, currency detection (₹ $ €), product name changes
- Price history with daily/weekly/monthly aggregation (lowest/highest/average)
- Email alerts (price drop, back in stock, out of stock, scrape broken, tracking resumed)
- Docker + docker-compose support
- Alembic migrations (initial schema included and tested)

## Project structure

```
app/
├── main.py              # FastAPI entry point, CORS, router wiring, scheduler lifecycle
├── core/
│   ├── config.py         # Settings from .env
│   ├── security.py       # Password hashing, JWT
│   └── deps.py           # get_current_user dependency
├── db/
│   └── database.py        # Engine, SessionLocal, Base, get_db()
├── models/                 # SQLAlchemy: User, Product, PriceHistory
├── schemas/                 # Pydantic request/response shapes
├── api/                      # Routes: auth, products, history, admin
└── services/
    ├── scraper.py            # Core scraping + retry/backoff logic
    ├── currency.py            # Currency detection & price extraction
    ├── url_validator.py        # URL validation & redirect resolution
    ├── tracker.py               # Orchestration: scrape -> update -> alert -> email
    ├── email_service.py          # SMTP sending, one function per alert type
    └── scheduler.py               # APScheduler hourly job
alembic/                          # Migrations (0001_initial_schema tested up/down)
```

## Setup (local Postgres)

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate      # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and fill in your real Postgres credentials, JWT secret, and SMTP credentials:
   ```bash
   cp .env.example .env
   ```
   For Gmail SMTP, use an **App Password** (not your normal password) — generate one at
   https://myaccount.google.com/apppasswords.

3. Create the database (one-time):
   ```sql
   CREATE DATABASE price_tracker;
   ```

4. Run the migration to create tables:
   ```bash
   alembic upgrade head
   ```

5. Start the API:
   ```bash
   uvicorn app.main:app --reload
   ```

6. Confirm it's working:
   - http://127.0.0.1:8000/health
   - http://127.0.0.1:8000/docs (Swagger UI — test every endpoint here)

## Setup (Docker, alternative)

```bash
docker-compose up --build
```
Spins up Postgres + the backend together, runs migrations automatically.

## Testing the full flow via Swagger (`/docs`)

1. `POST /auth/register` — create a user
2. `POST /auth/login` — get a JWT, click **Authorize** at the top of Swagger and paste it
3. `POST /products` — add a product URL + target price
4. `POST /admin/run-now` — manually trigger a scrape cycle instead of waiting an hour
5. `GET /products` — see updated price/status
6. `GET /products/{id}/history` — see price history + stats

## Smart Alert Logic (verified against spec)

Alert fires only when `current_price <= target_price` AND `current_price < last_alerted_price`
(or no alert has been sent yet). This was tested against the exact spec example:
`500 → 350 (alert) → 450 (no alert) → 380 (no alert) → 300 (alert again)` — passes.

## Notes on the scraper

Sites vary wildly in HTML structure, so the scraper uses a layered strategy:
Open Graph meta tags → JSON-LD/price-like CSS selectors → heuristic text scan.
This works well for most e-commerce sites that set `og:title`/`og:image`/price meta tags,
but very JS-heavy sites (price rendered client-side) won't have a price in the raw HTML —
that's flagged as a future improvement (Playwright/Selenium) in the original spec.

## Next steps / future improvements (from spec)

Browser automation for JS-heavy sites, Telegram/WhatsApp/Discord notifications, Chrome
extension, ML price prediction, Redis caching, rate limiting, Celery workers, CI/CD,
cloud deployment, monitoring.
