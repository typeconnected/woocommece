const express = require('express'), Database = require('better-sqlite3'), multer = require('multer');
const crypto = require('crypto'), rateLimit = require('express-rate-limit'), nodemailer = require('nodemailer');
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
const addCol = (t, c, d) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
addCol('products', 'variants', "TEXT DEFAULT ''"); addCol('orders', 'user_id', 'INTEGER'); addCol('orders', 'pay_status', "TEXT DEFAULT 'unpaid'");
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, phone TEXT DEFAULT '', pass TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, user_id INTEGER, name TEXT, rating INTEGER, body TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(product_id, user_id));
`);
db.exec(`
CREATE TABLE IF NOT EXISTS pages (slug TEXT PRIMARY KEY, title TEXT, body TEXT, sort INTEGER DEFAULT 99);
CREATE TABLE IF NOT EXISTS banners (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, subtitle TEXT DEFAULT '', image TEXT DEFAULT '', link TEXT DEFAULT '', btn TEXT DEFAULT 'Shop now', active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, email TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
if (!db.prepare('SELECT COUNT(*) c FROM pages').get().c) {
  const ip = db.prepare('INSERT INTO pages (slug,title,body,sort) VALUES (?,?,?,?)');
  ip.run('about', 'About us', 'TypeConnected is an online shop based in Bangladesh. We bring carefully selected products to your door at fair prices.\n\nOur promise: genuine products, honest prices and friendly support. Edit this page from Admin > Pages.', 1);
  ip.run('shipping', 'Shipping & delivery', 'We deliver all over Bangladesh.\n\nInside Dhaka: 1-2 working days. Outside Dhaka: 3-5 working days.\n\nDelivery charges and the free-shipping limit are shown at checkout.', 2);
  ip.run('returns', 'Return policy', 'If you receive a damaged or wrong product, contact us within 3 days of delivery and we will replace it or refund you.\n\nProducts must be unused and in original packaging.', 3);
  ip.run('privacy', 'Privacy policy', 'We collect only the information needed to process your order (name, phone, address, email). We never sell your data to third parties.', 4);
}
if (!db.prepare('SELECT COUNT(*) c FROM banners').get().c) {
  const ib = db.prepare('INSERT INTO banners (title,subtitle,link,btn,sort) VALUES (?,?,?,?,?)');
  ib.run('New arrivals are here', 'Fresh gadgets and lifestyle picks, delivered across Bangladesh.', '', 'Shop now', 1);
  ib.run('Pay your way', 'Cash on delivery, bKash, Nagad or secure online payment.', '', 'Start shopping', 2);
}
const DEFAULTS = { store_name: 'TypeConnected', tagline: 'Quality products, delivered across Bangladesh', phone: '01XXXXXXXXX',
  email: 'hello@typeconnected.com', address: 'Dhaka, Bangladesh', ship_dhaka: '60', ship_outside: '120',
  free_ship_over: '5000', bkash: '01XXXXXXXXX', nagad: '01XXXXXXXXX', whatsapp: '', announcement: '🚚 Free delivery on big orders · 💵 Cash on delivery available' };
for (const [k, v] of Object.entries(DEFAULTS)) db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run(k, v);
if (!db.prepare('SELECT COUNT(*) c FROM products').get().c) {
  const i = db.prepare('INSERT INTO products (name,price,sale_price,category,description,stock) VALUES (?,?,?,?,?,?)');
  [['Wireless Keyboard', 2800, 2400, 'Gadgets', 'Slim, quiet and connects to any device.', 25],
   ['Ergonomic Mouse', 1500, 0, 'Gadgets', 'Comfortable grip for all-day work.', 40],
   ['Laptop Backpack', 1900, 0, 'Accessories', 'Water resistant with padded laptop sleeve.', 30],
   ['USB-C Hub 7-in-1', 3200, 2900, 'Accessories', 'HDMI, USB 3.0, SD card and more.', 15],
   ['Classic Cotton Tee', 650, 0, 'Lifestyle', 'Soft 100% cotton, everyday fit.', 60],
   ['Desk Lamp LED', 1300, 0, 'Lifestyle', 'Adjustable brightness and colour.', 20]].forEach(p => i.run(...p));
  db.prepare("UPDATE products SET variants='S,M,L,XL' WHERE name='Classic Cotton Tee'").run();
  db.prepare("INSERT OR IGNORE INTO coupons (code,type,value,min_total) VALUES ('WELCOME10','percent',10,1000)").run();
}
const S = () => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
const eff = p => (p.sale_price > 0 ? p.sale_price : p.price);
const ST = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// ---------- Security, auth, mail, payment helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eq = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
const SECRET = process.env.SESSION_SECRET || (() => { const f = path.join(DATA, '.secret'); try { return fs.readFileSync(f, 'utf8'); } catch { const k = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(f, k); return k; } })();
const hashPw = p => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(p, s, 32).toString('hex'); };
const checkPw = (p, h) => { const [s, k] = (h || '').split(':'); return !!k && crypto.timingSafeEqual(crypto.scryptSync(p, s, 32), Buffer.from(k, 'hex')); };
const mac = b => crypto.createHmac('sha256', SECRET).update(b).digest('hex');
function setSess(req, res, uid) {
  const b = uid + '.' + Date.now();
  res.append('Set-Cookie', `tc_sess=${b}.${mac(b)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${req.secure ? '; Secure' : ''}`);
}
function userFrom(req) {
  const m = /tc_sess=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [uid, ts, sig] = m[1].split('.'), b = uid + '.' + ts;
  if (!sig || sig.length !== 64 || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mac(b))) || Date.now() - +ts > 2592000000) return null;
  return db.prepare('SELECT id,name,email,phone FROM users WHERE id=?').get(uid) || null;
}
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { error: 'Too many attempts, try again later' } });
const orderLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, message: { error: 'Too many orders from this network, try later' } });

