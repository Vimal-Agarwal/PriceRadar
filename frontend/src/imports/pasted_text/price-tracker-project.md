# Full Stack Price Tracker (Production-Level Project)

I want to build a **production-quality Full Stack Price Tracker** using **Python FastAPI + React + PostgreSQL**.

This is a portfolio project, so I don't want a simple CRUD application. I want an architecture similar to what a real startup would build.

## Tech Stack

### Backend

* Python
* FastAPI
* SQLAlchemy
* PostgreSQL
* APScheduler
* BeautifulSoup4
* HTTPX
* JWT Authentication
* Alembic
* Docker support
* Environment variables (.env)

### Frontend

* React
* Tailwind CSS
* React Router
* Axios
* React Query
* Recharts
* React Hook Form

---

# Main Features

## User Authentication

* Register
* Login
* JWT authentication
* Password hashing
* Protected routes

---

## Product Tracking

Users should be able to

* Add any product URL
* Give product nickname
* Set target price
* Delete product
* Pause tracking
* Resume tracking

---

## Dashboard

Dashboard should display

* Product Image
* Product Name
* Current Price
* Previous Price
* Price Difference
* Lowest Price Ever
* Highest Price Ever
* Last Updated
* Product Status
* Availability
* Target Price
* Quick Actions

---

## Price History

Store every successful scrape.

Display

* Line chart
* Daily prices
* Weekly prices
* Monthly prices
* Lowest price
* Highest price
* Average price

---

## Email Alerts

Send email when

* Price becomes less than target
* Product becomes available again
* Product goes out of stock
* Product page breaks
* Tracking resumes

---

## Scheduler

The scraper should run every **1 hour** instead of 6 hours.

Reason:

A product price can drop and recover within a few hours.

Example

10:00 → ₹500

11:00 → ₹350

2:00 → ₹450

If scraping runs every 6 hours, the ₹350 opportunity is completely missed.

Therefore use **hourly scraping**.

---

# Smart Alert Logic

Never spam users.

Store

* last_alerted_price
* last_alerted_at

Rules

Send alert only if

current_price <= target_price

AND

current_price < last_alerted_price

If the current price increases and later decreases but is still higher than the previously alerted price, do NOT send another alert.

Example

Target = ₹400

500

↓

350 → Alert

↓

450 → No alert

↓

380 → No alert (already alerted at ₹350)

↓

300 → Alert again

This avoids duplicate notifications.

---

# Edge Cases

Handle all of these.

## 1. Product becomes Out of Stock

Store

is_available

Notify user once.

Pause alerts until available again.

---

## 2. Product page removed

Mark product inactive.

Show error on dashboard.

---

## 3. Website changed HTML

Store scrape_error.

Retry automatically.

---

## 4. CAPTCHA / 403

Retry 3 times.

Log failure.

Don't crash scheduler.

---

## 5. Temporary Network Failure

Retry with exponential backoff.

---

## 6. Duplicate Products

Prevent same user from adding same URL twice.

---

## 7. Invalid URL

Validate before saving.

---

## 8. Redirected URL

Resolve final URL before storing.

---

## 9. Currency Detection

Support

₹

$

€

Store currency separately.

---

## 10. Product Name Changed

Update automatically.

---

## Database Tables

### Users

id

name

email

password

created_at

---

### Products

id

user_id

url

title

image

currency

current_price

lowest_price

highest_price

target_price

is_available

tracking_enabled

last_scraped_at

last_alerted_price

last_alerted_at

scrape_error

created_at

updated_at

---

### Price History

id

product_id

price

availability

scraped_at

---

# Scheduler Workflow

Every hour

For every tracked product

↓

Download page

↓

Extract

* title
* price
* image
* availability

↓

Update Product

↓

Insert Price History

↓

Compare target

↓

Smart Alert Logic

↓

Send Email if needed

↓

Continue

Never stop the scheduler because one website failed.

---

# API Endpoints

Authentication

POST /register

POST /login

Products

GET /products

POST /products

PUT /products/{id}

DELETE /products/{id}

GET /products/{id}

History

GET /products/{id}/history

Scheduler

POST /admin/run-now

Health

GET /health

---

# Frontend Pages

Login

Register

Dashboard

Add Product

Product Details

Settings

Profile

---

# UI Components

Navbar

Sidebar

Product Card

Price Chart

Alert Badge

Search Bar

Pagination

Theme Toggle

Loader

Toast Notifications

Confirmation Modal

---

# Future Improvements

Browser automation for JavaScript-heavy sites (Playwright/Selenium)

Telegram notifications

WhatsApp notifications

Discord webhook

Chrome Extension

Price prediction using Machine Learning

Multi-user deployment

Admin dashboard

Caching with Redis

Rate limiting

Background workers with Celery

Docker Compose

CI/CD

Cloud deployment

Monitoring and logging

---

# Code Requirements

* Follow clean architecture.
* Use reusable components.
* Add comments where necessary.
* Use proper folder structure.
* Follow SOLID principles.
* Write production-quality code.
* Explain every major step before writing code.
* Build the project incrementally, one module at a time.
* Do not skip explanations or jump ahead.
