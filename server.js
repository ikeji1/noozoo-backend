const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MYSQL CONNECTION ──────────────────
const pool = mysql.createPool({
  host:               '195.35.53.16',
  user:               'noozoo_user',
  password:           'Chinecherem276',
  database:           'noozoo',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  connectTimeout:     60000,
  acquireTimeout:     60000,
  timeout:            60000,
  reconnect:          true,
  ssl: { rejectUnauthorized: false }
});

// ── KEEP ALIVE — ping every 4 minutes ─
setInterval(async () => {
  try {
    await pool.execute('SELECT 1');
    console.log('DB keep-alive ping OK');
  } catch(e) {
    console.error('Keep-alive failed:', e.message);
  }
}, 4 * 60 * 1000);

// ── MIDDLEWARE ────────────────────────
app.use(cors());
app.use(express.json());

// ── ROOT ──────────────────────────────
app.get('/', (req, res) => {
  res.json({ ok:true, msg:'NooZoo backend running', time: new Date().toISOString() });
});

// ── INIT TABLES ───────────────────────
async function initTables() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        password VARCHAR(100),
        plan VARCHAR(50) DEFAULT NULL,
        rate DECIMAL(10,4) DEFAULT 0,
        crypto VARCHAR(20) DEFAULT NULL,
        balance DECIMAL(20,6) DEFAULT 0,
        earned DECIMAL(20,6) DEFAULT 0,
        deposited DECIMAL(20,6) DEFAULT 0,
        withdrawn DECIMAL(20,6) DEFAULT 0,
        wallet TEXT,
        investments LONGTEXT,
        transactions LONGTEXT,
        last_seen BIGINT DEFAULT 0,
        created_at VARCHAR(100)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(100),
        amount DECIMAL(20,6),
        type VARCHAR(50),
        date VARCHAR(100),
        note VARCHAR(200)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id VARCHAR(20) PRIMARY KEY,
        username VARCHAR(50) DEFAULT 'admin',
        password VARCHAR(100) DEFAULT 'admin123',
        total_paid DECIMAL(20,6) DEFAULT 0,
        last_run VARCHAR(100) DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
      INSERT IGNORE INTO admin_settings (id, username, password, total_paid)
      VALUES ('main', 'admin', 'admin123', 0)
    `);

    console.log('All tables ready');
  } catch(e) {
    console.error('initTables error:', e.message);
    throw e;
  }
}

// ── HELPER ────────────────────────────
function parseJSON(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

function formatUser(u) {
  return {
    id:           u.id,
    name:         u.name,
    email:        u.email,
    password:     u.password,
    plan:         u.plan || null,
    rate:         parseFloat(u.rate) || 0,
    crypto:       u.crypto || null,
    balance:      parseFloat(u.balance) || 0,
    earned:       parseFloat(u.earned) || 0,
    deposited:    parseFloat(u.deposited) || 0,
    withdrawn:    parseFloat(u.withdrawn) || 0,
    wallet:       u.wallet || '',
    investments:  parseJSON(u.investments),
    transactions: parseJSON(u.transactions),
    lastSeen:     parseInt(u.last_seen) || Date.now(),
    createdAt:    u.created_at
  };
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

    const id = 'u_' + Date.now();
    await pool.execute(
      `INSERT INTO users
        (id,name,email,password,plan,rate,crypto,balance,earned,deposited,withdrawn,wallet,investments,transactions,last_seen,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name, email, password, null, 0, null, 0, 0, 0, 0, '', '[]', '[]', Date.now(), new Date().toLocaleString()]
    );

    const user = {
      id, name, email, password,
      plan:null, rate:0, crypto:null,
      balance:0, earned:0, deposited:0, withdrawn:0,
      wallet:'', investments:[], transactions:[],
      lastSeen:Date.now(), createdAt:new Date().toLocaleString()
    };

    res.json({ ok:true, user });
  } catch(e) {
    console.error('Register error:', e.message);
    res.json({ ok:false, msg:'Registration failed: ' + e.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute('SELECT * FROM users WHERE email=? AND password=?', [email, password]);
    if (!rows.length) return res.json({ ok:false, msg:'Invalid email or password' });
    res.json({ ok:true, user: formatUser(rows[0]) });
  } catch(e) {
    console.error('Login error:', e.message);
    res.json({ ok:false, msg:'Login failed: ' + e.message });
  }
});

