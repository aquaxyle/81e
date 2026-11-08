
/* ==========================================
   PROJECT 81E — HOME ANALYTICS
   Dashboard Controller / Version 1.0
   ========================================== */

"use strict";

/* 01. CONFIGURATION */

const CONFIG = {
  demoMode: true,
  realDataPath: "data/bills.json",
  currency: "PKR",
  months: [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ],
  colors: {
    Electricity: "#607caf",
    Gas: "#c18b66",
    Water: "#70a7aa",
    grid: "#edf0f3",
    text: "#87919e"
  }
};

const state = {
  bills: [],
  year: "all",
  month: "all",
  utility: "all",
  search: "",
  currentPage: "overview",
  charts: {}
};

/* 02. FORMATTING UTILITIES */

const money = value => {
  if (value === null || !Number.isFinite(Number(value))) {
    return "Rs. —";
  }

  return "Rs. " + Math.round(Number(value))
    .toLocaleString("en-PK");
};

const number = value => {
  if (value === null || value === undefined ||
      !Number.isFinite(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString("en-PK", {
    maximumFractionDigits: 2
  });
};

const sum = (records, key) =>
  records.reduce((total, record) =>
    total + (Number(record[key]) || 0), 0);

const average = values =>
  values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;

const byPeriod = (a, b) =>
  a.period.localeCompare(b.period);

const shortMonth = period => {
  const [year, month] = period.split("-");
  return CONFIG.months[Number(month) - 1].slice(0, 3)
    + " " + year.slice(2);
};

const getPeriod = record =>
  `${record.year}-${String(record.month_number).padStart(2, "0")}`;

function changePercent(current, previous) {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function changeLabel(value) {
  if (value === null) return "No comparison available";
  if (Math.abs(value) < 0.05) return "No change";

  const direction = value > 0 ? "increase" : "decrease";
  return `${Math.abs(value).toFixed(1)}% ${direction}`;
}

/* 03. DEMO DATA GENERATOR */

function generateDemoData() {
  const records = [];

  // Deterministic values: refreshes won't change them.
  for (const year of [2025, 2026]) {
    for (let month = 1; month <= 12; month++) {
      const seasonal = Math.sin((month - 3) * Math.PI / 6);
      const growth = year === 2026 ? 1.13 : 1;

      const electricityUnits = Math.round(
        (310 + seasonal * 135 + month * 4) * growth
      );

      const electricityBase = Math.round(
        electricityUnits * (37 + (year - 2025) * 5)
      );

      const electricitySociety = 1250 + month * 25;

      records.push({
        id: `ELEC-${year}-${String(month).padStart(2, "0")}`,
        utility: "Electricity",
        year,
        month: CONFIG.months[month - 1],
        month_number: month,
        period: `${year}-${String(month).padStart(2, "0")}`,
        units: electricityUnits,
        base_bill: electricityBase,
        society_charges: electricitySociety,
        late_surcharge: 0,
        total_bill: electricityBase + electricitySociety
      });

      const gasUnits = Math.round(
        30 + 20 * Math.cos((month - 1) * Math.PI / 6)
      );

      const gasBase = Math.round(
        (gasUnits * 34 + 1500) * growth
      );

      records.push({
        id: `GAS-${year}-${String(month).padStart(2, "0")}`,
        utility: "Gas",
        year,
        month: CONFIG.months[month - 1],
        month_number: month,
        period: `${year}-${String(month).padStart(2, "0")}`,
        units: gasUnits,
        base_bill: gasBase,
        society_charges: 0,
        late_surcharge: 0,
        total_bill: gasBase
      });

      const waterUnits = Math.round(
        17500 + 2500 * Math.sin(month * Math.PI / 6)
      );

      const waterBase = Math.round(
        (2100 + waterUnits * 0.035) * growth
      );

      records.push({
        id: `WATER-${year}-${String(month).padStart(2, "0")}`,
        utility: "Water",
        year,
        month: CONFIG.months[month - 1],
        month_number: month,
        period: `${year}-${String(month).padStart(2, "0")}`,
        units: waterUnits,
        base_bill: waterBase,
        society_charges: 0,
        late_surcharge: 0,
        total_bill: waterBase
      });
    }
  }

  return records;
}

/* 04. LOAD AND NORMALIZE DATA */

function normalizeBills(records) {
  return records
    .filter(record =>
      record &&
      ["Electricity", "Gas", "Water"].includes(record.utility)
    )
    .map(record => {
      const monthNumber = Number(record.month_number) ||
        CONFIG.months.findIndex(
          m => m.toLowerCase() ===
            String(record.month).toLowerCase()
        ) + 1;

      const year = Number(record.year);

      return {
        id: String(record.id || ""),
        utility: record.utility,
        year,
        month: CONFIG.months[monthNumber - 1],
        month_number: monthNumber,
        period: `${year}-${String(monthNumber).padStart(2, "0")}`,
        units: record.units === null ||
               record.units === undefined ||
               record.units === ""
          ? null : Number(record.units),
        base_bill: Number(record.base_bill) || 0,
        society_charges: Number(record.society_charges) || 0,
        late_surcharge: Number(record.late_surcharge) || 0,
        total_bill: Number(record.total_bill) || 0
      };
    })
    .filter(record =>
      Number.isInteger(record.year) &&
      record.month_number >= 1 &&
      record.month_number <= 12 &&
      Number.isFinite(record.total_bill)
    )
    .sort(byPeriod);
}

async function loadData() {
  if (CONFIG.demoMode) {
    return normalizeBills(generateDemoData());
  }

  const response = await fetch(CONFIG.realDataPath, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Could not load bills: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data.bills)) {
    throw new Error("Invalid bills.json structure");
  }

  return normalizeBills(data.bills);
}

/* 05. FILTERING */

function filteredBills() {
  return state.bills.filter(bill => {
    const matchesYear =
      state.year === "all" ||
      String(bill.year) === state.year;

    const matchesMonth =
      state.month === "all" ||
      String(bill.month_number) === state.month;

    return matchesYear && matchesMonth;
  });
}

function historyBills() {
  const query = state.search.toLowerCase().trim();

  return filteredBills().filter(bill => {
    const utilityMatch =
      state.utility === "all" ||
      bill.utility === state.utility;

    const searchable = [
      bill.id, bill.utility, bill.year,
      bill.month, bill.period
    ].join(" ").toLowerCase();

    return utilityMatch && searchable.includes(query);
  });
}

function fillFilters() {
  const yearSelect = document.getElementById("yearFilter");
  const monthSelect = document.getElementById("monthFilter");

  const years = [...new Set(state.bills.map(b => b.year))]
    .sort((a, b) => b - a);

  yearSelect.innerHTML =
    '<option value="all">All years</option>';

  years.forEach(year => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.appendChild(option);
  });

  monthSelect.innerHTML =
    '<option value="all">All months</option>';

  CONFIG.months.forEach((month, index) => {
    const option = document.createElement("option");
    option.value = String(index + 1);
    option.textContent = month;
    monthSelect.appendChild(option);
  });
}

/* 06. CHART CONFIGURATION */

function chartDefaults() {
  if (typeof Chart === "undefined") return;

  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = CONFIG.colors.text;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
}

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }
}

