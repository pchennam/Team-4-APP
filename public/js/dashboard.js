// ====================== dashboard.js (FINAL WORKING VERSION) ======================
"use strict";

// ---------------- AUTH ----------------
const getToken = () =>
  localStorage.getItem("token") || localStorage.getItem("jwtToken") || "";

const auth = () =>
  getToken() ? { Authorization: "Bearer " + getToken() } : {};

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// ---------------- API ----------------
async function apiGetReport() {
  const r = await fetch("/api/reports", { headers: auth() });

  if (r.status === 401) {
    localStorage.clear();
    location.href = "/";
  }

  return r.json();
}

// ---------------- LOAD DASHBOARD ----------------
async function loadDashboard() {
  const data = await apiGetReport();

  // ---------- KPIs ----------
  document.getElementById("kpiIncome").textContent =
    data?.totals?.income > 0
      ? currencyFmt.format(data.totals.income)
      : "No data";

  document.getElementById("kpiExpenses").textContent =
    data?.totals?.expenses > 0
      ? currencyFmt.format(data.totals.expenses)
      : "No data";

  const budgetTotal = (data.budgets?.byCategory || []).reduce(
    (sum, row) => sum + Number(row.total || 0),
    0
  );

  document.getElementById("kpiBudget").textContent =
    budgetTotal > 0 ? currencyFmt.format(budgetTotal) : "No data";

  // ---------- Render Charts ----------
  renderIncomeChart(data.monthlyIncome || []);
  setupCategoryChart(data.expensesByCategory || []);
  setupBudgetVsActualChart(
    data.budgets.byCategory || [],
    data.expensesByCategory || []
  );
}

// ---------------- FORMAT MONTH LABEL (Jan '23) ----------------
function formatMonthLabel(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const month = d.toLocaleString("en-US", { month: "short" });
  const yr = String(d.getFullYear()).slice(2);
  return `${month} '${yr}`;
}

// ---------------- INCOME TREND CHART ----------------
let incomeChart = null;
function renderIncomeChart(rows) {
  const ctx = document.getElementById("incomeChart")?.getContext("2d");
  if (!ctx) return;
  if (incomeChart) incomeChart.destroy();

  const labels = rows.map((r) => formatMonthLabel(r.date));
  const values = rows.map((r) => Number(r.total));

  incomeChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Monthly Income ($)",
          data: values,
          borderColor: "#4DA3FF",
          backgroundColor: "rgba(77,163,255,0.2)",
          pointBackgroundColor: "#4DA3FF",
          borderWidth: 3,
          tension: 0.3,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => currencyFmt.format(value),
          },
        },
      },
    },
  });
}

// // ---------------- EXPENSE CATEGORY DOUGHNUT ----------------
// let categoryChart = null;
// function setupCategoryChart(rows) {
//   const ctx = document.getElementById("categoryChart")?.getContext("2d");
//   if (!ctx) return;

//   if (categoryChart) categoryChart.destroy();

//   categoryChart = new Chart(ctx, {
//     type: "doughnut",
//     data: {
//       labels: rows.map((r) => r.category),
//       datasets: [
//         {
//           data: rows.map((r) => Number(r.total)),
//           backgroundColor: ["#00A878", "#2274A5", "#F75C03", "#8C4F7F", "#FFB400"],
//           hoverOffset: 12,
//         },
//       ],
//     },
//     options: {
//       plugins: { legend: { position: "right" } },
//     },
//   });
// }

// ---------------- BUDGET VS ACTUAL ----------------
let barChart = null;
function setupBudgetVsActualChart(budgets, expenses) {
  const ctx = document.getElementById("budgetVsActualChart")?.getContext("2d");
  if (!ctx) return;

  if (barChart) barChart.destroy();

  // all categories that appear anywhere
  const categories = Array.from(
    new Set([
      ...budgets.map((b) => b.category),
      ...expenses.map((e) => e.category),
    ])
  );

  const budgetVals = categories.map(
    (cat) => budgets.find((b) => b.category === cat)?.total || 0
  );

  const actualVals = categories.map(
    (cat) => expenses.find((e) => e.category === cat)?.total || 0
  );

  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: categories,
      datasets: [
        {
          label: "Budget",
          data: budgetVals,
          backgroundColor: "#00A878CC",
          borderColor: "#00A878",
          borderWidth: 2,
          barThickness: 30,
        },
        {
          label: "Actual",
          data: actualVals,
          backgroundColor: "#F75C03CC",
          borderColor: "#F75C03",
          borderWidth: 2,
          barThickness: 30,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${currencyFmt.format(ctx.raw)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => currencyFmt.format(v) },
        },
        x: {
          ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 },
        },
      },
    },
  });
}
// ---------------- EXPENSE CATEGORY DOUGHNUT ----------------
let categoryChart = null;
function setupCategoryChart(rows) {
  const ctx = document.getElementById("categoryChart")?.getContext("2d");
  if (!ctx) return;

  if (categoryChart) categoryChart.destroy();

  const labels = rows.map((r) => r.category);
  const values = rows.map((r) => Number(r.total));

  const total = values.reduce((a, b) => a + b, 0);

  categoryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: ["#00A878", "#2274A5", "#F75C03", "#8C4F7F", "#FFB400"],
          hoverOffset: 12,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "right" },

        // ⭐ ADD TOOLTIP FORMATTER HERE ⭐
        tooltip: {
          callbacks: {
            label: function (context) {
              const category = context.label;
              const amount = context.raw;
              const pct = ((amount / total) * 100).toFixed(1);

              return [
                `${category}: ${currencyFmt.format(amount)}`,
                `${pct}% of total`
              ];
            },
          },
        },
      },
    },
  });
}

// ---------------- INIT ----------------
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();

  document
    .getElementById("refreshButton")
    ?.addEventListener("click", loadDashboard);

  document.getElementById("logoutButton")?.addEventListener("click", () => {
    localStorage.clear();
    location.href = "/";
  });
});
