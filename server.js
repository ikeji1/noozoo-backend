const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 10000;

/* CONNECT TO MYSQL */
const db = mysql.createConnection({
  host: "195.35.53.16",
  user: "noozoo_user",
  password: "Chinecherem276",
  database: "noozoo",
  port: 3306
});

db.connect(err => {
  if (err) {
    console.log("❌ MySQL connection error:", err);
  } else {
    console.log("✅ MySQL Connected");
  }
});

app.use(cors());
app.use(express.json());


/* ROOT */
app.get("/", (req,res)=>{
  res.send("NooZoo backend running");
});


/* REGISTER */
app.post("/api/register",(req,res)=>{

  const { name,email,password } = req.body;

  if(!name || !email || !password){
    return res.json({ ok:false, msg:"missing fields"});
  }

  const id = "u_" + Date.now();

  const sql = `
  INSERT INTO users
  (id,name,email,password,balance,earned,deposited,withdrawn,lastSeen,createdAt)
  VALUES (?,?,?,?,0,0,0,0,?,?)
  `;

  db.query(
    sql,
    [
      id,
      name,
      email,
      password,
      Date.now(),
      new Date().toLocaleString()
    ],
    (err)=>{

      if(err){
        console.log(err);
        return res.json({ ok:false });
      }

      res.json({
        ok:true,
        user:{ id,name,email }
      });

    }
  );

});


/* LOGIN */
app.post("/api/login",(req,res)=>{

  const { email,password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email=? AND password=?",
    [email,password],
    (err,rows)=>{

      if(err || rows.length===0){
        return res.json({ ok:false });
      }

      res.json({
        ok:true,
        user:rows[0]
      });

    }
  );

});


/* GET USER */
app.get("/api/user/:id",(req,res)=>{

  db.query(
    "SELECT * FROM users WHERE id=?",
    [req.params.id],
    (err,rows)=>{

      if(err || rows.length===0){
        return res.json({ ok:false });
      }

      res.json({
        ok:true,
        user:rows[0]
      });

    }
  );

});


/* UPDATE USER */
app.put("/api/user/:id",(req,res)=>{

  db.query(
    "UPDATE users SET ? WHERE id=?",
    [req.body,req.params.id],
    (err)=>{

      if(err){
        return res.json({ ok:false });
      }

      res.json({ ok:true });

    }
  );

});


/* SAVE PENDING */
app.post("/api/pending",(req,res)=>{

  const id = "p_" + Date.now();

  db.query(
    "INSERT INTO pending (id,data) VALUES (?,?)",
    [id,JSON.stringify(req.body)],
    ()=> res.json({ ok:true })
  );

});


/* GET PENDING */
app.get("/api/pending",(req,res)=>{

  db.query(
    "SELECT * FROM pending",
    (err,rows)=>{

      res.json({
        ok:true,
        pending: rows.map(x=>JSON.parse(x.data))
      });

    }
  );

});


/* ADMIN LOGIN */
app.post("/api/admin/login",(req,res)=>{

  const { username,password } = req.body;

  db.query(
    "SELECT * FROM admin WHERE username=? AND password=?",
    [username,password],
    (err,rows)=>{

      if(err || rows.length===0){
        return res.json({ ok:false });
      }

      res.json({ ok:true });

    }
  );

});


/* ADMIN USERS */
app.get("/api/admin/users",(req,res)=>{

  db.query(
    "SELECT * FROM users",
    (err,rows)=>{

      res.json({
        ok:true,
        users:rows
      });

    }
  );

});


/* PAYOUT SAVE */
app.post("/api/admin/payouts",(req,res)=>{

  const id = "pay_" + Date.now();

  db.query(
    "INSERT INTO payouts (id,data) VALUES (?,?)",
    [id,JSON.stringify(req.body)],
    ()=> res.json({ ok:true })
  );

});


/* GET PAYOUTS */
app.get("/api/admin/payouts",(req,res)=>{

  db.query(
    "SELECT * FROM payouts",
    (err,rows)=>{

      res.json({
        ok:true,
        payouts: rows.map(x=>JSON.parse(x.data))
      });

    }
  );

});


/* START SERVER */
app.listen(PORT,()=>{
  console.log("Server running on port",PORT);
});