function createChart(id, type, labels, datasets, options = {}) {
  destroyChart(id);

  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === "undefined") return;

  const circular = type === "doughnut" || type === "pie";

  state.charts[id] = new Chart(canvas, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: datasets.length > 1 || circular,
          position: "bottom",
          labels: {
            padding: 18
          }
        },
        tooltip: {
          backgroundColor: "#202631",
          padding: 12,
          cornerRadius: 7,
          callbacks: {
            label(context) {
              const value = context.parsed.y ??
                context.parsed;

              const suffix = options.unit || "PKR";

              return ` ${context.dataset.label}: ${
                suffix === "PKR" ? money(value) :
                number(value) + " " + suffix
              }`;
            }
          }
        }
      },
      scales: circular ? {} : {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 9
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: CONFIG.colors.grid
          },
          border: { display: false },
          ticks: {
            callback: value =>
              Number(value).toLocaleString("en-PK", {
                notation: "compact",
                maximumFractionDigits: 1
              })
          }
        }
      },
      ...options.chartOptions
    }
  });
}

function lineDataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 2,
    pointHoverRadius: 5,
    tension: 0.3,
    fill: false
  };
}

function barDataset(label, data, color) {
  return {
    label,
    data,
    backgroundColor: color,
    borderRadius: 4,
    maxBarThickness: 35
  };
}

