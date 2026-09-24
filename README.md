# My Shop (Node.js + Express + SQLite)

Small e-commerce: products, cart, checkout (COD), admin panel.

## Local run
    npm install && npm start      # http://localhost:3000
Admin: http://localhost:3000/admin.html  (default admin / admin123)

## Coolify deploy
1. Push to GitHub.
2. Coolify -> + New Resource -> Git repository -> select repo.
3. Build Pack: **Dockerfile**, Port: **3000**, set domain.
4. Environment Variables: `ADMIN_USER`, `ADMIN_PASS` (must change!).
5. Storages -> Add persistent storage, mount path: `/app/data` (orders/products save thakar jonno).
6. Deploy.
