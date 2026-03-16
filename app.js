(function () {
  'use strict';

  const STORAGE_KEY = 'expenseTrackerData';
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const COLORS = [
    '#3fb950', '#58a6ff', '#a371f7', '#f85149', '#d29922',
    '#79c0ff', '#bc8cff', '#ff7b72', '#e3b341', '#56d4dd'
  ];

  let chart = null;
  let yearChart = null;
  let saveTimeout = null;

  function parseNum(str) {
    if (str == null || String(str).trim() === '') return 0;
    const n = parseFloat(String(str).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function formatMoney(n) {
    return '$' + (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getStoredData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function setStoredData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
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

  function saveCurrentMonth() {
    const year = getCurrentYear();
    const month = getCurrentMonth();
    const income = getIncome();
    const expenses = getExpenseData();
    const data = getStoredData();
    if (!data[year]) data[year] = {};
    data[year][month] = {
      income: income,
      expenses: expenses.map(function (e) { return { name: e.label, amount: e.value }; })
    };
    setStoredData(data);
    refreshReviewYearOptions();
  }

  function loadMonth(month, year) {
    const data = getStoredData();
    const yearData = data[year] || {};
    const monthData = yearData[month] || { income: 0, expenses: [] };

    const incomeEl = document.getElementById('income');
    if (incomeEl) incomeEl.value = monthData.income > 0 ? String(monthData.income) : '';

    const container = document.getElementById('expense-rows');
    if (!container) return;
    container.innerHTML = '';
    const list = monthData.expenses && monthData.expenses.length ? monthData.expenses : [];
    list.forEach(function (item, idx) {
      const color = COLORS[idx % COLORS.length];
      const row = document.createElement('div');
      row.className = 'expense-row';
      row.innerHTML =
        '<span class="expense-dot" style="background-color:' + color + '" aria-hidden="true"></span>' +
        '<input type="text" class="expense-name" placeholder="Name" data-name value="' + escapeAttr(item.name || '') + '">' +
        '<div class="input-wrap small"><span class="currency">$</span><input type="text" class="expense-amount" inputmode="decimal" placeholder="0" data-amount value="' + escapeAttr(item.amount ? String(item.amount) : '') + '"></div>' +
        '<button type="button" class="btn-edit" aria-label="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
      container.appendChild(row);
      attachRowListeners(row);
    });
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

    const incomeEl = document.getElementById('summary-income');
    const expensesEl = document.getElementById('summary-expenses');
    const remainingEl = document.getElementById('summary-remaining');
    const summaryRemaining = document.querySelector('.summary-item.remaining');

    if (incomeEl) incomeEl.textContent = formatMoney(income);
    if (expensesEl) expensesEl.textContent = formatMoney(totalExpenses);
    if (remainingEl) remainingEl.textContent = formatMoney(remaining);
    if (summaryRemaining) summaryRemaining.classList.toggle('negative', remaining < 0);

    var topIncome = document.getElementById('top-summary-income');
    var topIncomeSub = document.getElementById('top-summary-income-sublabel');
    var topExpenses = document.getElementById('top-summary-expenses');
    var topExpensesSub = document.getElementById('top-summary-expenses-sublabel');
    var topRemaining = document.getElementById('top-summary-remaining');
    var topRemainingSub = document.getElementById('top-summary-remaining-sublabel');
    var topRemainingCard = document.querySelector('.summary-card--remaining');
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
        return '<span style="color:' + colors[i] + '">' + escapeHtml(d.label) + '</span> ' + pct + '%';
      }).join(' · ');
    }

    if (!chart) {
      chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderColor: '#1a2332',
            borderWidth: 2
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

  function refreshReviewYearOptions() {
    const data = getStoredData();
    const years = Object.keys(data).filter(function (y) {
      const months = data[y];
      return months && Object.keys(months).some(function (m) {
        const d = months[m];
        return d && (d.income > 0 || (d.expenses && d.expenses.length > 0));
      });
    }).sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });

    const sel = document.getElementById('review-year');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '— Select year —';
    sel.appendChild(option);
    years.forEach(function (y) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    });
    if (years.indexOf(current) !== -1) sel.value = current;
    else if (years.length > 0) sel.value = years[0];
    updateYearReview();
  }

  function getMonthSummary(year, month) {
    const data = getStoredData();
    const m = data[year] && data[year][month];
    if (!m) return { income: 0, expenses: 0, remaining: 0 };
    const income = m.income || 0;
    const expenses = (m.expenses || []).reduce(function (sum, e) { return sum + (e.amount || 0); }, 0);
    return { income: income, expenses: expenses, remaining: income - expenses };
  }

  function updateYearReview() {
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

    const monthLabels = [];
    const incomeByMonth = [];
    const expensesByMonth = [];
    let totalIncome = 0;
    let totalExpenses = 0;

    for (let m = 1; m <= 12; m++) {
      const key = String(m);
      const s = getMonthSummary(year, key);
      monthLabels.push(MONTH_NAMES[m - 1]);
      incomeByMonth.push(s.income);
      expensesByMonth.push(s.expenses);
      totalIncome += s.income;
      totalExpenses += s.expenses;
    }

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
      const key = String(m);
      const s = getMonthSummary(year, key);
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(MONTH_NAMES[m - 1]) + '</td>' +
        '<td class="num">' + formatMoney(s.income) + '</td>' +
        '<td class="num">' + formatMoney(s.expenses) + '</td>' +
        '<td class="num">' + formatMoney(s.remaining) + '</td>';
      tbody.appendChild(tr);
    }

    tfoot.innerHTML = '';
    const footTr = document.createElement('tr');
    footTr.innerHTML =
      '<td>Total</td>' +
      '<td class="num">' + formatMoney(totalIncome) + '</td>' +
      '<td class="num">' + formatMoney(totalExpenses) + '</td>' +
      '<td class="num">' + formatMoney(totalIncome - totalExpenses) + '</td>';
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
    }
  }

  function addExpenseRow() {
    const container = document.getElementById('expense-rows');
    const nameInput = document.getElementById('new-expense-name');
    const amountInput = document.getElementById('new-expense-amount');
    if (!container) return;
    const name = nameInput ? String(nameInput.value || '').trim() : '';
    const amount = amountInput ? String(amountInput.value || '').trim() : '';
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
        const rows = document.querySelectorAll('#expense-rows .expense-row');
        if (rows.length >= 1) {
          row.remove();
          refresh();
        }
      });
    }
  }

  function init() {
    const now = new Date();
    const monthEl = document.getElementById('month');
    const yearEl = document.getElementById('year');
    if (monthEl) monthEl.value = String(now.getMonth() + 1);
    if (yearEl) {
      const y = now.getFullYear();
      if (y >= 2025 && y <= 2030) yearEl.value = String(y);
    }

    loadMonth(getCurrentMonth(), getCurrentYear());

    monthEl && monthEl.addEventListener('change', function () {
      loadMonth(getCurrentMonth(), getCurrentYear());
      refresh();
    });
    yearEl && yearEl.addEventListener('change', function () {
      loadMonth(getCurrentMonth(), getCurrentYear());
      refresh();
    });

    const incomeEl = document.getElementById('income');
    if (incomeEl) {
      incomeEl.addEventListener('input', refresh);
      incomeEl.addEventListener('change', refresh);
    }

    const addBtn = document.getElementById('add-expense');
    if (addBtn) addBtn.addEventListener('click', addExpenseRow);

    var newName = document.getElementById('new-expense-name');
    var newAmount = document.getElementById('new-expense-amount');
    if (newAmount) newAmount.addEventListener('keydown', function (e) { if (e.key === 'Enter') addExpenseRow(); });

    const reviewYearEl = document.getElementById('review-year');
    if (reviewYearEl) reviewYearEl.addEventListener('change', updateYearReview);

    refreshReviewYearOptions();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