/* 07. MONTHLY AGGREGATION */

function monthlyData(records) {
  const periods = [...new Set(records.map(b => b.period))]
    .sort();

  return periods.map(period => {
    const bills = records.filter(b => b.period === period);

    return {
      period,
      label: shortMonth(period),
      Electricity: sum(
        bills.filter(b => b.utility === "Electricity"),
        "total_bill"
      ),
      Gas: sum(
        bills.filter(b => b.utility === "Gas"),
        "total_bill"
      ),
      Water: sum(
        bills.filter(b => b.utility === "Water"),
        "total_bill"
      ),
      total: sum(bills, "total_bill")
    };
  });
}

function utilityMonthly(records, utility) {
  return records
    .filter(b => b.utility === utility)
    .sort(byPeriod);
}

/* 08. OVERVIEW KPI CARDS */

function updateOverviewKPIs(records) {
  const electricity = records.filter(
    b => b.utility === "Electricity"
  );
  const gas = records.filter(b => b.utility === "Gas");
  const water = records.filter(b => b.utility === "Water");

  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const total = sum(records, "total_bill");

  set("kpiTotal", records.length ? money(total) : "Rs. —");
  set("kpiElectricity",
    electricity.length ? money(sum(electricity, "total_bill")) : "Rs. —");
  set("kpiGas",
    gas.length ? money(sum(gas, "total_bill")) : "Rs. —");
  set("kpiWater",
    water.length ? money(sum(water, "total_bill")) : "Rs. —");

  set("kpiElectricityMeta",
    `${electricity.length} recorded bills`);
  set("kpiGasMeta", `${gas.length} recorded bills`);
  set("kpiWaterMeta", `${water.length} recorded bills`);

  const monthly = monthlyData(records);

  if (monthly.length < 2) {
    set("kpiTotalChange", "No comparison available");
    return;
  }

  const last = monthly[monthly.length - 1];
  const previous = monthly[monthly.length - 2];

  // Compare only consecutive calendar months.
  const [lastYear, lastMonth] = last.period.split("-").map(Number);
  const [prevYear, prevMonth] =
    previous.period.split("-").map(Number);

  const consecutive =
    lastYear * 12 + lastMonth -
    (prevYear * 12 + prevMonth) === 1;

  const comparison = consecutive
    ? changePercent(last.total, previous.total)
    : null;

  set("kpiTotalChange",
    comparison === null
      ? "No consecutive-month comparison"
      : changeLabel(comparison) + " vs previous month"
  );
}

/* 09. OVERVIEW CHARTS */

function renderOverviewCharts(records) {
  const monthly = monthlyData(records);
  const labels = monthly.map(m => m.label);

  createChart(
    "spendingChart",
    "line",
    labels,
    [
      lineDataset(
        "Electricity",
        monthly.map(m => m.Electricity),
        CONFIG.colors.Electricity
      ),
      lineDataset(
        "Gas",
        monthly.map(m => m.Gas),
        CONFIG.colors.Gas
      ),
      lineDataset(
        "Water",
        monthly.map(m => m.Water),
        CONFIG.colors.Water
      )
    ]
  );

  const totals = ["Electricity", "Gas", "Water"].map(
    utility => sum(
      records.filter(b => b.utility === utility),
      "total_bill"
    )
  );

  createChart(
    "distributionChart",
    "doughnut",
    ["Electricity", "Gas", "Water"],
    [{
      label: "Expenditure",
      data: totals,
      backgroundColor: [
        CONFIG.colors.Electricity,
        CONFIG.colors.Gas,
        CONFIG.colors.Water
      ],
      borderWidth: 3,
      borderColor: "#ffffff",
      hoverOffset: 5
    }],
    {
      chartOptions: {
        cutout: "72%"
      }
    }
  );

  const electricity = utilityMonthly(records, "Electricity");

  createChart(
    "electricityUnitsChart",
    "bar",
    electricity.map(b => shortMonth(b.period)),
    [
      barDataset(
        "Consumption",
        electricity.map(b => b.units),
        CONFIG.colors.Electricity
      )
    ],
    { unit: "kWh" }
  );

  const years = [...new Set(records.map(b => b.year))]
    .sort((a, b) => a - b);

  createChart(
    "yearlyChart",
    "bar",
    years.map(String),
    ["Electricity", "Gas", "Water"].map(utility =>
      barDataset(
        utility,
        years.map(year => sum(
          records.filter(b =>
            b.year === year && b.utility === utility
          ),
          "total_bill"
        )),
        CONFIG.colors[utility]
      )
    )
  );
}

