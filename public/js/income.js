// ======================= income.js =======================
'use strict';

// ---- token helpers ----
const getToken = () => localStorage.getItem('token') || localStorage.getItem('jwtToken') || '';
const auth = () => (getToken() ? { Authorization: 'Bearer ' + getToken() } : {});
const $ = (s) => document.querySelector(s);

let chart;
let incomeRowsCache = [];
let incomeRange = '6'; // default 6 months

// ---- Currency helpers ----
const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const unformatCurrency = (s) => {
  const n = Number(String(s || '').replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(n) ? n : 0;
};
function attachCurrencyFormatter(input) {
  if (!input) return;
  if (!input.value) input.value = currencyFmt.format(0);
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    const cents = digits ? parseInt(digits, 10) : 0;
    input.value = currencyFmt.format(cents / 100);
  });
  input.addEventListener('blur', () => {
    input.value = currencyFmt.format(unformatCurrency(input.value));
  });
}

// ---- Date helpers ----
const pad2 = (n) => String(n).padStart(2, '0');
function formatTableDate(s) {
  const d = new Date(s);
  if (isNaN(d)) return s;
  return `${pad2(d.getMonth()+1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}
function formatMonthLabel(yyyyMm) {
  const d = new Date(`${yyyyMm}-01T00:00:00`);
  if (isNaN(d)) return yyyyMm;
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const yy = String(d.getFullYear()).slice(-2);
  return `${mon} '${yy}`;
}

// ---- API calls ----
async function listIncome() {
  const r = await fetch('/api/income', { headers: { ...auth() } });
  if (r.status === 401) return logout();
  if (!r.ok) throw new Error('load failed');
  const { items } = await r.json();
  return items || [];
}
async function createIncome(body) {
  const r = await fetch('/api/income', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body),
  });
  if (r.status === 401) return logout();
  if (!r.ok) throw new Error('create failed');
}
async function updateIncome(id, body) {
  const r = await fetch('/api/income/' + id, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body),
  });
  if (r.status === 401) return logout();
  if (!r.ok) throw new Error('update failed');
}
async function deleteIncome(id) {
  const r = await fetch('/api/income/' + id, { method: 'DELETE', headers: { ...auth() } });
  if (r.status === 401) return logout();
  if (!r.ok) throw new Error('delete failed');
}

// ---- session ----
function logout() {
  localStorage.removeItem('token'); localStorage.removeItem('jwtToken'); window.location.href = '/';
}

// ---- chart helpers ----
function aggregateByMonth(rows) {
  const map = {};
  let maxDate = null;
  rows.forEach(r => {
    const d = new Date(r.date);
    if (isNaN(d)) return;
    const ym = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
    map[ym] = (map[ym] || 0) + Number(r.amount || 0);
    if (!maxDate || d > maxDate) maxDate = d;
  });
  let labels = Object.keys(map).sort();
  if (incomeRange !== 'ALL' && labels.length) {
    const n = parseInt(incomeRange, 10);
    const cutoff = new Date(maxDate);
    cutoff.setMonth(cutoff.getMonth() - (n - 1));
    labels = labels.filter(ym => new Date(`${ym}-01`) >= cutoff);
  }
  const data = labels.map(ym => map[ym]);
  return { labels, data };
}

function setCanvasWidthForLabels(wrapperId, canvasId, labelCount) {
  const wrap = document.getElementById(wrapperId);
  const canvas = document.getElementById(canvasId);
  if (!wrap || !canvas) return;
  const minPerLabel = 80; // px per label for readability
  const w = Math.max(labelCount * minPerLabel, wrap.clientWidth || 600);
  canvas.style.width = w + 'px';
}

