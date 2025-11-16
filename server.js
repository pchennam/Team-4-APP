require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const port = 3000;

// ===============================================================
// MIDDLEWARE
// ===============================================================
app.use(express.json());
app.use(express.static("public"));

// ===============================================================
// HTML ROUTES
// ===============================================================
app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "logon.html"))
);
app.get("/dashboard", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "dashboard.html"))
);
app.get("/income", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "income.html"))
);
app.get("/expense", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "expense.html"))
);
app.get("/report", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "budget.html"))
);
app.get("/budget-tracker", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "budget.html"))
);

// ===============================================================
// DATABASE
// ===============================================================
async function createConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

// ===============================================================
// AUTH
// ===============================================================
async function authenticateToken(req, res, next) {
  const hdr = req.headers.authorization || "";
  const parts = hdr.split(" ");
  const token = parts.length === 2 && parts[0] === "Bearer" ? parts[1] : null;

  if (!token)
    return res.status(401).json({ message: "No authentication token." });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err)
      return res.status(401).json({ message: "Invalid or expired token." });

    try {
      const conn = await createConnection();
      const [rows] = await conn.execute(
        "SELECT email FROM user WHERE email = ?",
        [decoded.email]
      );
      await conn.end();

      if (!rows.length)
        return res.status(403).json({ message: "User not found." });

      req.user = decoded;
      next();
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Database error." });
    }
  });
}

// ===============================================================
// ACCOUNT ROUTES
// ===============================================================
app.post("/api/create-account", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res
      .status(400)
      .json({ message: "Email and password are required." });

  try {
    const conn = await createConnection();
    const hashed = await bcrypt.hash(password, 10);

    await conn.execute("INSERT INTO user (email, password) VALUES (?, ?)", [
      email,
      hashed,
    ]);

    await conn.end();
    res.status(201).json({ message: "Account created successfully!" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Email already exists." });

    console.error(err);
    res.status(500).json({ message: "Error creating account." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const conn = await createConnection();
    const [rows] = await conn.execute("SELECT * FROM user WHERE email=?", [
      email,
    ]);
    await conn.end();

    if (!rows.length)
      return res.status(401).json({ message: "Invalid email or password." });

    const ok = await bcrypt.compare(password, rows[0].password);
    if (!ok)
      return res.status(401).json({ message: "Invalid email or password." });

    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Login failed." });
  }
});

// ===============================================================
// INCOME ROUTES
// ===============================================================
app.get("/api/income", authenticateToken, async (req, res) => {
  try {
    const conn = await createConnection();
    const [rows] = await conn.execute(
      "SELECT * FROM income WHERE user_email=? ORDER BY date DESC",
      [req.user.email]
    );
    await conn.end();
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ message: "Error retrieving income." });
  }
});

app.post("/api/income", authenticateToken, async (req, res) => {
  const { source, amount, date, cadence = "monthly" } = req.body;

  if (!source || !amount || !date)
    return res.status(400).json({ message: "Missing fields." });

  try {
    const conn = await createConnection();
    const [r] = await conn.execute(
      "INSERT INTO income (user_email, source, amount, cadence, date) VALUES (?, ?, ?, ?, ?)",
      [req.user.email, source.trim(), Number(amount), cadence, date]
    );
    await conn.end();
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ message: "Error creating income." });
  }
});

// ===============================================================
// EXPENSE ROUTES
// ===============================================================
app.get("/api/expense", authenticateToken, async (req, res) => {
  try {
    const conn = await createConnection();
    const [rows] = await conn.execute(
      "SELECT * FROM expense WHERE user_email=? ORDER BY date DESC",
      [req.user.email]
    );
    await conn.end();
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ message: "Error retrieving expenses." });
  }
});

app.post("/api/expense", authenticateToken, async (req, res) => {
  const { category, amount, date, description = null, cadence = "monthly" } =
    req.body;

  if (!category || !amount || !date)
    return res.status(400).json({ message: "Missing fields." });

  try {
    const conn = await createConnection();
    const [r] = await conn.execute(
      "INSERT INTO expense (user_email, category, description, amount, date, cadence) VALUES (?, ?, ?, ?, ?, ?)",
      [req.user.email, category.trim(), description, Number(amount), date, cadence]
    );
    await conn.end();
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ message: "Error creating expense." });
  }
});