/* 10. UTILITY PAGE STATISTICS */

function statCard(label, value, meta = "") {
  const card = document.createElement("article");
  card.className = "kpi-card";

  const top = document.createElement("div");
  top.className = "kpi-top";
  top.textContent = label;

  const amount = document.createElement("div");
  amount.className = "kpi-value";
  amount.textContent = value;

  const detail = document.createElement("div");
  detail.className = "kpi-meta";
  detail.textContent = meta;

  card.append(top, amount, detail);
  return card;
}

function renderUtilityStats(utility, records) {
  const container = document.getElementById(
    utility.toLowerCase() + "Stats"
  );

  if (!container) return;
  container.replaceChildren();

  const bills = utilityMonthly(records, utility);

  if (!bills.length) {
    container.appendChild(
      statCard("No data", "—", "No recorded bills")
    );
    return;
  }

  const total = sum(bills, "total_bill");
  const knownUnits = bills.filter(
    b => b.units !== null && Number.isFinite(b.units)
  );

  const unitName =
    utility === "Electricity" ? "kWh" :
    utility === "Water" ? "gallons" : "units";

  const totalUnits = knownUnits.length
    ? sum(knownUnits, "units") : null;

  const avgBill = total / bills.length;
  const rate = totalUnits > 0 ? total / totalUnits : null;

  container.append(
    statCard("Total expenditure", money(total),
      `${bills.length} bills`),
    statCard("Average bill", money(avgBill),
      "Per recorded bill"),
    statCard("Total consumption",
      totalUnits === null ? "—" : number(totalUnits),
      unitName),
    statCard("Effective cost per unit",
      rate === null ? "—" : money(rate.toFixed(2)),
      `PKR per ${unitName} (all billed charges)`)
  );
}

/* 11. UTILITY CHARTS */

function renderUtilityCharts(utility, records) {
  const bills = utilityMonthly(records, utility);
  const prefix = utility.toLowerCase();
  const labels = bills.map(b => shortMonth(b.period));
  const color = CONFIG.colors[utility];

  createChart(
    prefix + "CostChart",
    "line",
    labels,
    [
      lineDataset(
        "Total bill",
        bills.map(b => b.total_bill),
        color
      )
    ]
  );

  if (utility === "Electricity") {
    createChart(
      "electricityRateChart",
      "line",
      labels,
      [
        lineDataset(
          "PKR per kWh",
          bills.map(b =>
            b.units > 0 ? b.total_bill / b.units : null
          ),
          color
        )
      ]
    );
  } else {
    createChart(
      prefix + "UnitsChart",
      "bar",
      labels,
      [
        barDataset(
          "Consumption",
          bills.map(b => b.units),
          color
        )
      ],
      {
        unit: utility === "Water" ? "gallons" : "units"
      }
    );
  }
}

/* 12. TABLE RENDERING */

function addCell(row, value) {
  const td = document.createElement("td");
  td.textContent = String(value);
  row.appendChild(td);
}

