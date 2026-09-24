const express = require('express'), Database = require('better-sqlite3'), multer = require('multer');
const path = require('path'), fs = require('fs');
const PORT = process.env.PORT || 3000;
const AU = process.env.ADMIN_USER || 'admin', AP = process.env.ADMIN_PASS || 'admin123';
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });

const db = new Database(path.join(DATA, 'shop.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL,
  sale_price REAL DEFAULT 0, category TEXT DEFAULT 'General', image TEXT DEFAULT '', description TEXT DEFAULT '',
  stock INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT, name TEXT, phone TEXT, email TEXT,
  address TEXT, zone TEXT, subtotal REAL, shipping REAL, discount REAL, coupon TEXT, total REAL, payment TEXT, trx TEXT,
  note TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (order_id INTEGER, product_id INTEGER, name TEXT, price REAL, qty INTEGER);
CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, type TEXT, value REAL,
  min_total REAL DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);
const DEFAULTS = { store_name: 'TypeConnected', tagline: 'Quality products, delivered across Bangladesh', phone: '01XXXXXXXXX',
  email: 'hello@typeconnected.com', address: 'Dhaka, Bangladesh', ship_dhaka: '60', ship_outside: '120',
  free_ship_over: '5000', bkash: '01XXXXXXXXX', nagad: '01XXXXXXXXX' };
for (const [k, v] of Object.entries(DEFAULTS)) db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run(k, v);
if (!db.prepare('SELECT COUNT(*) c FROM products').get().c) {
  const i = db.prepare('INSERT INTO products (name,price,sale_price,category,description,stock) VALUES (?,?,?,?,?,?)');
  [['Wireless Keyboard', 2800, 2400, 'Gadgets', 'Slim, quiet and connects to any device.', 25],
   ['Ergonomic Mouse', 1500, 0, 'Gadgets', 'Comfortable grip for all-day work.', 40],
   ['Laptop Backpack', 1900, 0, 'Accessories', 'Water resistant with padded laptop sleeve.', 30],
   ['USB-C Hub 7-in-1', 3200, 2900, 'Accessories', 'HDMI, USB 3.0, SD card and more.', 15],
   ['Classic Cotton Tee', 650, 0, 'Lifestyle', 'Soft 100% cotton, everyday fit.', 60],
   ['Desk Lamp LED', 1300, 0, 'Lifestyle', 'Adjustable brightness and colour.', 20]].forEach(p => i.run(...p));
  db.prepare("INSERT OR IGNORE INTO coupons (code,type,value,min_total) VALUES ('WELCOME10','percent',10,1000)").run();
}
const S = () => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
const eff = p => (p.sale_price > 0 ? p.sale_price : p.price);
const ST = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const upload = multer({
  storage: multer.diskStorage({ destination: path.join(DATA, 'uploads'),
    filename: (_, f, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(f.mimetype)),
});

const app = express();
app.use(express.json());
function auth(req, res, next) {
  const [u, p] = Buffer.from((req.headers.authorization || '').split(' ')[1] || '', 'base64').toString().split(':');
  if (u === AU && p === AP) return next();
  res.set('WWW-Authenticate', 'Basic realm="admin"').status(401).send('Auth required');
}
app.use('/admin.html', auth);
app.use('/api/admin', auth);
app.use('/uploads', express.static(path.join(DATA, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Public API ----------
app.get('/health', (_, r) => r.send('ok'));
app.get('/api/config', (_, r) => r.json(S()));
app.get('/api/products', (_, r) => r.json(db.prepare('SELECT * FROM products WHERE active=1 ORDER BY id DESC').all()));

function applyCoupon(code, sub) {
  if (!code) return { discount: 0 };
  const c = db.prepare('SELECT * FROM coupons WHERE code=? COLLATE NOCASE AND active=1').get(code);
  if (!c) return { error: 'Invalid coupon code' };
  if (sub < c.min_total) return { error: `Minimum order ৳${c.min_total} required` };
  return { code: c.code, discount: c.type === 'percent' ? Math.round(sub * c.value / 100) : Math.min(c.value, sub) };
}
function shippingFor(zone, sub) {
  const s = S();
  if (+s.free_ship_over > 0 && sub >= +s.free_ship_over) return 0;
  return +(zone === 'dhaka' ? s.ship_dhaka : s.ship_outside);
}
app.get('/api/coupon', (req, res) => {
  const r = applyCoupon(req.query.code, +req.query.subtotal || 0);
  r.error ? res.status(400).json(r) : res.json(r);
});

app.post('/api/orders', (req, res) => {
  const { name, phone, email, address, zone, payment, trx, coupon, note, items } = req.body || {};
  if (!name || !address || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Please fill all required fields' });
  if (!/^(\+?88)?01\d{9}$/.test(phone || '')) return res.status(400).json({ error: 'Enter a valid Bangladeshi mobile number' });
  if (!['cod', 'bkash', 'nagad'].includes(payment)) return res.status(400).json({ error: 'Choose a payment method' });
  if (payment !== 'cod' && !(trx || '').trim()) return res.status(400).json({ error: 'Transaction ID is required' });
  try {
    const out = db.transaction(() => {
      let sub = 0; const lines = [];
      for (const it of items) {
        const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.id), q = parseInt(it.qty, 10);
        if (!p || !(q > 0)) throw new Error('Invalid item in cart');
        if (p.stock < q) throw new Error(`Only ${p.stock} left for "${p.name}"`);
        sub += eff(p) * q; lines.push({ p, q });
      }
      const c = applyCoupon(coupon, sub); if (c.error) throw new Error(c.error);
      const z = zone === 'dhaka' ? 'dhaka' : 'outside', ship = shippingFor(z, sub), total = sub - c.discount + ship;
      const id = db.prepare(`INSERT INTO orders (name,phone,email,address,zone,subtotal,shipping,discount,coupon,total,payment,trx,note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(name, phone, email || '', address, z, sub, ship, c.discount, c.code || '', total, payment, trx || '', note || '').lastInsertRowid;
      const orderNo = 'TC' + (1000 + Number(id));
      db.prepare('UPDATE orders SET order_no=? WHERE id=?').run(orderNo, id);
      for (const { p, q } of lines) {
        db.prepare('INSERT INTO order_items VALUES (?,?,?,?,?)').run(id, p.id, p.name, eff(p), q);
        db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(q, p.id);
      }
      return { ok: true, orderNo, total };
    })();
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/track', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE order_no=? COLLATE NOCASE AND phone=?').get(req.query.order_no || '', req.query.phone || '');
  if (!o) return res.status(404).json({ error: 'Order not found. Check order number and phone.' });
  o.items = db.prepare('SELECT name,price,qty FROM order_items WHERE order_id=?').all(o.id);
  res.json(o);
});

// ---------- Admin API ----------
app.get('/api/admin/stats', (_, res) => {
  const one = q => db.prepare(q).get();
  res.json({
    orders: one('SELECT COUNT(*) c FROM orders').c,
    pending: one("SELECT COUNT(*) c FROM orders WHERE status='pending'").c,
    today: one("SELECT COUNT(*) c FROM orders WHERE date(created_at)=date('now')").c,
    revenue: one("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status!='cancelled'").s,
    low: db.prepare('SELECT id,name,stock FROM products WHERE stock<=5 ORDER BY stock LIMIT 10').all(),
    top: db.prepare('SELECT name,SUM(qty) q FROM order_items GROUP BY name ORDER BY q DESC LIMIT 5').all(),
  });
});
app.get('/api/admin/orders', (_, res) => {
  const li = db.prepare('SELECT name,price,qty FROM order_items WHERE order_id=?');
  res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 300').all().map(o => ({ ...o, items: li.all(o.id) })));
});
app.post('/api/admin/orders/:id/status', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id), s = req.body.status;
  if (!o || !ST.includes(s)) return res.status(400).json({ error: 'Bad request' });
  db.transaction(() => {
    const sign = s === 'cancelled' && o.status !== 'cancelled' ? 1 : o.status === 'cancelled' && s !== 'cancelled' ? -1 : 0;
    if (sign) for (const i of db.prepare('SELECT product_id,qty FROM order_items WHERE order_id=?').all(o.id))
      db.prepare('UPDATE products SET stock=MAX(0,stock+?) WHERE id=?').run(sign * i.qty, i.product_id);
    db.prepare('UPDATE orders SET status=? WHERE id=?').run(s, o.id);
  })();
  res.json({ ok: true });
});
app.get('/api/admin/products', (_, r) => r.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all()));
const pf = b => [b.name, +b.price || 0, +b.sale_price || 0, b.category || 'General', parseInt(b.stock) || 0, b.description || '', b.active === '0' ? 0 : 1];
app.post('/api/admin/products', upload.single('image'), (req, res) => {
  if (!req.body.name || !(+req.body.price > 0)) return res.status(400).json({ error: 'Name and price required' });
  db.prepare('INSERT INTO products (name,price,sale_price,category,description,stock,active,image) VALUES (?,?,?,?,?,?,?,?)')
    .run(...[pf(req.body)[0], ...pf(req.body).slice(1, 3), pf(req.body)[3], pf(req.body)[5], pf(req.body)[4], pf(req.body)[6]], req.file ? '/uploads/' + req.file.filename : '');
  res.json({ ok: true });
});
app.put('/api/admin/products/:id', upload.single('image'), (req, res) => {
  const [n, p, sp, c, st, d, a] = pf(req.body);
  db.prepare('UPDATE products SET name=?,price=?,sale_price=?,category=?,stock=?,description=?,active=? WHERE id=?').run(n, p, sp, c, st, d, a, req.params.id);
  if (req.file) db.prepare('UPDATE products SET image=? WHERE id=?').run('/uploads/' + req.file.filename, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/products/:id', (req, res) => { db.prepare('DELETE FROM products WHERE id=?').run(req.params.id); res.json({ ok: true }); });

app.get('/api/admin/coupons', (_, r) => r.json(db.prepare('SELECT * FROM coupons ORDER BY id DESC').all()));
app.post('/api/admin/coupons', (req, res) => {
  const { code, type, value, min_total } = req.body || {};
  if (!code || !(+value > 0)) return res.status(400).json({ error: 'Code and value required' });
  try { db.prepare('INSERT INTO coupons (code,type,value,min_total) VALUES (?,?,?,?)').run(code.trim().toUpperCase(), type === 'fixed' ? 'fixed' : 'percent', +value, +min_total || 0); res.json({ ok: true }); }
  catch { res.status(400).json({ error: 'Code already exists' }); }
});
app.delete('/api/admin/coupons/:id', (req, res) => { db.prepare('DELETE FROM coupons WHERE id=?').run(req.params.id); res.json({ ok: true }); });
app.get('/api/admin/settings', (_, r) => r.json(S()));
app.post('/api/admin/settings', (req, res) => {
  for (const k of Object.keys(DEFAULTS)) if (k in req.body) db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, String(req.body[k]));
  res.json({ ok: true });
});

app.listen(PORT, () => console.log('TypeConnected shop on :' + PORT));
