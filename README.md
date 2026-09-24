# TypeConnected Shop – Advanced (Node.js + Express + SQLite)

**Storefront:** search, categories, product variants (size/colour), ratings & reviews, cart, coupons, COD / bKash / Nagad / SSLCommerz online payment,
customer accounts (register/login, my orders), order tracking.
**Admin (`/admin.html`):** dashboard + 7-day sales chart, orders (status, paid/unpaid, invoice), products (image, variants, stock, sale price), coupons,
settings, CSV export, one-click database backup.
**Ops:** email notifications (SMTP), rate limiting, secure sessions, security headers.

## Local
    npm install && npm start      # http://localhost:3000    admin / admin123

## Environment variables (Coolify)
| Name | Purpose |
|---|---|
| `ADMIN_USER`, `ADMIN_PASS` | Admin login (**change!**) |
| `SESSION_SECRET` | Random long string (optional; auto-generated in /app/data if missing) |
| `SSLC_STORE_ID`, `SSLC_STORE_PASS` | SSLCommerz credentials. Sandbox by default; set `SSLC_LIVE=1` for real payments |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `ADMIN_EMAIL` | Order emails (optional) |

## Deploy on Coolify (typeconnected.com)
1. Push to GitHub -> Coolify: New Resource -> Git repository.
2. Build Pack **Dockerfile**, Port **3000**, Domain `https://typeconnected.com`. DNS A record -> server IP.
3. Add the env vars above.
4. Storages: persistent volume mounted at **/app/data** (database, uploads, secret).
5. Deploy -> open `/admin.html` -> Settings.

## SSLCommerz
Get sandbox keys from SSLCommerz, set env vars, test with sandbox cards. For live: get live keys, set `SSLC_LIVE=1`.
Success callback URL is `/pay/success` (payment is validated server-side before marking paid).