const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_PORT === '465', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) : null;
function notify(o, subject) {
  if (!mailer) return;
  const items = db.prepare('SELECT name,qty FROM order_items WHERE order_id=?').all(o.id).map(i => `${esc(i.name)} × ${i.qty}`).join('<br>');
  const html = `<h2>${subject}: ${o.order_no}</h2><p>${esc(o.name)} · ${esc(o.phone)}<br>${esc(o.address)}</p><p>${items}</p><p><b>Total ৳${o.total}</b> · ${o.payment} (${o.pay_status})</p>`;
  [process.env.ADMIN_EMAIL || S().email, o.email].filter(Boolean).forEach(to =>
    mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject: `${subject} ${o.order_no}`, html }).catch(e => console.error('mail:', e.message)));
}

const SSL_ID = process.env.SSLC_STORE_ID, SSL_PASS = process.env.SSLC_STORE_PASS, SSL_ON = !!(SSL_ID && SSL_PASS);
const SSL = process.env.SSLC_LIVE === '1' ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com';
async function sslInit(o, base) {
  const r = await (await fetch(`${SSL}/gwprocess/v4/api.php`, { method: 'POST', body: new URLSearchParams({
    store_id: SSL_ID, store_passwd: SSL_PASS, total_amount: o.total, currency: 'BDT', tran_id: o.order_no,
    success_url: base + '/pay/success', fail_url: base + '/pay/fail', cancel_url: base + '/pay/cancel',
    cus_name: o.name, cus_email: o.email || 'noemail@typeconnected.com', cus_add1: o.address, cus_city: 'Dhaka', cus_country: 'Bangladesh', cus_phone: o.phone,
    shipping_method: 'Courier', num_of_item: 1, product_name: 'Order ' + o.order_no, product_category: 'General', product_profile: 'general' }) })).json();
  return r.GatewayPageURL || null;
}