function renderTable(id, records, type) {
  const body = document.getElementById(id);
  if (!body) return;

  body.replaceChildren();

  if (!records.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan =
      type === "history" ? 6 : 5;
    cell.className = "empty-table";
    cell.textContent = "No bills found.";

    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  const sorted = [...records].sort(
    (a, b) => b.period.localeCompare(a.period)
  );

  sorted.forEach(bill => {
    const row = document.createElement("tr");

    if (type === "recent") {
      addCell(row, bill.id);
      addCell(row, bill.utility);
      addCell(row, `${bill.month} ${bill.year}`);
      addCell(row, number(bill.units));
      addCell(row, money(bill.total_bill));

    } else if (type === "history") {
      addCell(row, bill.id);
      addCell(row, bill.utility);
      addCell(row, bill.year);
      addCell(row, bill.month);
      addCell(row, number(bill.units));
      addCell(row, money(bill.total_bill));

    } else {
      addCell(row, `${bill.month} ${bill.year}`);
      addCell(row, number(bill.units));
      addCell(row, money(bill.base_bill));

      if (type === "electricity") {
        addCell(row, money(bill.society_charges));
      } else if (type === "water") {
        addCell(row, money(bill.late_surcharge));
      } else {
        // Detailed gas adjustments require itemized JSON.
        addCell(row, "—");
      }

      addCell(row, money(bill.total_bill));
    }

    body.appendChild(row);
  });
}

/* 13. RENDER ALL DASHBOARD CONTENT */

function renderDashboard() {
  const records = filteredBills();

  updateOverviewKPIs(records);
  renderOverviewCharts(records);

  renderTable(
    "recentBillsBody",
    [...records]
      .sort((a, b) => b.period.localeCompare(a.period))
      .slice(0, 8),
    "recent"
  );

  ["Electricity", "Gas", "Water"].forEach(utility => {
    renderUtilityStats(utility, records);
    renderUtilityCharts(utility, records);

    renderTable(
      utility.toLowerCase() + "TableBody",
      records.filter(b => b.utility === utility),
      utility.toLowerCase()
    );
  });

  renderHistory();
}

function renderHistory() {
  const records = historyBills();

  renderTable("historyTableBody", records, "history");

  document.getElementById("historyCount").textContent =
    `${records.length} bills recorded`;
}

/* 14. PAGE NAVIGATION */

function navigateTo(page) {
  const target = document.getElementById("page-" + page);
  if (!target) return;

  state.currentPage = page;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("active", section === target);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);

    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  const names = {
    overview: "Overview",
    insights: "Insights",
    electricity: "Electricity",
    gas: "Gas",
    water: "Water",
    history: "Bill History"
  };

  document.getElementById("breadcrumbCurrent")
    .textContent = names[page];

  document.getElementById("sidebar")
    .classList.remove("open");

  document.getElementById("menuToggle")
    .setAttribute("aria-expanded", "false");

  window.scrollTo({ top: 0, behavior: "smooth" });

  // Chart.js needs to recalculate sizes when a
  // previously hidden page becomes visible.
  requestAnimationFrame(() => {
    Object.values(state.charts).forEach(chart => chart.resize());
  });

  
}

/* 15. EVENT LISTENERS */

function setupEvents() {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.page);
    });
  });

  document.getElementById("viewAllBills")
    .addEventListener("click", () => navigateTo("history"));

  document.getElementById("yearFilter")
    .addEventListener("change", event => {
      state.year = event.target.value;
      renderDashboard();
    });

  document.getElementById("monthFilter")
    .addEventListener("change", event => {
      state.month = event.target.value;
      renderDashboard();
    });

  document.getElementById("utilityFilter")
    .addEventListener("change", event => {
      state.utility = event.target.value;
      renderHistory();
    });

  document.getElementById("historySearch")
    .addEventListener("input", event => {
      state.search = event.target.value;
      renderHistory();
    });

  const menu = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");

  menu.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    menu.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      sidebar.classList.remove("open");
      menu.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("click", event => {
    if (
      window.innerWidth <= 700 &&
      sidebar.classList.contains("open") &&
      !sidebar.contains(event.target) &&
      !menu.contains(event.target)
    ) {
      sidebar.classList.remove("open");
      menu.setAttribute("aria-expanded", "false");
    }
  });
}

/* 16. INITIALIZATION */

