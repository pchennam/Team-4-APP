// ======================= budget.js (FINAL WORKING VERSION) =======================
"use strict";

// ---------------- AUTH HELPERS ----------------
const getToken = () =>
  localStorage.getItem("token") || localStorage.getItem("jwtToken") || "";

const auth = () =>
  getToken() ? { Authorization: "Bearer " + getToken() } : {};

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const unformatCurrency = (s) =>
  Number(String(s || "").replace(/[^0-9.-]+/g, "")) || 0;

function attachCurrencyFormatter(input) {
  if (!input) return;
  if (!input.value) input.value = currencyFmt.format(0);
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "");
    input.value = currencyFmt.format((parseInt(digits || "0") / 100));
  });
  input.addEventListener("blur", () => {
    input.value = currencyFmt.format(unformatCurrency(input.value));
  });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------- GLOBAL STATE ----------------
let spendingChart = null;
let budgets = {}; // {category: amount}
let transactions = [];
let categoryColors = {};

// ---------------- API ----------------
async function apiCreateBudget(body) {
  const r = await fetch("/api/budgets", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth() },
    body: JSON.stringify(body),
  });
  if (r.status === 401) return logout();
  return r.json();
}

async function apiCreateIncome(body) {
  return fetch("/api/income", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth() },
    body: JSON.stringify(body),
  });
}

async function apiCreateExpense(body) {
  return fetch("/api/expense", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth() },
    body: JSON.stringify(body),
  });
}

async function apiGetReport() {
  const r = await fetch("/api/reports", { headers: auth() });
  if (r.status === 401) return logout();
  return r.json();
}

async function apiListBudgets() {
  const r = await fetch("/api/budgets", { headers: auth() });
  if (r.status === 401) return logout();
  const data = await r.json();
  return data.items || [];
}

async function apiLoadCategories() {
  const r = await fetch("/api/categories", { headers: auth() });
  if (r.status === 401) return logout();
  const data = await r.json();
  return data.categories || [];
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("jwtToken");
  window.location.href = "/";
}

// ---------------- RENDER HELPERS ----------------
function renderTransactions() {
  const list = document.getElementById("transaction-list");
  if (!list) return;

  list.innerHTML = "";
  transactions.forEach((t) => {
    const li = document.createElement("li");
    li.classList.add(t.type);
    li.innerHTML = `${t.category} – <strong>${
      t.type === "income" ? "+" : "-"
    }${currencyFmt.format(t.amount)}</strong>`;
    list.prepend(li);
  });
}

function updateSummary(data) {
  document.getElementById("total-income").textContent = currencyFmt.format(
    data.income || 0
  );
  document.getElementById("total-expenses").textContent = currencyFmt.format(
    data.expenses || 0
  );
  document.getElementById("remaining-balance").textContent = currencyFmt.format(
    data.net || 0
  );
}

function getCategoryColor(category) {
  const preset = {
    Rent: "#00A878",
    Other: "#2274A5",
    Utilities: "#F75C03",
    "Food/Groceries": "#8C4F7F",
    Transportation: "#FFB400",
  };
  if (preset[category]) return preset[category];

  if (!categoryColors[category]) {
    const letters = "456789ABCDEF";
    let c = "#";
    for (let i = 0; i < 6; i++)
      c += letters[Math.floor(Math.random() * letters.length)];
    categoryColors[category] = c;
  }
  return categoryColors[category];
}

function updateChart(expCats) {
  const labels = expCats.map((c) => c.category);
  const data = expCats.map((c) => Number(c.total || 0));

  spendingChart.data.labels = labels;
  spendingChart.data.datasets[0].data = data;
  spendingChart.data.datasets[0].backgroundColor = labels.map(getCategoryColor);

  spendingChart.update();
}

// ---------------- EVENT HANDLERS ----------------
async function handleBudgetSubmit(e) {
  e.preventDefault();

  const categorySelect = document.getElementById("category-select");
  const customInput = document.getElementById("category-custom");
  const amountInput = document.getElementById("budget-amount");

  const category =
    categorySelect.value === "custom"
      ? customInput.value.trim()
      : categorySelect.value.trim();

  const amount = unformatCurrency(amountInput.value);

  if (!category || amount <= 0) return alert("Enter valid category + amount.");

  await apiCreateBudget({ category, amount, cadence: "monthly" });

  categorySelect.value = "";
  customInput.value = "";
  customInput.style.display = "none";

  amountInput.value = currencyFmt.format(0);

  loadEverything();
}

async function handleTransactionSubmit(e) {
  e.preventDefault();

  const type = document.getElementById("type").value;
  const category = document.getElementById("trans-category").value.trim();
  const amount = unformatCurrency(document.getElementById("amount").value);

  if (!category || amount <= 0) return alert("Invalid fields");

  const payload = { amount, date: todayISO(), cadence: "monthly" };

  if (type === "income") {
    await apiCreateIncome({ ...payload, source: category });
  } else {
    await apiCreateExpense({ ...payload, category });
  }

  transactions.push({ type, category, amount });
  renderTransactions();

  loadEverything();

  document.getElementById("trans-category").value = "";
  document.getElementById("amount").value = currencyFmt.format(0);
}

// ---------------- MASTER LOAD ----------------
async function loadEverything() {
  const [budRows, report] = await Promise.all([
    apiListBudgets(),
    apiGetReport(),
  ]);

  // Convert budgets array → object
  budgets = {};
  budRows.forEach((b) => (budgets[b.category] = Number(b.amount || 0)));

  updateSummary(report.totals);
  updateChart(report.expensesByCategory);
}

// ---------------- INIT ----------------
document.addEventListener("DOMContentLoaded", async () => {
  attachCurrencyFormatter(document.getElementById("budget-amount"));
  attachCurrencyFormatter(document.getElementById("amount"));

  // Load custom categories
  const categories = await apiLoadCategories();
  const datalist = document.getElementById("expenseCategories");
  datalist.innerHTML = "";
  categories.forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    datalist.appendChild(o);
  });

  // Custom category logic
  const categorySelect = document.getElementById("category-select");
  const customInput = document.getElementById("category-custom");

  categorySelect.addEventListener("change", () => {
    if (categorySelect.value === "custom") {
      customInput.style.display = "block";
      customInput.required = true;
    } else {
      customInput.style.display = "none";
      customInput.required = false;
      customInput.value = "";
    }
  });

  // Init chart
  const ctx = document.getElementById("spendingChart").getContext("2d");
  spendingChart = new Chart(ctx, {
    type: "pie",
    data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const cat = ctx.label;
              const spent = Number(ctx.raw);

              const budget = budgets[cat] || null;
              if (!budget)
                return `${cat}: ${currencyFmt.format(
                  spent
                )} (Budget not set)`;

              const remaining = budget - spent;

              return [
                `${cat}`,
                `Spent: ${currencyFmt.format(spent)}`,
                `Budget: ${currencyFmt.format(budget)}`,
                `Remaining: ${currencyFmt.format(remaining)}`,
              ];
            },
          },
        },
      },
    },
  });

  // Add form handlers
  document
    .getElementById("budgetForm")
    .addEventListener("submit", handleBudgetSubmit);
  document
    .getElementById("transactionForm")
    .addEventListener("submit", handleTransactionSubmit);

  // Initial load
  loadEverything();
});