// Get user by ID
app.get('/api/user/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!rows.length) return res.json({ ok:false, msg:'User not found' });
    res.json({ ok:true, user: formatUser(rows[0]) });
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

// Update user
app.put('/api/user/:id', async (req, res) => {
  try {
    const u = req.body;
    await pool.execute(
      `UPDATE users SET
        name=?, plan=?, rate=?, crypto=?,
        balance=?, earned=?, deposited=?, withdrawn=?,
        wallet=?, investments=?, transactions=?, last_seen=?
       WHERE id=?`,
      [
        u.name, u.plan || null, u.rate || 0, u.crypto || null,
        u.balance || 0, u.earned || 0, u.deposited || 0, u.withdrawn || 0,
        u.wallet || '',
        JSON.stringify(u.investments || []),
        JSON.stringify(u.transactions || []),
        u.lastSeen || Date.now(),
        req.params.id
      ]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('Update user error:', e.message);
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

// ══════════════════════════════════════
// PENDING ROUTES
// ══════════════════════════════════════

app.post('/api/pending', async (req, res) => {
  try {
    const p = req.body;
    await pool.execute(
      `INSERT INTO pending (id,type,user_id,user_name,amount,plan,rate,method,crypto,tx_hash,ret_wallet,status,date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.type, p.userId, p.userName, p.amount, p.plan||null, p.rate||0, p.method||null, p.crypto||null, p.txHash||null, p.retWallet||null, p.status||'under review', p.date]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('Pending error:', e.message);
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

app.get('/api/pending', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM pending ORDER BY date DESC');
    const pending = rows.map(p => ({
      id:p.id, type:p.type, userId:p.user_id, userName:p.user_name,
      amount:parseFloat(p.amount)||0, plan:p.plan, rate:parseFloat(p.rate)||0,
      method:p.method, crypto:p.crypto, txHash:p.tx_hash, retWallet:p.ret_wallet,
      status:p.status, date:p.date
    }));
    res.json({ ok:true, pending });
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

app.put('/api/pending/:id', async (req, res) => {
  try {
    await pool.execute('UPDATE pending SET status=? WHERE id=?', [req.body.status, req.params.id]);
    res.json({ ok:true });
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
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
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users ORDER BY created_at DESC');
    res.json({ ok:true, users: rows.map(formatUser) });
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

app.put('/api/admin/user/:id', async (req, res) => {
  try {
    const u = req.body;
    await pool.execute(
      `UPDATE users SET
        name=?, plan=?, rate=?, crypto=?,
        balance=?, earned=?, deposited=?, withdrawn=?,
        wallet=?, investments=?, transactions=?, last_seen=?
       WHERE id=?`,
      [
        u.name, u.plan||null, u.rate||0, u.crypto||null,
        u.balance||0, u.earned||0, u.deposited||0, u.withdrawn||0,
        u.wallet||'',
        JSON.stringify(u.investments||[]),
        JSON.stringify(u.transactions||[]),
        u.lastSeen||Date.now(),
        req.params.id
      ]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('Admin update user error:', e.message);
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM admin_settings WHERE id=?', ['main']);
    const a = rows[0] || { username:'admin', password:'admin123', total_paid:0, last_run:null };
    res.json({ ok:true, admin: {
      username:  a.username,
      password:  a.password,
      totalPaid: parseFloat(a.total_paid) || 0,
      lastRun:   a.last_run
    }});
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

app.put('/api/admin/stats', async (req, res) => {
  try {
    const { totalPaid, lastRun } = req.body;
    await pool.execute(
      'UPDATE admin_settings SET total_paid=?, last_run=? WHERE id=?',
      [totalPaid || 0, lastRun || null, 'main']
    );
    res.json({ ok:true });
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

app.get('/api/admin/payouts', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM payouts ORDER BY id DESC LIMIT 100');
    res.json({ ok:true, payouts: rows.map(p => ({
      userName: p.user_name, amount: parseFloat(p.amount)||0,
      type: p.type, date: p.date, note: p.note
    }))});
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

app.post('/api/admin/payouts', async (req, res) => {
  try {
    const p = req.body;
    await pool.execute(
      'INSERT INTO payouts (user_name,amount,type,date,note) VALUES (?,?,?,?,?)',
      [p.userName, p.amount, p.type, p.date, p.note||'']
    );
    res.json({ ok:true });
  } catch(e) {
    res.json({ ok:false, msg:'Error: ' + e.message });
  }
});

// ── START ─────────────────────────────
initTables().then(() => {
  app.listen(PORT, () => {
    console.log('NooZoo MySQL server running on port ' + PORT);
  });
}).catch(err => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
