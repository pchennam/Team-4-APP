// /js/report.js
"use strict";

/* Report page script
   - renders spending pie (same logic as budget.js)
   - renders income trend, budget vs actual, expense doughnut
   - renders full-width budget-usage bar (was duplicate spending pie)
   - updates KPIs
   - exports to Excel (SheetJS)
   - relies on /api/reports and /api/budgets
*/

const getToken = () =>
  localStorage.getItem("token") || localStorage.getItem("jwtToken") || "";
const auth = () =>
  getToken() ? { Authorization: "Bearer " + getToken() } : {};

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// Chart handles
let spendingChart = null;
let incomeTrendChart = null;
let budgetVsActualChart = null;
let expenseDoughnutChart = null;
let spendingChartFull = null;

// Category color logic (copied from budget.js)
const categoryColors = {};
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

// API helpers
async function apiGetReport() {
  const r = await fetch("/api/reports", { headers: auth() });
  if (r.status === 401) {
    localStorage.clear();
    location.href = "/";
  }
  return r.json();
}
async function apiListBudgets() {
  const r = await fetch("/api/budgets", { headers: auth() });
  if (r.status === 401) {
    localStorage.clear();
    location.href = "/";
  }
  const data = await r.json();
  return data.items || [];
}
async function apiTryTransactions() {
  try {
    const r = await fetch("/api/transactions", { headers: auth() });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

// Render KPIs
function renderKPIs(totals = {}, budgetsArray = []) {
  const income = totals.income || 0;
  const expenses = totals.expenses || 0;
  const net = totals.net !== undefined ? totals.net : income - expenses;
  const budgetTotal = (budgetsArray || []).reduce(
    (s, b) => s + Number(b.total || b.amount || 0),
    0
  );

  document.getElementById("r-kpiIncome").textContent = income
    ? currencyFmt.format(income)
    : "No data";
  document.getElementById("r-kpiExpenses").textContent = expenses
    ? currencyFmt.format(expenses)
    : "No data";
  document.getElementById("r-kpiBudget").textContent = budgetTotal
    ? currencyFmt.format(budgetTotal)
    : "No data";
  document.getElementById("r-kpiNet").textContent = net
    ? currencyFmt.format(net)
    : "No data";
}

// Spending pie (small left) – actual spending by category
function renderSpendingPie(expCats = [], budgetsObj = {}) {
  const ctx = document
    .getElementById("reportSpendingChart")
    ?.getContext("2d");
  if (!ctx) return;
  const labels = expCats.map((c) => c.category);
  const data = expCats.map((c) => Number(c.total || 0));
  const bg = labels.map(getCategoryColor);

  if (spendingChart) spendingChart.destroy();
  spendingChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        { data, backgroundColor: bg, borderColor: "#fff", borderWidth: 1 },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const cat = ctx.label;
              const spent = Number(ctx.raw || 0);
              const budget = budgetsObj[cat] || null;
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
      responsive: true,
      maintainAspectRatio: false,
    },
  });
  window.reportCharts = window.reportCharts || {};
  window.reportCharts.spendingPie = spendingChart;
}

