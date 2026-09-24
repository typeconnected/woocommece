const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'shop.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  price REAL NOT NULL, image TEXT DEFAULT '', description TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT,
  total REAL, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (
  order_id INTEGER, product_id INTEGER, name TEXT, price REAL, qty INTEGER);
`);
if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
  const ins = db.prepare('INSERT INTO products (name, price, image, description) VALUES (?,?,?,?)');
  [['Cotton T-Shirt', 500, '👕', 'Soft 100% cotton'],
   ['Running Shoes', 2500, '👟', 'Lightweight & comfy'],
   ['Backpack', 1200, '🎒', 'Water resistant'],
   ['Wrist Watch', 3200, '⌚', 'Classic design']].forEach(p => ins.run(...p));
}

const app = express();
app.use(express.json());

function auth(req, res, next) {
  const [u, p] = Buffer.from((req.headers.authorization || '').split(' ')[1] || '', 'base64')
    .toString().split(':');
  if (u === ADMIN_USER && p === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="admin"').status(401).send('Auth required');
}
app.use('/admin.html', auth);
app.use('/api/admin', auth);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_, res) => res.send('ok'));
app.get('/api/products', (_, res) => res.json(db.prepare('SELECT * FROM products').all()));

app.post('/api/orders', (req, res) => {
  const { name, phone, address, items } = req.body || {};
  if (!name || !phone || !address || !Array.isArray(items) || !items.length)
    return res.status(400).json({ error: 'Missing fields' });
  const get = db.prepare('SELECT * FROM products WHERE id=?');
  let total = 0; const lines = [];
  for (const it of items) {
    const p = get.get(it.id); const qty = parseInt(it.qty, 10);
    if (!p || !(qty > 0)) return res.status(400).json({ error: 'Invalid item' });
    total += p.price * qty; lines.push({ p, qty });
  }
  const orderId = db.transaction(() => {
    const id = db.prepare('INSERT INTO orders (name,phone,address,total) VALUES (?,?,?,?)')
      .run(name, phone, address, total).lastInsertRowid;
    const li = db.prepare('INSERT INTO order_items VALUES (?,?,?,?,?)');
    lines.forEach(({ p, qty }) => li.run(id, p.id, p.name, p.price, qty));
    return id;
  })();
  res.json({ ok: true, orderId, total });
});

// ---- Admin ----
app.get('/api/admin/orders', (_, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  const li = db.prepare('SELECT name, price, qty FROM order_items WHERE order_id=?');
  res.json(orders.map(o => ({ ...o, items: li.all(o.id) })));
});
app.post('/api/admin/orders/:id/status', (req, res) => {
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});
app.post('/api/admin/products', (req, res) => {
  const { name, price, image, description } = req.body || {};
  if (!name || !(price > 0)) return res.status(400).json({ error: 'name & price required' });
  db.prepare('INSERT INTO products (name,price,image,description) VALUES (?,?,?,?)')
    .run(name, price, image || '📦', description || '');
  res.json({ ok: true });
});
app.delete('/api/admin/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log('Shop running on port ' + PORT));