async function initializeDashboard() {
  const dateElement = document.getElementById("currentDate");

  dateElement.textContent = new Date().toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );

  const indicator = document.getElementById("modeIndicator");

  indicator.textContent = CONFIG.demoMode
    ? "DEMO MODE"
    : "REAL DATA";

  setupEvents();
  chartDefaults();

  try {
  state.bills = await loadData();
fillFilters();
renderDashboard();
setupInsightsYear();
renderInsights();

    console.log(
      `81E loaded ${state.bills.length} records`
    );
  } catch (error) {
    console.error("81E data loading failed:", error);
    indicator.textContent = "DATA ERROR";
    state.bills = [];
    fillFilters();
    renderDashboard();
  }
}

/* ==========================================
   81E — ADVANCED INSIGHTS
   ========================================== */

function insightsYears() {
  return [...new Set(state.bills.map(b => b.year))]
    .sort((a, b) => b - a);
}

function setupInsightsYear() {
  const select = document.getElementById("insightsYear");
  if (!select) return;

  const years = insightsYears();
  select.replaceChildren();

  years.forEach(year => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    select.appendChild(option);
  });

  select.value = String(years[0] ?? "");

  select.addEventListener("change", renderInsights);
}

function insightYearRecords(year, utility = null) {
  return state.bills.filter(b =>
    b.year === year &&
    (!utility || b.utility === utility)
  );
}

function insightMonthlyValue(year, month, utility, field) {
  const matches = state.bills.filter(b =>
    b.year === year &&
    b.month_number === month &&
    (!utility || b.utility === utility)
  );

  if (!matches.length) return null;

  if (field === "units") {
    const valid = matches.filter(b =>
      b.units !== null && Number.isFinite(b.units)
    );
    return valid.length ? sum(valid, "units") : null;
  }

  return sum(matches, field);
}

function insightComparison(year, utility = null) {
  const current = insightYearRecords(year, utility);
  const previous = insightYearRecords(year - 1, utility);

  const currentMonths = new Set(current.map(b => b.month_number));
  const previousMonths = new Set(previous.map(b => b.month_number));

  const shared = [...currentMonths].filter(m =>
    previousMonths.has(m)
  );

  // Compare matching calendar months only.
  const currentMatched = current.filter(b =>
    shared.includes(b.month_number)
  );

  const previousMatched = previous.filter(b =>
    shared.includes(b.month_number)
  );

  const currentTotal = sum(currentMatched, "total_bill");
  const previousTotal = sum(previousMatched, "total_bill");

  return {
    currentTotal,
    previousTotal,
    matchedMonths: shared.length,
    percent: shared.length
      ? changePercent(currentTotal, previousTotal)
      : null
  };
}

function renderInsightsKpis(year) {
  const container = document.getElementById("insightsKpis");
  if (!container) return;

  container.replaceChildren();

  const overall = insightComparison(year);

  container.append(
    statCard(
      "Matched-month spending",
      overall.matchedMonths
        ? money(overall.currentTotal) : "—",
      `${overall.matchedMonths} matching months`
    ),
    statCard(
      "Year-over-year change",
      overall.percent === null
        ? "—" : `${overall.percent.toFixed(1)}%`,
      `${year} vs ${year - 1}`
    ),
    statCard(
      "Average monthly bill",
      insightYearRecords(year).length
        ? money(
            sum(insightYearRecords(year), "total_bill") /
            new Set(
              insightYearRecords(year).map(b => b.month_number)
            ).size
          )
        : "—",
      "Per recorded calendar month"
    ),
    statCard(
      "Recorded bills",
      number(insightYearRecords(year).length),
      `During ${year}`
    )
  );
}

