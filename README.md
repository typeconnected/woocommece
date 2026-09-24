# TypeConnected Shop (Node.js + Express + SQLite)

Storefront: product search/categories, cart, checkout (COD / bKash / Nagad), coupons, order tracking.
Admin (`/admin.html`): dashboard, orders + status + invoice, products (image upload, stock, sale price), coupons, store settings.

## Local
    npm install && npm start     # http://localhost:3000   admin: admin / admin123

## Deploy on Coolify (typeconnected.com)
1. Push to GitHub. Coolify -> + New Resource -> Git repository.
2. Build Pack **Dockerfile**, Port **3000**, Domain `https://typeconnected.com`.
3. DNS: A record for `typeconnected.com` -> your server IP.
4. Env vars: `ADMIN_USER`, `ADMIN_PASS` (strong password!).
5. Storages -> persistent volume, mount path **/app/data** (database + uploaded images live here).
6. Deploy. Then open /admin.html -> Settings and set phone, bKash/Nagad numbers, shipping.
