const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DB   = path.join(__dirname, 'db.json');

// ── MIDDLEWARE ────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DATABASE HELPERS ──────────────────
function readDB() {
  if (!fs.existsSync(DB)) {
    const empty = {
      users:   [],
      pending: [],
      payouts: [],
      admin:   { username:'admin', password:'admin123', totalPaid:0, lastRun:null }
    };
    fs.writeFileSync(DB, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DB, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

// ── ROOT ROUTE ────────────────────────
app.get('/', (req, res) => {
  res.send('NooZoo Backend is running!');
});

// ── USER ROUTES ───────────────────────
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.json({ ok:false, msg:'Fill in all fields' });
  if (password.length < 6) return res.json({ ok:false, msg:'Password must be 6+ chars' });

  const db = readDB();
  if (db.users.find(u => u.email === email)) return res.json({ ok:false, msg:'Email already registered' });

  const user = {
    id:           'u_' + Date.now(),
    name, email, password,
    plan:         null,
    rate:         0,
    crypto:       null,
    balance:      0,
    earned:       0,
    deposited:    0,
    withdrawn:    0,
    wallet:       '',
    investments:  [],
    transactions: [],
    lastSeen:     Date.now(),
    createdAt:    new Date().toLocaleString()
  };

  db.users.push(user);
  writeDB(db);
  res.json({ ok:true, user });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const db   = readDB();
  const user = db.users.find(u => u.email === email && u.password === password);
  if (!user) return res.json({ ok:false, msg:'Invalid email or password' });
  res.json({ ok:true, user });
});

app.get('/api/user/:id', (req, res) => {
  const db   = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok:false, msg:'User not found' });
  res.json({ ok:true, user });
});

app.put('/api/user/:id', (req, res) => {
  const db  = readDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.json({ ok:false, msg:'User not found' });
  db.users[idx] = { ...db.users[idx], ...req.body };
  writeDB(db);
  res.json({ ok:true, user: db.users[idx] });
});

// ── PENDING / PAYOUTS ─────────────────
app.post('/api/pending', (req, res) => {
  const db = readDB();
  db.pending.push(req.body);
  writeDB(db);
  res.json({ ok:true });
});

app.get('/api/pending', (req, res) => {
  const db = readDB();
  res.json({ ok:true, pending: db.pending });
});

app.put('/api/pending/:id', (req, res) => {
  const db  = readDB();
  const idx = db.pending.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.json({ ok:false, msg:'Not found' });
  db.pending[idx] = { ...db.pending[idx], ...req.body };
  writeDB(db);
  res.json({ ok:true });
});

// ── ADMIN ROUTES ─────────────────────
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const a  = db.admin;
  if (username === a.username && password === a.password) {
    res.json({ ok:true });
  } else {
    res.json({ ok:false, msg:'Wrong credentials' });
  }
});

app.get('/api/admin/users', (req, res) => {
  const db = readDB();
  res.json({ ok:true, users: db.users });
});

app.put('/api/admin/user/:id', (req, res) => {
  const db  = readDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.json({ ok:false, msg:'User not found' });
  db.users[idx] = { ...db.users[idx], ...req.body };
  writeDB(db);
  res.json({ ok:true, user: db.users[idx] });
});

app.get('/api/admin/stats', (req, res) => {
  const db = readDB();
  res.json({ ok:true, admin: db.admin });
});

app.put('/api/admin/stats', (req, res) => {
  const db = readDB();
  db.admin = { ...db.admin, ...req.body };
  writeDB(db);
  res.json({ ok:true });
});

app.get('/api/admin/payouts', (req, res) => {
  const db = readDB();
  res.json({ ok:true, payouts: db.payouts });
});

app.post('/api/admin/payouts', (req, res) => {
  const db = readDB();
  db.payouts.push(req.body);
  writeDB(db);
  res.json({ ok:true });
});

// ── START SERVER ──────────────────────
app.listen(PORT, () => {
  console.log(`NooZoo server running on port ${PORT}`);
});