// Full-width Budget Usage by Category (%) – Polar Area chart so it
// feels visually different from the Budget vs Actual bar chart.
function renderSpendingPieFull(expCats = [], budgetsObj = {}) {
  const ctx = document
    .getElementById("reportSpendingChartFull")
    ?.getContext("2d");
  if (!ctx) return;

  // Categories and spent amounts
  const labels = expCats.map((c) => c.category);
  const spent = expCats.map((c) => Number(c.total || 0));

  // Budget per category (from budgetsObj)
  const budgets = labels.map((cat) => Number(budgetsObj[cat] || 0));

  // Percent of budget used (0 if no budget set)
  const usage = labels.map((cat, i) => {
    const b = budgets[i];
    const s = spent[i];
    if (!b) return 0;
    return (s / b) * 100;
  });

// Palette of 5 semi-transparent colors (cycles if more than 5 categories)
const fillPalette = [
  "rgba(96, 165, 250, 0.55)",   // blue
  "rgba(52, 211, 153, 0.55)",   // green
  "rgba(251, 191, 36, 0.55)",   // amber
  "rgba(248, 113, 113, 0.55)",  // red
  "rgba(192, 132, 252, 0.55)",  // purple
];

const strokePalette = [
  "rgba(37, 99, 235, 0.9)",   // blue border
  "rgba(5, 150, 105, 0.9)",  // green border
  "rgba(217, 119, 6, 0.9)",  // amber border
  "rgba(185, 28, 28, 0.9)",  // red border
  "rgba(124, 58, 237, 0.9)", // purple border
];

const bgColors = labels.map((_, i) => fillPalette[i % fillPalette.length]);
const borderColors = labels.map((_, i) => strokePalette[i % strokePalette.length]);

  if (spendingChartFull) spendingChartFull.destroy();
  spendingChartFull = new Chart(ctx, {
    type: "polarArea",
    data: {
      labels,
      datasets: [
        {
          label: "Budget Used (%)",
          data: usage,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const idx = ctx.dataIndex;
              const pct = Number(ctx.raw || 0);
              const s = spent[idx] || 0;
              const b = budgets[idx] || 0;

              if (!b) {
                return `${ctx.label}: No budget set (Spent ${currencyFmt.format(
                  s
                )})`;
              }

              let status = "";
              if (pct > 100) status = "Over budget";
              else if (pct < 100) status = "Under budget";
              else status = "On budget";

              return `${ctx.label}: ${pct.toFixed(
                1
              )}% (${status} — Spent ${currencyFmt.format(
                s
              )} / Budget ${currencyFmt.format(b)})`;
            },
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          suggestedMax: 150,
          ticks: {
            callback: (v) => v + "%",
          },
        },
      },
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  window.reportCharts = window.reportCharts || {};
  window.reportCharts.spendingPieFull = spendingChartFull;
}

// Income trend
function renderIncomeTrend(rows = []) {
  const ctx = document
    .getElementById("reportIncomeTrend")
    ?.getContext("2d");
  if (!ctx) return;
  const labels = (rows || []).map((r) => r.date || r.label || "");
  const values = (rows || []).map((r) => Number(r.total || r.value || 0));
  if (incomeTrendChart) incomeTrendChart.destroy();
  incomeTrendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Monthly Income",
          data: values,
          borderColor: "#2274A5",
          backgroundColor: "rgba(34,116,165,0.12)",
          tension: 0.25,
          borderWidth: 2,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: { callback: (v) => currencyFmt.format(v) },
          beginAtZero: true,
        },
      },
      responsive: true,
      maintainAspectRatio: false,
    },
  });
  window.reportCharts = window.reportCharts || {};
  window.reportCharts.incomeTrend = incomeTrendChart;
}

// Budget vs Actual (bar chart in dollars)
function renderBudgetVsActual(
  budgetsByCategory = [],
  expensesByCategory = []
) {
  const ctx = document
    .getElementById("reportBudgetVsActual")
    ?.getContext("2d");
  if (!ctx) return;

  // Collect all categories that appear in either budgets or expenses
  const cats = Array.from(
    new Set([
      ...(budgetsByCategory || []).map((b) => b.category),
      ...(expensesByCategory || []).map((e) => e.category),
    ])
  );

  // Build parallel arrays for budget and actual values
  const budgetVals = cats.map((cat) => {
    const b =
      (budgetsByCategory || []).find((b) => b.category === cat) || {};
    return Number(b.total || b.amount || 0);
  });

  const actualVals = cats.map((cat) => {
    const e =
      (expensesByCategory || []).find((e) => e.category === cat) || {};
    return Number(e.total || 0);
  });

  // Use a consistent red for Actual bars so contrast vs Budget is always clear
  const actualBgColors = cats.map(() => "#EF4444CC");   // red with some opacity
  const actualBorderColors = cats.map(() => "#B91C1C"); // darker red border

  if (budgetVsActualChart) budgetVsActualChart.destroy();
  budgetVsActualChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: cats,
      datasets: [
        {
          label: "Budget",
          data: budgetVals,
          backgroundColor: "#00A878CC",
          borderColor: "#00A878",
        },
        {
          label: "Actual",
          data: actualVals,
          backgroundColor: actualBgColors,
          borderColor: actualBorderColors,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const idx = ctx.dataIndex;
              const datasetLabel = ctx.dataset.label || "";
              const value = Number(ctx.raw || 0);

              // For Actual bars, show over/under budget info
              if (datasetLabel === "Actual") {
                const budget = budgetVals[idx] || 0;
                const diff = value - budget;

                if (diff > 0) {
                  return `${datasetLabel}: ${currencyFmt.format(
                    value
                  )} (Over by ${currencyFmt.format(diff)})`;
                } else if (diff < 0) {
                  return `${datasetLabel}: ${currencyFmt.format(
                    value
                  )} (Under by ${currencyFmt.format(Math.abs(diff))})`;
                }
                return `${datasetLabel}: ${currencyFmt.format(
                  value
                )} (On budget)`;
              }

              // Budget dataset simple label
              return `${datasetLabel}: ${currencyFmt.format(value)}`;
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v) => currencyFmt.format(v),
          },
          beginAtZero: true,
        },
      },
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  window.reportCharts = window.reportCharts || {};
  window.reportCharts.budgetVsActual = budgetVsActualChart;
}