const upload = multer({
  storage: multer.diskStorage({ destination: path.join(DATA, 'uploads'),
    filename: (_, f, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(f.mimetype)),
});

const app = express();
app.set('trust proxy', 1);
app.use((q, r, n) => { r.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin' }); n(); });
app.use(express.json());
function auth(req, res, next) {
  const [u, p] = Buffer.from((req.headers.authorization || '').split(' ')[1] || '', 'base64').toString().split(':');
  if (eq(u || '', AU) && eq(p || '', AP)) return next();
  res.set('WWW-Authenticate', 'Basic realm="admin"').status(401).send('Auth required');
}
app.use('/admin.html', auth);
app.use('/api/admin', auth);
app.use('/uploads', express.static(path.join(DATA, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Public API ----------
app.get('/health', (_, r) => r.send('ok'));
app.get('/api/config', (_, r) => r.json({ ...S(), online: SSL_ON }));
app.get('/api/products', (_, r) => r.json(db.prepare('SELECT p.*,(SELECT ROUND(AVG(rating),1) FROM reviews WHERE product_id=p.id) rating,(SELECT COUNT(*) FROM reviews WHERE product_id=p.id) reviews FROM products p WHERE active=1 ORDER BY id DESC').all()));

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

app.post('/api/orders', orderLimit, async (req, res) => {
  const { name, phone, email, address, zone, payment, trx, coupon, note, items } = req.body || {};
  if (!name || !address || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Please fill all required fields' });
  if (!/^(\+?88)?01\d{9}$/.test(phone || '')) return res.status(400).json({ error: 'Enter a valid Bangladeshi mobile number' });
  if (!['cod', 'bkash', 'nagad', ...(SSL_ON ? ['online'] : [])].includes(payment)) return res.status(400).json({ error: 'Choose a payment method' });
  if (['bkash', 'nagad'].includes(payment) && !(trx || '').trim()) return res.status(400).json({ error: 'Transaction ID is required' });
  const user = userFrom(req);
  let out;
  try {
    out = db.transaction(() => {
      let sub = 0; const lines = [], taken = {};
      for (const it of items) {
        const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.id), q = parseInt(it.qty, 10);
        if (!p || !(q > 0)) throw new Error('Invalid item in cart');
        const vs = p.variants ? p.variants.split(',').map(x => x.trim()).filter(Boolean) : [];
        if (vs.length && !vs.includes(it.variant)) throw new Error(`Choose an option for "${p.name}"`);
        taken[p.id] = (taken[p.id] || 0) + q;
        if (p.stock < taken[p.id]) throw new Error(`Only ${p.stock} left for "${p.name}"`);
        sub += eff(p) * q; lines.push({ p, q, label: vs.length ? `${p.name} (${it.variant})` : p.name });
      }
      const c = applyCoupon(coupon, sub); if (c.error) throw new Error(c.error);
      const z = zone === 'dhaka' ? 'dhaka' : 'outside', ship = shippingFor(z, sub), total = sub - c.discount + ship;
      const id = db.prepare(`INSERT INTO orders (name,phone,email,address,zone,subtotal,shipping,discount,coupon,total,payment,trx,note,user_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(name, phone, email || user?.email || '', address, z, sub, ship, c.discount, c.code || '', total, payment, trx || '', note || '', user?.id || null).lastInsertRowid;
      const orderNo = 'TC' + (1000 + Number(id));
      db.prepare('UPDATE orders SET order_no=? WHERE id=?').run(orderNo, id);
      for (const { p, q, label } of lines) {
        db.prepare('INSERT INTO order_items VALUES (?,?,?,?,?)').run(id, p.id, label, eff(p), q);
        db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(q, p.id);
      }
      return { id, orderNo, total };
    })();
  } catch (e) { return res.status(400).json({ error: e.message }); }
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(out.id);
  notify(o, 'New order');
  const resp = { ok: true, orderNo: out.orderNo, total: out.total };
  if (payment === 'online') {
    try { resp.gatewayUrl = await sslInit(o, `${req.protocol}://${req.get('host')}`); } catch (e) { console.error('ssl:', e.message); }
    if (!resp.gatewayUrl) resp.warn = 'Online payment is unavailable right now. Please contact us with your order number.';
  }
  res.json(resp);
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
    daily: db.prepare("SELECT date(created_at) d, SUM(total) s FROM orders WHERE status!='cancelled' AND date(created_at)>=date('now','-6 day') GROUP BY d ORDER BY d").all(),
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
const pf = b => ({ name: (b.name || '').trim(), price: +b.price || 0, sale: +b.sale_price || 0, cat: b.category || 'General', stock: parseInt(b.stock) || 0,
  desc: b.description || '', active: b.active === '0' ? 0 : 1, vars: (b.variants || '').split(',').map(x => x.trim()).filter(Boolean).join(',') });
app.post('/api/admin/products', upload.single('image'), (req, res) => {
  const f = pf(req.body); if (!f.name || !(f.price > 0)) return res.status(400).json({ error: 'Name and price required' });
  db.prepare('INSERT INTO products (name,price,sale_price,category,description,stock,active,variants,image) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(f.name, f.price, f.sale, f.cat, f.desc, f.stock, f.active, f.vars, req.file ? '/uploads/' + req.file.filename : '');
  res.json({ ok: true });
});
app.put('/api/admin/products/:id', upload.single('image'), (req, res) => {
  const f = pf(req.body);
  db.prepare('UPDATE products SET name=?,price=?,sale_price=?,category=?,stock=?,description=?,active=?,variants=? WHERE id=?').run(f.name, f.price, f.sale, f.cat, f.stock, f.desc, f.active, f.vars, req.params.id);
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

// ---------- Customer accounts ----------
app.post('/api/register', authLimit, (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 6) return res.status(400).json({ error: 'Name, valid email and 6+ character password required' });
  try {
    const id = db.prepare('INSERT INTO users (name,email,phone,pass) VALUES (?,?,?,?)').run(name.trim(), email.toLowerCase().trim(), phone || '', hashPw(password)).lastInsertRowid;
    setSess(req, res, id); res.json({ id, name: name.trim(), email: email.toLowerCase().trim(), phone: phone || '' });
  } catch { res.status(400).json({ error: 'This email is already registered' }); }
});
app.post('/api/login', authLimit, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(((req.body || {}).email || '').toLowerCase().trim());
  if (!u || !checkPw((req.body || {}).password || '', u.pass)) return res.status(400).json({ error: 'Wrong email or password' });
  setSess(req, res, u.id); res.json({ id: u.id, name: u.name, email: u.email, phone: u.phone });
});
app.post('/api/logout', (req, res) => { res.append('Set-Cookie', 'tc_sess=; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json(userFrom(req)));
app.get('/api/my-orders', (req, res) => {
  const u = userFrom(req); if (!u) return res.status(401).json({ error: 'Login required' });
  const li = db.prepare('SELECT name,price,qty FROM order_items WHERE order_id=?');
  res.json(db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(u.id).map(o => ({ ...o, items: li.all(o.id) })));
});

// ---------- Reviews ----------
app.get('/api/products/:id/reviews', (req, res) => res.json(db.prepare('SELECT name,rating,body,created_at FROM reviews WHERE product_id=? ORDER BY id DESC LIMIT 50').all(req.params.id)));
app.post('/api/products/:id/reviews', (req, res) => {
  const u = userFrom(req), r = parseInt(req.body?.rating, 10);
  if (!u) return res.status(401).json({ error: 'Please login to write a review' });
  if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: 'Choose a rating' });
  if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT OR REPLACE INTO reviews (product_id,user_id,name,rating,body) VALUES (?,?,?,?,?)').run(req.params.id, u.id, u.name, r, String(req.body.body || '').slice(0, 1000));
  res.json({ ok: true });
});

// ---------- SSLCommerz callbacks ----------
app.post('/pay/success', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { val_id, tran_id } = req.body || {};
    const v = await (await fetch(`${SSL}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(val_id)}&store_id=${SSL_ID}&store_passwd=${SSL_PASS}&format=json`)).json();
    const o = db.prepare('SELECT * FROM orders WHERE order_no=?').get(tran_id || '');
    if (o && ['VALID', 'VALIDATED'].includes(v.status) && v.tran_id === o.order_no && Math.abs(+v.amount - o.total) < 1) {
      db.prepare("UPDATE orders SET pay_status='paid', trx=?, status=CASE WHEN status='pending' THEN 'confirmed' ELSE status END WHERE id=?").run(v.bank_tran_id || val_id, o.id);
      notify({ ...o, pay_status: 'paid' }, 'Payment received');
      return res.redirect('/#/paid/' + o.order_no);
    }
  } catch (e) { console.error('pay:', e.message); }
  res.redirect('/#/pay-failed');
});
app.post(['/pay/fail', '/pay/cancel'], (_, res) => res.redirect('/#/pay-failed'));

// ---------- Admin extras ----------
app.post('/api/admin/orders/:id/paid', (req, res) => { db.prepare("UPDATE orders SET pay_status='paid' WHERE id=?").run(req.params.id); res.json({ ok: true }); });
app.get('/api/admin/orders.csv', (_, res) => {
  const rows = db.prepare('SELECT order_no,created_at,name,phone,address,payment,pay_status,trx,subtotal,shipping,discount,total,status FROM orders ORDER BY id DESC').all();
  const q = v => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const h = Object.keys(rows[0] || { order_no: 1 });
  res.type('text/csv').attachment('orders.csv').send('\ufeff' + [h.join(','), ...rows.map(r => h.map(k => q(r[k])).join(','))].join('\n'));
});
app.get('/api/admin/backup', async (_, res) => {
  const f = path.join(DATA, 'backup-' + Date.now() + '.db');
  await db.backup(f);
  res.download(f, 'typeconnected-backup.db', () => fs.unlink(f, () => {}));
});

// ---------- Site content: banners, pages, contact, newsletter ----------
app.get('/api/site', (_, r) => r.json({ banners: db.prepare('SELECT * FROM banners WHERE active=1 ORDER BY sort,id').all(), pages: db.prepare('SELECT slug,title FROM pages ORDER BY sort,title').all() }));
app.get('/api/pages/:slug', (req, res) => { const p = db.prepare('SELECT slug,title,body FROM pages WHERE slug=?').get(req.params.slug); p ? res.json(p) : res.status(404).json({ error: 'Not found' }); });
app.post('/api/contact', authLimit, (req, res) => {
  const { name, phone, email, message } = req.body || {};
  if (!name || !(message || '').trim() || !(phone || email)) return res.status(400).json({ error: 'Name, message and phone or email are required' });
  db.prepare('INSERT INTO messages (name,phone,email,message) VALUES (?,?,?,?)').run(String(name).slice(0, 100), String(phone || '').slice(0, 30), String(email || '').slice(0, 100), String(message).slice(0, 2000));
  if (mailer) mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: process.env.ADMIN_EMAIL || S().email, subject: 'New message from ' + name,
    html: `<p>${esc(name)} · ${esc(phone)} · ${esc(email)}</p><p>${esc(message)}</p>` }).catch(() => {});
  res.json({ ok: true });
});
app.post('/api/subscribe', authLimit, (req, res) => {
  const e = String((req.body || {}).email || '').toLowerCase().trim();
  if (!/^\S+@\S+\.\S+$/.test(e)) return res.status(400).json({ error: 'Enter a valid email' });
  db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(e); res.json({ ok: true });
});
app.get('/api/admin/banners', (_, r) => r.json(db.prepare('SELECT * FROM banners ORDER BY sort,id').all()));
app.post('/api/admin/banners', upload.single('image'), (req, res) => {
  const b = req.body || {}; if (!(b.title || '').trim()) return res.status(400).json({ error: 'Title required' });
  db.prepare('INSERT INTO banners (title,subtitle,image,link,btn,sort) VALUES (?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM banners))')
    .run(b.title.trim(), b.subtitle || '', req.file ? '/uploads/' + req.file.filename : '', b.link || '', b.btn || 'Shop now'); res.json({ ok: true });
});
app.delete('/api/admin/banners/:id', (req, res) => { db.prepare('DELETE FROM banners WHERE id=?').run(req.params.id); res.json({ ok: true }); });
app.get('/api/admin/pages', (_, r) => r.json(db.prepare('SELECT * FROM pages ORDER BY sort,title').all()));
app.post('/api/admin/pages', (req, res) => {
  const { slug, title, body } = req.body || {}; if (!(title || '').trim()) return res.status(400).json({ error: 'Title required' });
  const sl = (slug || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page-' + Date.now();
  db.prepare('INSERT INTO pages (slug,title,body) VALUES (?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, body=excluded.body').run(sl, title.trim(), body || '');
  res.json({ ok: true, slug: sl });
});
app.delete('/api/admin/pages/:slug', (req, res) => { db.prepare('DELETE FROM pages WHERE slug=?').run(req.params.slug); res.json({ ok: true }); });
app.get('/api/admin/messages', (_, r) => r.json({ messages: db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all(), subscribers: db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 500').all() }));
app.delete('/api/admin/messages/:id', (req, res) => { db.prepare('DELETE FROM messages WHERE id=?').run(req.params.id); res.json({ ok: true }); });

app.listen(PORT, () => console.log('TypeConnected shop on :' + PORT));