function renderInsightsCharts(year) {
  const months = CONFIG.months.map(m => m.slice(0, 3));
  const monthNumbers = Array.from({ length: 12 }, (_, i) => i + 1);

  const currentCosts = monthNumbers.map(m =>
    insightMonthlyValue(year, m, null, "total_bill")
  );

  const previousCosts = monthNumbers.map(m =>
    insightMonthlyValue(year - 1, m, null, "total_bill")
  );

  createChart(
    "insightsYoYChart",
    "bar",
    months,
    [
      barDataset(
        String(year - 1),
        previousCosts,
        "#c8d0dc"
      ),
      barDataset(
        String(year),
        currentCosts,
        CONFIG.colors.Electricity
      )
    ]
  );

  const utilities = ["Electricity", "Gas", "Water"];

  createChart(
    "insightsCompositionChart",
    "doughnut",
    utilities,
    [{
      label: "Spending",
      data: utilities.map(utility =>
        sum(insightYearRecords(year, utility), "total_bill")
      ),
      backgroundColor: utilities.map(u => CONFIG.colors[u]),
      borderWidth: 3,
      borderColor: "#ffffff"
    }],
    {
      chartOptions: { cutout: "72%" }
    }
  );

  const unitsFor = comparisonYear =>
    monthNumbers.map(m =>
      insightMonthlyValue(
        comparisonYear, m, "Electricity", "units"
      )
    );

  createChart(
    "insightsConsumptionChart",
    "line",
    months,
    [
      lineDataset(
        String(year - 1),
        unitsFor(year - 1),
        "#c8d0dc"
      ),
      lineDataset(
        String(year),
        unitsFor(year),
        CONFIG.colors.Electricity
      )
    ],
    { unit: "kWh" }
  );

  const ratesFor = comparisonYear =>
    monthNumbers.map(m => {
      const cost = insightMonthlyValue(
        comparisonYear, m, "Electricity", "total_bill"
      );
      const units = insightMonthlyValue(
        comparisonYear, m, "Electricity", "units"
      );

      return cost !== null && units > 0
        ? cost / units : null;
    });

  createChart(
    "insightsRateChart",
    "line",
    months,
    [
      lineDataset(
        String(year - 1),
        ratesFor(year - 1),
        "#c8d0dc"
      ),
      lineDataset(
        String(year),
        ratesFor(year),
        CONFIG.colors.Electricity
      )
    ]
  );
}

function renderInsightsObservations(year) {
  const container = document.getElementById(
    "insightsObservations"
  );

  if (!container) return;
  container.replaceChildren();

  const records = insightYearRecords(year);

  function addObservation(label, value, description) {
    const item = document.createElement("div");
    item.className = "observation-item";

    const heading = document.createElement("div");
    heading.className = "observation-label";
    heading.textContent = label;

    const amount = document.createElement("div");
    amount.className = "observation-value";
    amount.textContent = value;

    const detail = document.createElement("p");
    detail.className = "observation-description";
    detail.textContent = description;

    item.append(heading, amount, detail);
    container.appendChild(item);
  }

  if (!records.length) {
    addObservation(
      "No records",
      "Insufficient data",
      "There are no bills for this year."
    );
    return;
  }

  const highest = [...records].sort(
    (a, b) => b.total_bill - a.total_bill
  )[0];

  const lowest = [...records].sort(
    (a, b) => a.total_bill - b.total_bill
  )[0];

  addObservation(
    "Highest individual bill",
    money(highest.total_bill),
    `${highest.utility} — ${highest.month} ${highest.year}`
  );

  addObservation(
    "Lowest individual bill",
    money(lowest.total_bill),
    `${lowest.utility} — ${lowest.month} ${lowest.year}`
  );

  const totals = ["Electricity", "Gas", "Water"].map(
    utility => ({
      utility,
      amount: sum(
        records.filter(b => b.utility === utility),
        "total_bill"
      )
    })
  ).sort((a, b) => b.amount - a.amount);

  const largest = totals[0];
  const overall = sum(records, "total_bill");

  addObservation(
    "Largest spending category",
    largest.utility,
    `${overall > 0
      ? (largest.amount / overall * 100).toFixed(1)
      : "0"}% of recorded annual expenditure`
  );

  const expected = 12 * 3;
  const observed = new Set(
    records.map(b => `${b.utility}-${b.month_number}`)
  ).size;

  addObservation(
    "Data completeness",
    `${observed} / ${expected}`,
    "Unique utility-month combinations recorded"
  );
}

function renderInsights() {
  const select = document.getElementById("insightsYear");
  if (!select || !select.value) return;

  const year = Number(select.value);

  renderInsightsKpis(year);
  renderInsightsCharts(year);
  renderInsightsObservations(year);
}

document.addEventListener(
  "DOMContentLoaded",
  initializeDashboard
);
