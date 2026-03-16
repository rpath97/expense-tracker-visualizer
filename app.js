(function () {
  'use strict';

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const COLORS = [
    '#3fb950', '#58a6ff', '#a371f7', '#f85149', '#d29922',
    '#79c0ff', '#bc8cff', '#ff7b72', '#e3b341', '#56d4dd'
  ];

  let chart = null;
  let yearChart = null;
  let saveTimeout = null;
  let appInitialized = false;

  // --- Auth helpers ---

  function showAuthScreen() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app-screen');
    if (auth) auth.classList.remove('hidden');
    if (app) app.classList.add('hidden');
  }

  function showAppScreen() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app-screen');
    if (auth) auth.classList.add('hidden');
    if (app) app.classList.remove('hidden');
  }

  async function apiJson(path, options) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: options && options.body ? { 'Content-Type': 'application/json' } : {},
      ...(options || {}),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = data && data.error ? data.error : 'Request failed';
      throw new Error(msg);
    }
    return data;
  }

  // --- Finance API ---

  async function fetchMonthData(year, month) {
    return apiJson('/api/finance/month/' + year + '/' + month);
  }

  async function saveMonthData(year, month, payload) {
    return apiJson('/api/finance/month/' + year + '/' + month, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function fetchYearData(year) {
    return apiJson('/api/finance/months?year=' + year);
  }

  function parseNum(str) {
    if (str == null || String(str).trim() === '') return 0;
    const n = parseFloat(String(str).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function formatMoney(n) {
    return '$' + (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getCurrentMonth() {
    const el = document.getElementById('month');
    return el ? String(el.value) : String(new Date().getMonth() + 1);
  }

  function getCurrentYear() {
    const el = document.getElementById('year');
    return el ? String(parseInt(el.value, 10) || new Date().getFullYear()) : String(new Date().getFullYear());
  }

  function getExpenseData() {
    const rows = document.querySelectorAll('#expense-rows .expense-row');
    const data = [];
    rows.forEach(function (row) {
      const nameEl = row.querySelector('.expense-name');
      const amountEl = row.querySelector('.expense-amount');
      const name = (nameEl && nameEl.value.trim()) || 'Unnamed';
      const amount = parseNum(amountEl && amountEl.value);
      if (amount > 0) data.push({ label: name, value: amount });
    });
    return data;
  }

  function getIncome() {
    const el = document.getElementById('income');
    return el ? parseNum(el.value) : 0;
  }

  async function saveCurrentMonth() {
    const year = getCurrentYear();
    const month = getCurrentMonth();
    const income = getIncome();
    const expenses = getExpenseData();
    const payload = {
      income: income,
      expenses: expenses.map(function (e) { return { name: e.label, amount: e.value }; }),
    };
    try {
      await saveMonthData(year, month, payload);
      await refreshReviewYearOptions();
    } catch (err) {
      console.error('saveCurrentMonth failed', err);
    }
  }

  async function loadMonth(month, year) {
    try {
      const data = await fetchMonthData(year, month);
      const incomeEl = document.getElementById('income');
      if (incomeEl) incomeEl.value = (data.income > 0) ? String(data.income) : '';

      const container = document.getElementById('expense-rows');
      if (!container) return;
      container.innerHTML = '';

      const list = Array.isArray(data.expenses) ? data.expenses : [];
      list.forEach(function (item, idx) {
        const color = COLORS[idx % COLORS.length];
        const row = document.createElement('div');
        row.className = 'expense-row';
        row.innerHTML =
          '<span class="expense-dot" style="background-color:' + color + '" aria-hidden="true"></span>' +
          '<input type="text" class="expense-name" placeholder="Name" data-name value="' + escapeAttr(item.name || '') + '">' +
          '<div class="input-wrap small"><span class="currency">$</span><input type="text" class="expense-amount" inputmode="decimal" placeholder="0" data-amount value="' + escapeAttr(item.amount != null ? String(item.amount) : '') + '"></div>' +
          '<button type="button" class="btn-edit" aria-label="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
        container.appendChild(row);
        attachRowListeners(row);
      });
    } catch (err) {
      console.error('loadMonth failed', err);
    }
  }

  function escapeAttr(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  function updateSummary() {
    const income = getIncome();
    const expenses = getExpenseData();
    const totalExpenses = expenses.reduce(function (sum, e) { return sum + e.value; }, 0);
    const remaining = income - totalExpenses;

    const topIncome = document.getElementById('top-summary-income');
    const topIncomeSub = document.getElementById('top-summary-income-sublabel');
    const topExpenses = document.getElementById('top-summary-expenses');
    const topExpensesSub = document.getElementById('top-summary-expenses-sublabel');
    const topRemaining = document.getElementById('top-summary-remaining');
    const topRemainingSub = document.getElementById('top-summary-remaining-sublabel');
    const topRemainingCard = document.querySelector('.summary-card--remaining');

    if (topIncome) topIncome.textContent = formatMoney(income);
    if (topIncomeSub) topIncomeSub.textContent = formatMoney(income);
    if (topExpenses) topExpenses.textContent = formatMoney(totalExpenses);
    if (topExpensesSub) topExpensesSub.textContent = formatMoney(totalExpenses);
    if (topRemaining) topRemaining.textContent = formatMoney(remaining);
    if (topRemainingSub) topRemainingSub.textContent = formatMoney(remaining);
    if (topRemainingCard) topRemainingCard.classList.toggle('negative', remaining < 0);
  }

  function updateChart() {
    const data = getExpenseData();
    const ctx = document.getElementById('pie-chart');
    const legendEl = document.getElementById('chart-legend');

    if (!ctx) return;

    if (data.length === 0) {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      if (legendEl) legendEl.textContent = 'Add income and expenses to see the breakdown.';
      return;
    }

    const labels = data.map(function (d) { return d.label; });
    const values = data.map(function (d) { return d.value; });
    const colors = data.map(function (_, i) { return COLORS[i % COLORS.length]; });

    if (legendEl) {
      const total = values.reduce(function (a, b) { return a + b; }, 0);
      legendEl.innerHTML = data.map(function (d, i) {
        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
        return '<span class="chart-legend-item"><span class="chart-legend-swatch" style="background-color:' + colors[i] + '"></span><span class="chart-legend-label">' + escapeHtml(d.label) + '</span> <span class="chart-legend-pct">(' + pct + '%)</span></span>';
      }).join('');
    }

    if (!chart) {
      chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (item) {
                  const total = item.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                  const pct = total > 0 ? ((item.raw / total) * 100).toFixed(1) : '0';
                  return item.label + ': ' + formatMoney(item.raw) + ' (' + pct + '%)';
                }
              }
            }
          }
        }
      });
    } else {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.data.datasets[0].backgroundColor = colors;
      chart.update('none');
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function refresh() {
    updateSummary();
    updateChart();
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(function () {
      saveTimeout = null;
      saveCurrentMonth();
    }, 400);
  }

  async function refreshReviewYearOptions() {
    const sel = document.getElementById('review-year');
    if (!sel) return;
    const years = ['2025', '2026', '2027', '2028', '2029', '2030'];
    const current = getCurrentYear();
    sel.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '— Select year —';
    sel.appendChild(empty);
    years.forEach(function (y) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    });
    if (years.indexOf(current) !== -1) sel.value = current;
    else sel.value = years[0] || '2025';
    await updateYearReview();
  }

  async function updateYearReview() {
    const year = document.getElementById('review-year') && document.getElementById('review-year').value;
    const placeholder = document.getElementById('year-summary-placeholder');
    const table = document.getElementById('year-table');
    const tbody = document.getElementById('year-table-body');
    const tfoot = document.getElementById('year-table-foot');
    const yearCtx = document.getElementById('year-chart');

    if (!year || !tbody) {
      if (placeholder) placeholder.hidden = false;
      if (table) table.hidden = true;
      if (yearChart) { yearChart.destroy(); yearChart = null; }
      return;
    }

    let data;
    try {
      data = await fetchYearData(year);
    } catch (err) {
      console.error('updateYearReview failed', err);
      if (placeholder) {
        placeholder.textContent = 'No saved data for ' + year + '.';
        placeholder.hidden = false;
      }
      if (table) table.hidden = true;
      if (yearChart) { yearChart.destroy(); yearChart = null; }
      return;
    }

    const months = data.months || [];
    const monthLabels = months.length === 12 ? months.map(function (_, i) { return MONTH_NAMES[i]; }) : MONTH_NAMES.slice();
    const incomeByMonth = months.length === 12 ? months.map(function (m) { return m.income || 0; }) : [];
    const expensesByMonth = months.length === 12 ? months.map(function (m) { return m.expenses || 0; }) : [];
    let totalIncome = 0;
    let totalExpenses = 0;
    months.forEach(function (m) {
      totalIncome += m.income || 0;
      totalExpenses += m.expenses || 0;
    });

    const hasAny = totalIncome > 0 || totalExpenses > 0;
    if (!hasAny) {
      if (placeholder) {
        placeholder.textContent = 'No saved data for ' + year + '.';
        placeholder.hidden = false;
      }
      if (table) table.hidden = true;
      if (yearChart) { yearChart.destroy(); yearChart = null; }
      return;
    }

    if (placeholder) placeholder.hidden = true;
    if (table) table.hidden = false;

    tbody.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const s = months[m - 1] || { income: 0, expenses: 0, remaining: 0 };
      const hasData = (s.income > 0 || s.expenses > 0);
      const tr = document.createElement('tr');
      if (hasData) tr.className = 'year-table-row--has-data';
      tr.innerHTML =
        '<td>' + escapeHtml(MONTH_NAMES[m - 1]) + '</td>' +
        '<td class="num">' + formatMoney(s.income || 0) + '</td>' +
        '<td class="num">' + formatMoney(s.expenses || 0) + '</td>' +
        '<td class="num">' + formatMoney((s.income || 0) - (s.expenses || 0)) + '</td>' +
        '<td class="year-table-edit-cell"><button type="button" class="year-edit-btn" data-year="' + year + '" data-month="' + m + '" aria-label="Edit ' + escapeAttr(MONTH_NAMES[m - 1]) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>';
      tbody.appendChild(tr);
    }

    tfoot.innerHTML = '';
    const footTr = document.createElement('tr');
    footTr.innerHTML =
      '<td>Total</td>' +
      '<td class="num">' + formatMoney(totalIncome) + '</td>' +
      '<td class="num">' + formatMoney(totalExpenses) + '</td>' +
      '<td class="num">' + formatMoney(totalIncome - totalExpenses) + '</td>' +
      '<td></td>';
    tfoot.appendChild(footTr);

    if (yearChart) yearChart.destroy();
    if (yearCtx && typeof Chart !== 'undefined') {
      yearChart = new Chart(yearCtx, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [
            {
              label: 'Income',
              data: incomeByMonth,
              backgroundColor: 'rgba(63, 185, 80, 0.7)',
              borderColor: '#3fb950',
              borderWidth: 1
            },
            {
              label: 'Expenses',
              data: expensesByMonth,
              backgroundColor: 'rgba(248, 81, 73, 0.7)',
              borderColor: '#f85149',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: function (v) { return '$' + v; } }
            }
          },
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: function (item) { return item.dataset.label + ': ' + formatMoney(item.raw); }
              }
            }
          }
        }
      });
      attachYearEditListeners(year);
    }
  }

  function attachYearEditListeners(activeYear) {
    const buttons = document.querySelectorAll('.year-edit-btn');
    const monthEl = document.getElementById('month');
    const yearEl = document.getElementById('year');
    const reviewYearEl = document.getElementById('review-year');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = String(btn.getAttribute('data-month') || '');
        const y = String(btn.getAttribute('data-year') || activeYear || '');
        if (yearEl) yearEl.value = y;
        if (monthEl) monthEl.value = m;
        if (reviewYearEl) reviewYearEl.value = y;
        loadMonth(m, y).then(refresh);
        const incomeEl = document.getElementById('income');
        if (incomeEl) incomeEl.focus();
      });
    });
  }

  function addExpenseRow() {
    const container = document.getElementById('expense-rows');
    const nameInput = document.getElementById('new-expense-name');
    const amountInput = document.getElementById('new-expense-amount');
    if (!container) return;
    const name = nameInput ? String(nameInput.value || '').trim() : '';
    const amountRaw = amountInput ? String(amountInput.value || '').trim() : '';
    const amountNumber = parseNum(amountRaw);
    if (!name || amountNumber <= 0) {
      if (!name && nameInput) nameInput.focus();
      else if (amountInput) amountInput.focus();
      return;
    }
    const amount = String(amountNumber);
    const color = COLORS[container.children.length % COLORS.length];
    const row = document.createElement('div');
    row.className = 'expense-row';
    row.innerHTML =
      '<span class="expense-dot" style="background-color:' + color + '" aria-hidden="true"></span>' +
      '<input type="text" class="expense-name" placeholder="Name" data-name value="' + escapeAttr(name) + '">' +
      '<div class="input-wrap small"><span class="currency">$</span><input type="text" class="expense-amount" inputmode="decimal" placeholder="0" data-amount value="' + escapeAttr(amount) + '"></div>' +
      '<button type="button" class="btn-edit" aria-label="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
    container.appendChild(row);
    attachRowListeners(row);
    if (nameInput) nameInput.value = '';
    if (amountInput) amountInput.value = '';
    if (nameInput) nameInput.focus();
    refresh();
  }

  function attachRowListeners(row) {
    if (!row) return;
    row.querySelectorAll('input').forEach(function (input) {
      input.addEventListener('input', refresh);
      input.addEventListener('change', refresh);
    });
    const btn = row.querySelector('.btn-edit') || row.querySelector('.btn-remove');
    if (btn) {
      btn.addEventListener('click', function () {
        const nameInput = document.getElementById('new-expense-name');
        const amountInput = document.getElementById('new-expense-amount');
        const name = row.querySelector('.expense-name');
        const amount = row.querySelector('.expense-amount');
        if (nameInput && name) nameInput.value = name.value || '';
        if (amountInput && amount) amountInput.value = amount.value || '';
        row.remove();
        refresh();
      });
    }
  }

  async function init() {
    const now = new Date();
    const monthEl = document.getElementById('month');
    const yearEl = document.getElementById('year');
    if (monthEl) monthEl.value = String(now.getMonth() + 1);
    if (yearEl) {
      const y = now.getFullYear();
      if (y >= 2025 && y <= 2030) yearEl.value = String(y);
    }

    await loadMonth(getCurrentMonth(), getCurrentYear());

    monthEl && monthEl.addEventListener('change', function () {
      loadMonth(getCurrentMonth(), getCurrentYear()).then(refresh);
    });
    yearEl && yearEl.addEventListener('change', function () {
      loadMonth(getCurrentMonth(), getCurrentYear()).then(refresh);
    });

    const incomeEl = document.getElementById('income');
    if (incomeEl) {
      incomeEl.addEventListener('input', refresh);
      incomeEl.addEventListener('change', refresh);
    }

    const addBtn = document.getElementById('add-expense');
    if (addBtn) addBtn.addEventListener('click', addExpenseRow);

    var newAmount = document.getElementById('new-expense-amount');
    if (newAmount) newAmount.addEventListener('keydown', function (e) { if (e.key === 'Enter') addExpenseRow(); });

    const reviewYearEl = document.getElementById('review-year');
    if (reviewYearEl) reviewYearEl.addEventListener('change', function () { updateYearReview(); });

    function updateStatusBarTime() {
      var d = new Date();
      var timeEl = document.getElementById('status-time');
      var dateEl = document.getElementById('status-date');
      if (timeEl) timeEl.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      if (dateEl) dateEl.textContent = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
    }
    updateStatusBarTime();
    setInterval(updateStatusBarTime, 60000);

    await refreshReviewYearOptions();
    refresh();
  }

  async function bootstrap() {
    const loginForm = document.getElementById('auth-login-form');
    const signupForm = document.getElementById('auth-signup-form');
    const tabs = document.querySelectorAll('.auth-tab');
    const errorEl = document.getElementById('auth-error');

    function setTab(which) {
      tabs.forEach(function (tab) {
        const isActive = tab.getAttribute('data-auth-tab') === which;
        tab.classList.toggle('auth-tab--active', isActive);
      });
      if (loginForm && signupForm) {
        if (which === 'login') {
          loginForm.classList.remove('auth-form--hidden');
          signupForm.classList.add('auth-form--hidden');
        } else {
          signupForm.classList.remove('auth-form--hidden');
          loginForm.classList.add('auth-form--hidden');
        }
      }
      if (errorEl) errorEl.textContent = '';
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        setTab(tab.getAttribute('data-auth-tab'));
      });
    });

    if (loginForm) {
      loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (errorEl) errorEl.textContent = '';
        const email = document.getElementById('auth-login-email').value.trim();
        const password = document.getElementById('auth-login-password').value;
        try {
          await apiJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          showAppScreen();
          if (!appInitialized) {
            appInitialized = true;
            await init();
          }
        } catch (err) {
          if (errorEl) errorEl.textContent = err.message || 'Login failed';
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (errorEl) errorEl.textContent = '';
        const email = document.getElementById('auth-signup-email').value.trim();
        const password = document.getElementById('auth-signup-password').value;
        try {
          await apiJson('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          showAppScreen();
          if (!appInitialized) {
            appInitialized = true;
            await init();
          }
        } catch (err) {
          if (errorEl) errorEl.textContent = err.message || 'Signup failed';
        }
      });
    }

    try {
      await apiJson('/api/auth/me');
      showAppScreen();
      if (!appInitialized) {
        appInitialized = true;
        await init();
      }
    } catch {
      showAuthScreen();
      setTab('login');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