// ===============================================================
// BUDGET ROUTES
// ===============================================================
app.get("/api/budgets", authenticateToken, async (req, res) => {
  try {
    const conn = await createConnection();
    const [rows] = await conn.execute(
      "SELECT id, category, amount, cadence, created_at FROM budget WHERE user_email=? ORDER BY category",
      [req.user.email]
    );
    await conn.end();
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ message: "Error retrieving budgets." });
  }
});

app.post("/api/budgets", authenticateToken, async (req, res) => {
  const { category, amount, cadence = "monthly" } = req.body;

  if (!category || !amount)
    return res.status(400).json({ message: "Missing fields." });

  try {
    const conn = await createConnection();

    const [r] = await conn.execute(
      "INSERT INTO budget (user_email, category, amount, cadence) VALUES (?, ?, ?, ?)",
      [req.user.email, category.trim(), Number(amount), cadence]
    );

    // save custom category
    await conn.execute(
      "INSERT IGNORE INTO user_categories (user_email, category) VALUES (?, ?)",
      [req.user.email, category.trim()]
    );

    await conn.end();
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ message: "Error creating budget." });
  }
});

// ===============================================================
// CATEGORIES (BUILT-IN + CUSTOM)
// ===============================================================
app.get("/api/categories", authenticateToken, async (req, res) => {
  const builtIn = [
    "Rent",
    "Utilities",
    "Food/Groceries",
    "Transportation",
    "Entertainment",
    "Health",
    "Other",
  ];

  try {
    const conn = await createConnection();
    const [rows] = await conn.execute(
      "SELECT category FROM user_categories WHERE user_email=?",
      [req.user.email]
    );
    await conn.end();

    const custom = rows.map((r) => r.category);

    res.json({ categories: [...builtIn, ...custom] });
  } catch (e) {
    res.status(500).json({ message: "Error loading categories." });
  }
});

// ===============================================================
// REPORTS (THE IMPORTANT ONE — FIXED)
// ===============================================================
app.get("/api/reports", authenticateToken, async (req, res) => {
  const email = req.user.email;

  try {
    const conn = await createConnection();

    // ---- totals ----
    const [[inc]] = await conn.execute(
      "SELECT IFNULL(SUM(amount),0) AS income FROM income WHERE user_email=?",
      [email]
    );

    const [[exp]] = await conn.execute(
      "SELECT IFNULL(SUM(amount),0) AS expenses FROM expense WHERE user_email=?",
      [email]
    );

    // ---- monthly income (line chart) ----
    const [monthlyInc] = await conn.execute(
      `SELECT DATE_FORMAT(date, '%Y-%m-01') AS date,
              SUM(amount) AS total
       FROM income
       WHERE user_email=?
       GROUP BY DATE_FORMAT(date, '%Y-%m-01')
       ORDER BY date`,
      [email]
    );

    // ---- expenses by category ----
    const [cats] = await conn.execute(
      `SELECT category, SUM(amount) AS total
       FROM expense
       WHERE user_email=?
       GROUP BY category
       ORDER BY total DESC`,
      [email]
    );

    // ---- budgets by category ----
    const [bud] = await conn.execute(
      `SELECT category, SUM(amount) AS total
       FROM budget
       WHERE user_email=?
       GROUP BY category`,
      [email]
    );

    await conn.end();

    // ---- final response ----
    res.json({
      totals: {
        income: inc.income,
        expenses: exp.expenses,
        net: inc.income - exp.expenses,
      },
      monthlyIncome: monthlyInc,
      expensesByCategory: cats,
      budgets: {
        total: bud.reduce((s, r) => s + Number(r.total), 0),
        byCategory: bud,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error building report." });
  }
});

// ===============================================================
// START SERVER
// ===============================================================
app.listen(port, () =>
  console.log(`Server running at http://localhost:${port}`)
);