// Expense doughnut – % of total expenses by category
function renderExpenseDoughnut(expCats = []) {
  const ctx = document
    .getElementById("reportExpenseDoughnut")
    ?.getContext("2d");
  if (!ctx) return;
  const labels = expCats.map((c) => c.category);
  const values = expCats.map((c) => Number(c.total || 0));
  const colors = labels.map(getCategoryColor);
  if (expenseDoughnutChart) expenseDoughnutChart.destroy();
  expenseDoughnutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, hoverOffset: 8 }],
    },
    options: {
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = values.reduce((a, b) => a + b, 0);
              const amount = ctx.raw;
              const pct = total
                ? ((amount / total) * 100).toFixed(1)
                : "0.0";
              return `${ctx.label}: ${currencyFmt.format(
                amount
              )} (${pct}%)`;
            },
          },
        },
      },
      responsive: true,
      maintainAspectRatio: false,
    },
  });
  window.reportCharts = window.reportCharts || {};
  window.reportCharts.expenseDoughnut = expenseDoughnutChart;
}

// Export to Excel (SheetJS)
async function exportReportToExcel(report = {}, budgetsArray = []) {
  const wb = XLSX.utils.book_new();

  // KPIs
  const totals = report.totals || {};
  const kpiRows = [
    ["Metric", "Value"],
    ["Total Income", totals.income || 0],
    ["Total Expenses", totals.expenses || 0],
    [
      "Net",
      totals.net !== undefined
        ? totals.net
        : (totals.income || 0) - (totals.expenses || 0),
    ],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(kpiRows),
    "KPIs"
  );

  // Monthly Income
  const monthly = (report.monthlyIncome || []).map((r) => ({
    Month: r.date || r.label,
    Amount: Number(r.total || r.value || 0),
  }));
  if (monthly.length)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(monthly),
      "MonthlyIncome"
    );

  // Expenses by category
  const expCats = (report.expensesByCategory || []).map((r) => ({
    Category: r.category,
    Amount: Number(r.total || 0),
  }));
  if (expCats.length)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(expCats),
      "ExpensesByCategory"
    );

  // Budgets
  const budRows = (
    report.budgets?.byCategory ||
    budgetsArray ||
    []
  ).map((b) => ({
    Category: b.category,
    Amount: Number(b.total || b.amount || 0),
  }));
  if (budRows.length)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(budRows),
      "Budgets"
    );

  // Optional transactions sheet
  try {
    const tx = await apiTryTransactions();
    if (tx && Array.isArray(tx)) {
      const txRows = tx.map((t) => ({
        Date: t.date || t.createdAt || "",
        Type: t.type || t.kind || "",
        Category: t.category || t.source || "",
        Amount: Number(t.amount || 0),
      }));
      if (txRows.length)
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(txRows),
          "Transactions"
        );
    }
  } catch (e) {
    /* ignore */
  }

  // raw report JSON
  try {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ raw: JSON.stringify(report) }]),
      "raw_report"
    );
  } catch (e) {}

  const filename = `Financial_Report_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// Master load
async function loadReport() {
  try {
    const [report, budgetsArray] = await Promise.all([
      apiGetReport(),
      apiListBudgets(),
    ]);
    const budgetsObj = {};
    budgetsArray.forEach((b) => {
      budgetsObj[b.category] = Number(b.amount || b.total || 0);
    });

    renderKPIs(report.totals || {}, budgetsArray || []);
    renderSpendingPie(report.expensesByCategory || [], budgetsObj); // left small – actual spending
    renderIncomeTrend(report.monthlyIncome || []);
    renderBudgetVsActual(
      report.budgets?.byCategory || budgetsArray || [],
      report.expensesByCategory || []
    ); // main bar – dollars
    renderExpenseDoughnut(report.expensesByCategory || []); // donut – % of total expenses
    renderSpendingPieFull(
      report.expensesByCategory || [],
      budgetsObj
    ); // bottom – budget usage % (horizontal)

    window.__lastReport = report;
    window.__lastBudgets = budgetsArray;
  } catch (err) {
    console.error("Failed to load report:", err);
    alert("Failed to load report data. See console.");
  }
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  loadReport();
  document
    .getElementById("refreshButton")
    ?.addEventListener("click", loadReport);
  document
    .getElementById("exportBtn")
    ?.addEventListener("click", () =>
      exportReportToExcel(
        window.__lastReport || {},
        window.__lastBudgets || []
      )
    );
  window.reportCharts = window.reportCharts || {};
});