function renderChart(rows) {
  const { labels, data } = aggregateByMonth(rows);
  const el = document.getElementById('incomeTrend');
  if (!el) return;

  // width for scroll when many labels
  setCanvasWidthForLabels('incomeTrendWrap', 'incomeTrend', labels.length);

  if (chart) chart.destroy();
  chart = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels.map(formatMonthLabel),
      datasets: [{ label: 'Income', data, fill: false, tension: 0.25 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${currencyFmt.format(ctx.parsed.y || 0)}`
          }
        }
      },
      scales: {
        x: { ticks: { autoSkip: false } },
        y: { ticks: { callback: (v) => currencyFmt.format(v) }, beginAtZero: true }
      }
    }
  });
}

// ---- table renderer ----
function renderTable(rows) {
  const wrap = $('#tableWrap');
  if (!wrap) return;

  if (!rows.length) { wrap.innerHTML = '<p>No income yet.</p>'; return; }

  const head = `
    <thead><tr>
      <th style="text-align:left">Date</th>
      <th style="text-align:left">Source</th>
      <th>Cadence</th>
      <th style="text-align:right">Amount</th>
      <th style="width:120px">Actions</th>
    </tr></thead>`;

  const body = rows.map(r => `
   <tr data-id="${r.id || r.income_id || r.incomeId}">
      <td>${formatTableDate(r.date)}</td>
      <td>${r.source}</td>
      <td style="text-transform:capitalize">${r.cadence || ''}</td>
      <td style="text-align:right">${currencyFmt.format(Number(r.amount) || 0)}</td>
      <td>
        <button class="editBtn">Edit</button>
        <button class="delBtn">Delete</button>
      </td>
    </tr>`).join('');

  wrap.innerHTML = `<div style="max-height:320px; overflow:auto; border:1px solid #e7ecf6; border-radius:12px;">
    <table class="data-table">${head}<tbody>${body}</tbody></table>
  </div>`;

  // Edit
  wrap.querySelectorAll('.editBtn').forEach(b => b.onclick = (e) => {
    const tr = e.target.closest('tr');
    const id = tr.dataset.id;
    const row = incomeRowsCache.find(x => String(x.id || x.income_id || x.incomeId) === id);
    if (!row) return;
    $('#incomeId').value = row.id || row.income_id || row.incomeId;
    $('#dateInput').value = row.date;
    const radios = document.querySelectorAll('input[name="source"]');
    let ok = false;
    radios.forEach(r => {
      if (r.value.toLowerCase() === String(row.source || '').toLowerCase()) {
        r.checked = true;
        ok = true;
      }
    });
    if (!ok) document.querySelector('input[name="source"][value="Other"]')?.setAttribute('checked', true);
    $('#amountInput').value = currencyFmt.format(Number(row.amount) || 0);
    $('#cadenceInput').value = row.cadence || 'monthly';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Delete (Improved with logging)
  wrap.querySelectorAll('.delBtn').forEach(b => b.onclick = async (e) => {
    const tr = e.target.closest('tr');
    const id = tr?.dataset.id;

    console.log('Income delete clicked. Row ID =', id);

    if (!id) {
      alert('Error: No ID found for this income row. Check data-id in renderTable().');
      return;
    }

    if (confirm('Delete this entry?')) {
      try {
        await deleteIncome(id);
        localStorage.setItem('refreshDashboard', 'true');
        await load();
      } catch (err) {
        console.error('❌ Income delete failed:', err);
        alert('Error deleting income. See console for details.');
      }
    }
  });
}

// ---- load ----
async function load() {
  const rows = await listIncome();
  incomeRowsCache = rows;
  renderTable(rows);
  renderChart(rows);
}

// ---- init ----
window.addEventListener('DOMContentLoaded', () => {
  $('#logoutButton')?.addEventListener('click', logout);
  $('#logoutLink')?.addEventListener('click', logout);
  $('#refreshButton')?.addEventListener('click', load);

  // Range chips
  const chipEls = document.querySelectorAll('[data-range-income]');
  chipEls.forEach(btn => {
    btn.addEventListener('click', () => {
      chipEls.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      incomeRange = btn.dataset.rangeIncome;
      renderChart(incomeRowsCache);
    });
  });
  // default select 6M
  document.querySelector('[data-range-income="6"]')?.classList.add('active');

  // Clear chart
  $('#clearTrendBtn')?.addEventListener('click', () => {
    if (chart) { chart.destroy(); chart = null; }
    const ctx = $('#incomeTrend')?.getContext('2d'); if (ctx?.canvas) ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  });

  // Table clear button stays as-is in HTML init code

  // Form submit
  $('#incomeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sourceEl = document.querySelector('input[name="source"]:checked');
    const body = {
      date: $('#dateInput')?.value || new Date().toISOString().slice(0,10),
      source: sourceEl ? sourceEl.value : 'Other',
      amount: Number.isFinite(unformatCurrency($('#amountInput')?.value)) ? unformatCurrency($('#amountInput')?.value) : 0,
      cadence: $('#cadenceInput')?.value || 'monthly'
    };
    const id = $('#incomeId')?.value;
    if (id) await updateIncome(id, body); else await createIncome(body);
    localStorage.setItem('refreshDashboard','true');
    await load();
    $('#incomeForm').reset(); $('#incomeId').value = ''; $('#amountInput').value = currencyFmt.format(0);
  });

  $('#resetBtn')?.addEventListener('click', () => {
    $('#incomeForm').reset(); $('#incomeId').value = ''; $('#amountInput').value = currencyFmt.format(0);
  });

  attachCurrencyFormatter($('#amountInput'));
  load();
});
// ===================== end income.js =======================
