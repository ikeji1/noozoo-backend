const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MYSQL CONNECTION ──────────────────
const pool = mysql.createPool({
  host:     '195.35.53.16',
  user:     'noozoo_user',
  password: 'Chinecherem276',
  database: 'noozoo',
  waitForConnections: true,
  connectionLimit:    10,
  ssl: { rejectUnauthorized: false }
});

// ── MIDDLEWARE ────────────────────────
app.use(cors());
app.use(express.json());

// ── TEST ROOT ─────────────────────────
app.get('/', (req, res) => {
  res.json({ ok:true, msg:'NooZoo backend running' });
});

// ── INIT TABLES ───────────────────────
async function initTables() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        password VARCHAR(100),
        plan VARCHAR(50),
        rate DECIMAL(10,4) DEFAULT 0,
        crypto VARCHAR(20),
        balance DECIMAL(20,6) DEFAULT 0,
        earned DECIMAL(20,6) DEFAULT 0,
        deposited DECIMAL(20,6) DEFAULT 0,
        withdrawn DECIMAL(20,6) DEFAULT 0,
        wallet TEXT,
        investments LONGTEXT,
        transactions LONGTEXT,
        last_seen BIGINT DEFAULT 0,
        created_at VARCHAR(100)
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS pending (
        id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(20),
        user_id VARCHAR(50),
        user_name VARCHAR(100),
        amount DECIMAL(20,6),
        plan VARCHAR(50),
        rate DECIMAL(10,4),
        method VARCHAR(50),
        crypto VARCHAR(20),
        tx_hash TEXT,
        ret_wallet TEXT,
        status VARCHAR(30) DEFAULT 'under review',
        date VARCHAR(100)
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS payouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(100),
        amount DECIMAL(20,6),
        type VARCHAR(50),
        date VARCHAR(100),
        note VARCHAR(200)
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id VARCHAR(20) PRIMARY KEY DEFAULT 'main',
        username VARCHAR(50) DEFAULT 'admin',
        password VARCHAR(100) DEFAULT 'admin123',
        total_paid DECIMAL(20,6) DEFAULT 0,
        last_run VARCHAR(100)
      )
    `);
    // Insert default admin if not exists
    await conn.execute(`
      INSERT IGNORE INTO admin_settings (id, username, password, total_paid)
      VALUES ('main', 'admin', 'admin123', 0)
    `);
    console.log('Tables ready');
  } finally {
    conn.release();
  }
}

// ══════════════════════════════════════
// USER ROUTES
// ══════════════════════════════════════

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.json({ ok:false, msg:'Fill in all fields' });
    if (password.length < 6) return res.json({ ok:false, msg:'Password must be 6+ chars' });
    const [existing] = await pool.execute('SELECT id FROM users WHERE email=?', [email]);
    if (existing.length) return res.json({ ok:false, msg:'Email already registered' });
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
      investments:  '[]',
      transactions: '[]',
      last_seen:    Date.now(),
      created_at:   new Date().toLocaleString()
    };
    await pool.execute(
      'INSERT INTO users (id,name,email,password,plan,rate,crypto,balance,earned,deposited,withdrawn,wallet,investments,transactions,last_seen,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [user.id,user.name,user.email,user.password,user.plan,user.rate,user.crypto,user.balance,user.earned,user.deposited,user.withdrawn,user.wallet,user.investments,user.transactions,user.last_seen,user.created_at]
    );
    user.investments  = [];
    user.transactions = [];
    res.json({ ok:true, user });
  } catch(e) { console.error(e); res.json({ ok:false, msg:'Server error: '+e.message }); }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute('SELECT * FROM users WHERE email=? AND password=?', [email, password]);
    if (!rows.length) return res.json({ ok:false, msg:'Invalid email or password' });
    const user = formatUser(rows[0]);
    res.json({ ok:true, user });
  } catch(e) { console.error(e); res.json({ ok:false, msg:'Server error' }); }
});

// Get user by ID
app.get('/api/user/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!rows.length) return res.json({ ok:false, msg:'User not found' });
    res.json({ ok:true, user: formatUser(rows[0]) });
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

// Update user
app.put('/api/user/:id', async (req, res) => {
  try {
    const u = req.body;
    await pool.execute(
      'UPDATE users SET name=?,plan=?,rate=?,crypto=?,balance=?,earned=?,deposited=?,withdrawn=?,wallet=?,investments=?,transactions=?,last_seen=? WHERE id=?',
      [u.name,u.plan,u.rate,u.crypto,u.balance,u.earned,u.deposited,u.withdrawn,u.wallet,JSON.stringify(u.investments||[]),JSON.stringify(u.transactions||[]),u.lastSeen||Date.now(),req.params.id]
    );
    res.json({ ok:true });
  } catch(e) { console.error(e); res.json({ ok:false, msg:'Server error' }); }
});

// ══════════════════════════════════════
// PENDING ROUTES
// ══════════════════════════════════════

app.post('/api/pending', async (req, res) => {
  try {
    const p = req.body;
    await pool.execute(
      'INSERT INTO pending (id,type,user_id,user_name,amount,plan,rate,method,crypto,tx_hash,ret_wallet,status,date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [p.id,p.type,p.userId,p.userName,p.amount,p.plan,p.rate,p.method,p.crypto,p.txHash,p.retWallet,p.status||'under review',p.date]
    );
    res.json({ ok:true });
  } catch(e) { console.error(e); res.json({ ok:false, msg:'Server error' }); }
});

app.get('/api/pending', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM pending ORDER BY date DESC');
    const pending = rows.map(p => ({
      id:p.id, type:p.type, userId:p.user_id, userName:p.user_name,
      amount:p.amount, plan:p.plan, rate:p.rate, method:p.method,
      crypto:p.crypto, txHash:p.tx_hash, retWallet:p.ret_wallet,
      status:p.status, date:p.date
    }));
    res.json({ ok:true, pending });
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

app.put('/api/pending/:id', async (req, res) => {
  try {
    await pool.execute('UPDATE pending SET status=? WHERE id=?', [req.body.status, req.params.id]);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

// ══════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.execute('SELECT * FROM admin_settings WHERE id=?', ['main']);
    const a = rows[0] || { username:'admin', password:'admin123' };
    if (username === a.username && password === a.password) {
      res.json({ ok:true });
    } else {
      res.json({ ok:false, msg:'Wrong credentials' });
    }
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users ORDER BY created_at DESC');
    res.json({ ok:true, users: rows.map(formatUser) });
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

app.put('/api/admin/user/:id', async (req, res) => {
  try {
    const u = req.body;
    await pool.execute(
      'UPDATE users SET name=?,plan=?,rate=?,crypto=?,balance=?,earned=?,deposited=?,withdrawn=?,wallet=?,investments=?,transactions=?,last_seen=? WHERE id=?',
      [u.name,u.plan,u.rate,u.crypto,u.balance,u.earned,u.deposited,u.withdrawn,u.wallet,JSON.stringify(u.investments||[]),JSON.stringify(u.transactions||[]),u.lastSeen||Date.now(),req.params.id]
    );
    res.json({ ok:true });
  } catch(e) { console.error(e); res.json({ ok:false, msg:'Server error' }); }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM admin_settings WHERE id=?', ['main']);
    const a = rows[0] || { username:'admin', password:'admin123', total_paid:0, last_run:null };
    res.json({ ok:true, admin: { username:a.username, password:a.password, totalPaid:a.total_paid, lastRun:a.last_run } });
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

app.put('/api/admin/stats', async (req, res) => {
  try {
    const { totalPaid, lastRun } = req.body;
    await pool.execute('UPDATE admin_settings SET total_paid=?, last_run=? WHERE id=?', [totalPaid, lastRun, 'main']);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

app.get('/api/admin/payouts', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM payouts ORDER BY id DESC LIMIT 100');
    res.json({ ok:true, payouts: rows });
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

app.post('/api/admin/payouts', async (req, res) => {
  try {
    const p = req.body;
    await pool.execute('INSERT INTO payouts (user_name,amount,type,date,note) VALUES (?,?,?,?,?)',
      [p.userName, p.amount, p.type, p.date, p.note]);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, msg:'Server error' }); }
});

// ── FORMAT USER ───────────────────────
function formatUser(u) {
  return {
    id:           u.id,
    name:         u.name,
    email:        u.email,
    password:     u.password,
    plan:         u.plan,
    rate:         parseFloat(u.rate) || 0,
    crypto:       u.crypto,
    balance:      parseFloat(u.balance) || 0,
    earned:       parseFloat(u.earned) || 0,
    deposited:    parseFloat(u.deposited) || 0,
    withdrawn:    parseFloat(u.withdrawn) || 0,
    wallet:       u.wallet || '',
    investments:  parseJSON(u.investments),
    transactions: parseJSON(u.transactions),
    lastSeen:     u.last_seen || Date.now(),
    createdAt:    u.created_at
  };
}

function parseJSON(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

// ── START ─────────────────────────────
initTables().then(() => {
  app.listen(PORT, () => {
    console.log('NooZoo server running on port ' + PORT);
  });
}).catch(err => {
  console.error('Failed to init tables:', err);
  process.exit(1);
});
