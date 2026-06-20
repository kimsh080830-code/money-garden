import {
  AUTO_GARDEN_GROUPS,
  AUTO_GARDEN_META,
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  INCOME_CATEGORIES,
  INCOME_METHODS,
  RECORD_TYPES,
  SAVING_METHODS
} from "./constants.js";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDateLabel,
  formatMonthLabel,
  formatTransactionAmount,
  getAutoGardenItem,
  getAutoGardenSummary,
  getDaySummary,
  getDefaultTransactionDate,
  getGardenVisualPlan,
  getLocalDateString,
  getMonthBalanceLabel,
  getMonthCalendarCells,
  getMonthRelation,
  getMonthTransactions,
  getMonthlySummary,
  getPreviousMonthKey,
  groupTransactionsByDate,
  isFutureDate,
  isLargeExpense,
  sortTransactions
} from "./finance.js";

const appRoot = document.querySelector("#app");
const overlayRoot = document.querySelector("#overlay-root");
const toastRoot = document.querySelector("#toast-root");

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  const { className, text, attrs, dataset, type, value, disabled } = options;
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (type) node.type = type;
  if (value !== undefined) node.value = value;
  if (disabled !== undefined) node.disabled = disabled;
  if (attrs) Object.entries(attrs).forEach(([key, val]) => {
    if (val !== undefined && val !== null) node.setAttribute(key, String(val));
  });
  if (dataset) Object.entries(dataset).forEach(([key, val]) => { node.dataset[key] = String(val); });
  children.forEach((child) => {
    if (child === null || child === undefined) return;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  });
  return node;
}

function button(text, action, options = {}) {
  return element("button", {
    className: options.className || "button",
    text,
    type: "button",
    dataset: { action, ...(options.dataset || {}) },
    attrs: options.attrs,
    disabled: options.disabled
  });
}

function panel(title, body, className = "panel") {
  return element("section", { className }, [element("h2", { className: "panel-title", text: title }), body]);
}

function divider() {
  return element("div", { className: "divider", attrs: { "aria-hidden": "true" } });
}

function createMonthControls(monthKey) {
  const controls = element("div", { className: "month-controls", attrs: { "aria-label": "월 이동" } });
  controls.append(
    button("이전 달", "month-prev", { className: "month-button" }),
    element("div", { className: "month-label", text: formatMonthLabel(monthKey), attrs: { "aria-live": "polite" } }),
    button("다음 달", "month-next", { className: "month-button" })
  );
  return controls;
}

function createHomeHeading() {
  const header = element("header", { className: "home-heading" });
  header.append(
    element("div", { className: "heading-side-spacer", attrs: { "aria-hidden": "true" } }),
    element("h1", { text: "꽃 정원 가계부" }),
    button("설정", "open-settings", { className: "icon-text-button", attrs: { "aria-label": "설정 열기" } })
  );
  return header;
}

function createPageHeading(title, description = "") {
  const header = element("header", { className: "page-heading" });
  header.append(element("h1", { text: title }));
  if (description) header.append(element("p", { className: "page-description", text: description }));
  return header;
}

function transactionMarker(transaction) {
  const label = RECORD_TYPES[transaction.recordType] || "기록";
  return element("span", { className: `transaction-marker marker-${transaction.recordType}`, text: label, attrs: { "aria-label": label } });
}

function transactionMeta(transaction, includeDate = false) {
  const parts = [];
  if (includeDate) parts.push(formatDateLabel(transaction.date, false));
  parts.push(transaction.method);
  if (transaction.memo) parts.push(transaction.memo);
  return parts.join(" · ");
}

function createTransactionRow(transaction, data, options = {}) {
  const row = button("", "open-transaction", { className: "transaction-row", dataset: { transactionId: transaction.id } });
  const left = element("span", { className: "transaction-left" });
  const title = element("span", { className: "transaction-title-line" });
  title.append(transactionMarker(transaction), element("span", { className: "transaction-name", text: transaction.category }));
  left.append(title, element("span", { className: "transaction-meta", text: transactionMeta(transaction, options.includeDate) }));

  const right = element("span", { className: "transaction-right" });
  right.append(element("span", { className: `transaction-amount ${transaction.recordType}`, text: formatTransactionAmount(transaction) }));
  if (isLargeExpense(transaction, data.settings.largeExpenseThreshold)) right.append(element("span", { className: "large-badge", text: "큰 지출" }));
  row.append(left, right);
  return row;
}

function createBalancePanel(data, monthKey) {
  const summary = getMonthlySummary(data, monthKey);
  const relation = getMonthRelation(monthKey);
  const body = element("div", { className: "balance-content" });
  body.append(element("div", { className: "balance-line" }, [
    element("span", { className: "balance-label", text: getMonthBalanceLabel(monthKey) }),
    element("strong", { className: "balance-value", text: summary.availableBalance === null ? "—" : formatCurrency(summary.availableBalance) })
  ]));
  if (relation !== "future") {
    body.append(element("div", { className: "balance-change" }, [
      element("span", { text: "이번 달 가용 잔액 증감" }),
      element("strong", { className: summary.netChange < 0 ? "negative" : "positive", text: `${summary.netChange < 0 ? "-" : "+"}${formatCurrency(summary.netChange)}` })
    ]));
  }
  if (!summary.hasStartingBalance) {
    const callout = element("div", { className: "starting-balance-callout" });
    callout.append(
      element("p", { text: "시작 가용 잔액이 설정되지 않았어." }),
      element("p", { className: "muted", text: "시작 잔액을 입력하면 정확한 가용 잔액을 확인할 수 있어." }),
      button("시작 가용 잔액 설정하기", "edit-start-balance", { className: "button button-secondary" })
    );
    body.append(callout);
  }
  return panel("가용 잔액", body, "panel balance-panel");
}

function createMonthlyAmountPanel(data, monthKey) {
  const summary = getMonthlySummary(data, monthKey);
  const grid = element("div", { className: "monthly-amount-grid" });
  [["수입", `+${formatCurrency(summary.income)}`, "income"], ["지출", `-${formatCurrency(summary.expense)}`, "expense"], ["저축", `-${formatCurrency(summary.saving)}`, "saving"]].forEach(([label, amount, className]) => {
    const item = element("div", { className: "amount-stat" });
    item.append(element("span", { text: label }), element("strong", { className, text: amount }));
    grid.append(item);
  });
  return panel("이번 달 금액", grid, "panel amount-panel");
}

function createLargeExpensePanel(data, monthKey) {
  const summary = getMonthlySummary(data, monthKey);
  const body = element("div", { className: "inline-summary" });
  body.append(element("span", { text: `${summary.largeExpenses.length}건 · -${formatCurrency(summary.largeExpenseAmount)}` }), button("내역 보기", "show-large-ledger", { className: "text-button" }));
  return panel("큰 지출", body, "panel compact-panel");
}

function createRecordCountPanel(data, monthKey) {
  const summary = getMonthlySummary(data, monthKey);
  return panel("이번 달 기록", element("p", { className: "record-count-text", text: `수입 ${summary.counts.income}건 · 지출 ${summary.counts.expense}건 · 저축 ${summary.counts.saving}건` }), "panel compact-panel");
}

function createRecentTransactionsPanel(data, monthKey) {
  const records = sortTransactions(getMonthTransactions(data, monthKey), "newest").slice(0, 3);
  const body = element("div", { className: "recent-list" });
  if (records.length) records.forEach((transaction) => body.append(createTransactionRow(transaction, data)));
  else body.append(element("p", { className: "muted", text: "최근 거래가 없어." }));
  const footer = element("div", { className: "panel-footer" });
  footer.append(button("전체 보기", "show-all-ledger", { className: "text-button" }));
  body.append(footer);
  return panel("최근 거래", body, "panel list-panel");
}

function imageNode(src, alt, className, style = {}) {
  const image = element("img", { className, attrs: { src, alt, loading: "lazy" } });
  Object.entries(style).forEach(([key, value]) => { image.style[key] = value; });
  image.addEventListener("error", () => { image.hidden = true; });
  return image;
}

function createGardenStage(data, monthKey, options = {}) {
  const plan = getGardenVisualPlan(data, monthKey);
  const stage = element("div", { className: `garden-stage ${options.compact ? "garden-stage-compact" : ""}`, attrs: { "aria-label": `${formatMonthLabel(monthKey)} 정원` } });
  stage.append(imageNode(plan.ground, "정원 흙밭", "garden-ground"));

  for (const item of plan.plants) {
    const plant = options.interactive
      ? button("", "open-garden-detail", { className: `garden-plant-button ${item.group}`, dataset: { gardenGroup: item.group }, attrs: { "aria-label": `${AUTO_GARDEN_META[item.group].buttonLabel}` } })
      : element("div", { className: `garden-plant-button ${item.group}`, attrs: { "aria-hidden": "true" } });
    plant.style.left = `${item.left}%`;
    plant.style.bottom = `${item.bottom}%`;
    plant.style.width = `${item.width}%`;
    plant.append(imageNode(item.src, item.alt, "garden-plant"));
    stage.append(plant);
  }

  const incomeItem = plan.summary.find((item) => item.group === "income");
  if (plan.showSunlight) {
    const node = options.interactive
      ? button("", "open-garden-detail", { className: "garden-environment sunlight", dataset: { gardenGroup: "income" }, attrs: { "aria-label": "수입 기록 보기" } })
      : element("div", { className: "garden-environment sunlight", attrs: { "aria-hidden": "true" } });
    node.append(imageNode(plan.sunlight, "", "garden-sun"));
    stage.append(node);
  }
  if (plan.showWater) {
    const node = options.interactive
      ? button("", "open-garden-detail", { className: "garden-environment water", dataset: { gardenGroup: "income" }, attrs: { "aria-label": "수입 기록 보기" } })
      : element("div", { className: "garden-environment water", attrs: { "aria-hidden": "true" } });
    node.append(imageNode(plan.water, "", "garden-water"));
    stage.append(node);
  }

  if (!plan.plants.length && !incomeItem?.count) {
    stage.append(element("p", { className: "garden-stage-empty", text: "오늘의 정원은 조용히 쉬고 있어." }));
  }
  return stage;
}
function createGardenPreviewPanel(data, monthKey) {
  const summary = getAutoGardenSummary(data, monthKey);
  const small = summary.find((item) => item.group === "small-expense");
  const medium = summary.find((item) => item.group === "medium-expense");
  const large = summary.find((item) => item.group === "large-expense");
  const saving = summary.find((item) => item.group === "saving");
  const body = element("div", { className: "garden-preview-body" });
  body.append(createGardenStage(data, monthKey, { compact: true, interactive: false }));
  body.append(element("p", { className: "garden-preview-summary", text: `작은 지출 ${small.count}건 · 중간 지출 ${medium.count}건 · 큰 지출 ${large.count}건 · 저축 ${saving.count}건` }));
  const footer = element("div", { className: "panel-footer" });
  footer.append(button("정원 자세히 보기", "go-garden", { className: "text-button" }));
  body.append(footer);
  return panel("이번 달 정원", body, "panel garden-preview-panel");
}

function createFutureNotice() {
  const box = element("section", { className: "future-notice" });
  box.append(element("h2", { text: "미래 월" }), element("p", { text: "미래 월에는 거래를 기록할 수 없어. 시작 가용 잔액만 설정할 수 있어." }), button("시작 가용 잔액 설정하기", "edit-start-balance"));
  return box;
}

function createHomeView(state, data) {
  const fragment = document.createDocumentFragment();
  fragment.append(createHomeHeading(), createMonthControls(state.selectedMonth));
  if (getMonthRelation(state.selectedMonth) === "future") {
    fragment.append(createBalancePanel(data, state.selectedMonth), createFutureNotice());
    return fragment;
  }
  const records = getMonthTransactions(data, state.selectedMonth);
  fragment.append(createBalancePanel(data, state.selectedMonth), createMonthlyAmountPanel(data, state.selectedMonth));
  if (!records.length) {
    const empty = element("section", { className: "empty-state" });
    empty.append(element("p", { text: "이 달에는 아직 기록된 거래가 없어." }), button("첫 거래 기록하기", "open-add-transaction"));
    fragment.append(empty);
  } else {
    fragment.append(createLargeExpensePanel(data, state.selectedMonth), createRecordCountPanel(data, state.selectedMonth), createRecentTransactionsPanel(data, state.selectedMonth), createGardenPreviewPanel(data, state.selectedMonth));
  }
  return fragment;
}

function createSelect(name, options, selectedValue, config = {}) {
  const select = element("select", { className: config.className || "filter-select", attrs: { name, "aria-label": config.label || name }, dataset: config.dataset });
  options.forEach((item) => {
    const option = element("option", { text: item.label, value: item.value });
    if (item.value === selectedValue) option.selected = true;
    select.append(option);
  });
  return select;
}

function createFilterBar(state, data) {
  const wrapper = element("div", { className: "ledger-controls" });
  wrapper.append(element("input", { className: "ledger-search", value: state.searchQuery, attrs: { placeholder: "카테고리, 방식, 메모 검색", type: "search", "aria-label": "거래 검색" }, dataset: { ledgerSearch: "true" } }));
  const available = getMonthTransactions(data, state.selectedMonth);
  const categories = [...new Set(available.filter((t) => t.recordType !== "saving").map((t) => t.category))].sort();
  const methods = [...new Set(available.map((t) => t.method))].sort();
  const filters = element("div", { className: "filter-row" });
  filters.append(
    createSelect("recordType", [{ value: "all", label: "유형 전체" }, { value: "income", label: "수입" }, { value: "expense", label: "지출" }, { value: "saving", label: "저축" }], state.filters.recordType, { dataset: { filter: "recordType" } }),
    createSelect("category", [{ value: "all", label: "카테고리 전체" }, ...categories.map((value) => ({ value, label: value }))], state.filters.category, { dataset: { filter: "category" } }),
    createSelect("method", [{ value: "all", label: "방식 전체" }, ...methods.map((value) => ({ value, label: value }))], state.filters.method, { dataset: { filter: "method" } }),
    createSelect("sort", [{ value: "newest", label: "최신순" }, { value: "oldest", label: "오래된순" }, { value: "amount-high", label: "금액 높은순" }, { value: "amount-low", label: "금액 낮은순" }], state.sort, { dataset: { sort: "true" } })
  );
  const large = element("label", { className: "check-filter" });
  const checkbox = element("input", { attrs: { type: "checkbox" }, dataset: { filter: "largeOnly" } });
  checkbox.checked = state.filters.largeOnly;
  large.append(checkbox, element("span", { text: "큰 지출만" }));
  filters.append(large);
  wrapper.append(filters);
  return wrapper;
}

function filteredLedgerTransactions(state, data) {
  const query = state.searchQuery.trim().toLowerCase();
  return getMonthTransactions(data, state.selectedMonth).filter((transaction) => {
    if (state.filters.recordType !== "all" && transaction.recordType !== state.filters.recordType) return false;
    if (state.filters.category !== "all" && transaction.category !== state.filters.category) return false;
    if (state.filters.method !== "all" && transaction.method !== state.filters.method) return false;
    if (state.filters.largeOnly && !isLargeExpense(transaction, data.settings.largeExpenseThreshold)) return false;
    if (!query) return true;
    return [transaction.category, transaction.method, transaction.memo].join(" ").toLowerCase().includes(query);
  });
}

function createActiveFilterNotice(state) {
  const parts = [];
  if (state.filters.recordType !== "all") parts.push(RECORD_TYPES[state.filters.recordType]);
  if (state.filters.category !== "all") parts.push(state.filters.category);
  if (state.filters.method !== "all") parts.push(state.filters.method);
  if (state.filters.largeOnly) parts.push("큰 지출만 보기");
  if (state.searchQuery) parts.push(`검색: ${state.searchQuery}`);
  if (!parts.length) return null;
  const notice = element("div", { className: "active-filter-notice" });
  notice.append(element("span", { text: parts.join(" · ") }), button("필터 초기화", "reset-ledger-controls", { className: "text-button" }));
  return notice;
}

function createDateGroup(data, group) {
  const summary = getDaySummary(data, group.date);
  const section = element("section", { className: "date-group" });
  const heading = element("div", { className: "date-group-heading" });
  heading.append(element("h2", { text: formatDateLabel(group.date) }), element("p", { className: "date-group-summary", text: `수입 +${formatCurrency(summary.income)} · 지출 -${formatCurrency(summary.expense)} · 저축 -${formatCurrency(summary.saving)}` }));
  section.append(heading);
  const list = element("div", { className: "transaction-list" });
  group.transactions.forEach((transaction) => list.append(createTransactionRow(transaction, data)));
  section.append(list);
  return section;
}

function createLedgerView(state, data) {
  const fragment = document.createDocumentFragment();
  fragment.append(createPageHeading("내역", "거래를 검색하고 수정할 수 있어."), createMonthControls(state.selectedMonth));
  if (getMonthRelation(state.selectedMonth) === "future") {
    fragment.append(element("section", { className: "future-notice" }, [element("h2", { text: "미래 월" }), element("p", { text: "미래 월에는 거래 내역을 기록할 수 없어." })]));
    return fragment;
  }
  fragment.append(createFilterBar(state, data));
  const notice = createActiveFilterNotice(state);
  if (notice) fragment.append(notice);
  const records = filteredLedgerTransactions(state, data);
  if (!records.length) {
    fragment.append(element("section", { className: "empty-state compact" }, [element("p", { text: "조건에 맞는 거래가 없어." }), button("거래 추가", "open-add-transaction", { className: "button button-secondary" })]));
    return fragment;
  }
  if (state.sort === "amount-high" || state.sort === "amount-low") {
    const list = element("section", { className: "date-group" });
    sortTransactions(records, state.sort).forEach((transaction) => list.append(createTransactionRow(transaction, data, { includeDate: true })));
    fragment.append(list);
  } else {
    groupTransactionsByDate(records, state.sort).forEach((group) => fragment.append(createDateGroup(data, group)));
  }
  return fragment;
}

function createCalendarView(state, data) {
  const fragment = document.createDocumentFragment();
  fragment.append(createPageHeading("달력", "날짜별 돈의 흐름을 확인해."), createMonthControls(state.selectedMonth));
  const relation = getMonthRelation(state.selectedMonth);
  const weekdays = element("div", { className: "calendar-weekdays", attrs: { "aria-hidden": "true" } });
  ["일", "월", "화", "수", "목", "금", "토"].forEach((day) => weekdays.append(element("span", { text: day })));
  const grid = element("div", { className: "calendar-grid" });
  for (const date of getMonthCalendarCells(state.selectedMonth)) {
    if (!date) {
      grid.append(element("div", { className: "calendar-blank", attrs: { "aria-hidden": "true" } }));
      continue;
    }
    const isFuture = relation === "future" || isFutureDate(date);
    const day = getDaySummary(data, date);
    const cell = button("", "open-calendar-date", { className: `calendar-day ${date === state.selectedCalendarDate ? "is-selected" : ""} ${date === getLocalDateString() ? "is-today" : ""} ${isFuture ? "is-future" : ""}`, dataset: { date }, attrs: isFuture ? { "aria-disabled": "true" } : { "aria-label": formatDateLabel(date) } });
    cell.append(element("span", { className: "calendar-day-number", text: String(Number(date.slice(8))) }));
    if (!isFuture) {
      const summaries = element("span", { className: "calendar-summaries" });
      if (day.income) summaries.append(element("span", { className: "calendar-income", text: formatCompactCurrency(day.income, "income") }));
      if (day.expense) summaries.append(element("span", { className: "calendar-expense", text: formatCompactCurrency(day.expense, "expense") }));
      if (day.saving) summaries.append(element("span", { className: "calendar-saving", text: "저축" }));
      if (day.hasLargeExpense) summaries.append(element("span", { className: "large-badge", text: "큰 지출" }));
      cell.append(summaries);
    }
    grid.append(cell);
  }
  fragment.append(element("section", { className: "calendar-panel" }, [weekdays, grid]));
  return fragment;
}

function createGardenSummaryCard(item) {
  const body = element("div", { className: "garden-summary-card" });
  const copy = element("div", { className: "garden-summary-copy" });
  copy.append(element("h2", { text: item.label }), element("p", { text: item.shortLabel }), element("p", { className: "muted", text: item.meaning }));
  const meta = element("div", { className: "garden-summary-meta" });
  meta.append(element("strong", { text: item.count ? `${item.count}건 · ${item.group === "income" ? "+" : "-"}${formatCurrency(item.amount)}` : "기록 없음" }), button(item.buttonLabel, "open-garden-detail", { className: "text-button", dataset: { gardenGroup: item.group } }));
  body.append(copy, meta);
  return body;
}

function createGardenView(state, data) {
  const fragment = document.createDocumentFragment();
  fragment.append(createPageHeading("정원", "이번 달 기록이 작은 풍경으로 남아."), createMonthControls(state.selectedMonth));
  if (getMonthRelation(state.selectedMonth) === "future") {
    fragment.append(element("section", { className: "future-notice" }, [element("h2", { text: "미래 월" }), element("p", { text: "미래 월의 정원은 거래를 기록한 뒤 확인할 수 있어." })]));
    return fragment;
  }
  const items = getAutoGardenSummary(data, state.selectedMonth);
  const hasTransactions = getMonthTransactions(data, state.selectedMonth).length > 0;
  if (!hasTransactions) {
    const empty = element("section", { className: "empty-state garden-empty-state" });
    empty.append(createGardenStage(data, state.selectedMonth, { interactive: false }), element("p", { text: "오늘의 정원은 조용히 쉬고 있어." }), element("p", { className: "muted", text: "거래를 기록하면 이번 달의 정원이 조금씩 만들어져." }), button("첫 거래 기록하기", "open-add-transaction"));
    fragment.append(empty);
    return fragment;
  }
  fragment.append(panel("이번 달 정원", createGardenStage(data, state.selectedMonth, { interactive: true }), "panel garden-stage-panel"));
  const income = items.find((item) => item.group === "income");
  const status = element("section", { className: "garden-income-status" });
  if (income.count) status.append(element("p", { text: `이번 달 수입 ${income.count}건 · +${formatCurrency(income.amount)}` }), button("수입 기록 보기", "open-garden-detail", { className: "text-button", dataset: { gardenGroup: "income" } }));
  else status.append(element("p", { text: "이번 달에는 아직 들어온 수입 기록이 없어." }));
  fragment.append(status);
  const cards = element("div", { className: "garden-summary-list" });
  ["small-expense", "medium-expense", "large-expense", "saving"].forEach((group) => cards.append(createGardenSummaryCard(items.find((item) => item.group === group))));
  fragment.append(cards);
  return fragment;
}

function createBottomNavigation(state) {
  const nav = element("nav", { className: "bottom-navigation", attrs: { "aria-label": "주요 메뉴" } });
  const left = element("div", { className: "nav-side nav-left" });
  const right = element("div", { className: "nav-side nav-right" });
  [["home", "홈"], ["ledger", "내역"]].forEach(([tab, label]) => left.append(button(label, "switch-tab", { className: `nav-tab ${state.activeTab === tab ? "active" : ""}`, dataset: { tab }, attrs: { "aria-current": state.activeTab === tab ? "page" : null } })));
  [["calendar", "달력"], ["garden", "정원"]].forEach(([tab, label]) => right.append(button(label, "switch-tab", { className: `nav-tab ${state.activeTab === tab ? "active" : ""}`, dataset: { tab }, attrs: { "aria-current": state.activeTab === tab ? "page" : null } })));
  const future = getMonthRelation(state.selectedMonth) === "future";
  const add = button("+", "open-add-transaction", { className: `floating-add-button ${future ? "is-disabled" : ""}`, attrs: { "aria-label": "거래 추가", "aria-disabled": future ? "true" : "false" } });
  nav.append(left, add, right);
  return nav;
}

export function renderActiveView(state, data) {
  appRoot.replaceChildren();
  const main = element("main", { className: "main-content" });
  const renderer = { home: createHomeView, ledger: createLedgerView, calendar: createCalendarView, garden: createGardenView }[state.activeTab] || createHomeView;
  main.append(renderer(state, data));
  appRoot.append(main, createBottomNavigation(state));
}

function createOverlayHeader(title, hasBack) {
  const header = element("header", { className: "overlay-header" });
  header.append(hasBack ? button("뒤로", "back-overlay", { className: "overlay-header-button" }) : element("div", { className: "overlay-header-spacer", attrs: { "aria-hidden": "true" } }), element("h2", { text: title }), button("닫기", "close-overlay", { className: "overlay-header-button" }));
  return header;
}

function detailLine(label, value) {
  return element("div", { className: "detail-line" }, [element("span", { text: label }), element("strong", { text: value })]);
}

function findTransaction(data, id) {
  return data.transactions.find((transaction) => transaction.id === id) || null;
}

function createTransactionDetailOverlay(state, data) {
  const transaction = findTransaction(data, state.overlay.payload.transactionId);
  const body = element("div", { className: "overlay-body" });
  if (!transaction) {
    body.append(element("p", { text: "거래를 찾을 수 없어." }));
    return { title: "거래 상세", body };
  }
  body.append(detailLine("유형", RECORD_TYPES[transaction.recordType]), detailLine("금액", formatTransactionAmount(transaction)), detailLine("날짜", formatDateLabel(transaction.date)), detailLine(transaction.recordType === "saving" ? "목적" : "카테고리", transaction.category), detailLine(transaction.recordType === "saving" ? "보관 방식" : "방식", transaction.method));
  if (transaction.memo) body.append(detailLine("메모", transaction.memo));
  const actions = element("div", { className: "overlay-actions" });
  actions.append(button("수정", "edit-transaction", { className: "button button-secondary", dataset: { transactionId: transaction.id } }), button("삭제", "confirm-transaction-delete", { className: "button button-danger", dataset: { transactionId: transaction.id } }));
  body.append(actions);
  return { title: "거래 상세", body };
}

export function createTransactionDraft(recordType, defaultDate, source = {}) {
  return {
    recordType,
    amount: source.amount || "",
    date: source.date || defaultDate || "",
    category: source.category || "",
    method: source.method || (recordType === "saving" ? "저축 통장" : ""),
    memo: source.memo || ""
  };
}

function createTextField(label, name, value, config = {}) {
  const field = element("label", { className: "form-field" });
  field.append(element("span", { text: label }));
  const input = element(config.multiline ? "textarea" : "input", { value, attrs: { name, placeholder: config.placeholder || "", inputmode: config.inputmode, type: config.type || (config.multiline ? undefined : "text"), required: config.required ? "" : null, maxlength: config.maxlength } });
  field.append(input);
  if (config.help) field.append(element("small", { className: "field-help", text: config.help }));
  return field;
}

function createSelectField(label, name, options, selectedValue) {
  const field = element("label", { className: "form-field" });
  field.append(element("span", { text: label }));
  field.append(createSelect(name, [{ value: "", label: "선택해 주세요" }, ...options.map((value) => ({ value, label: value }))], selectedValue, { className: "form-select" }));
  return field;
}

function createTransactionFormOverlay(state) {
  const { mode, recordType, draft } = state.overlay.payload;
  const body = element("div", { className: "overlay-body" });
  const tabs = element("div", { className: "record-type-tabs", attrs: { role: "tablist", "aria-label": "거래 유형" } });
  ["income", "expense", "saving"].forEach((type) => tabs.append(button(RECORD_TYPES[type], "change-transaction-type", { className: `record-type-tab ${recordType === type ? "active" : ""}`, dataset: { recordType: type }, attrs: { role: "tab", "aria-selected": recordType === type ? "true" : "false" } })));
  body.append(tabs);
  const form = element("form", { className: "transaction-form", attrs: { id: "transaction-form", novalidate: "" }, dataset: { mode, transactionId: state.overlay.payload.transactionId || "" } });
  form.append(createTextField("금액", "amount", draft.amount, { inputmode: "numeric", placeholder: "예: 4,500", required: true }));
  if (recordType === "expense") {
    form.append(createSelectField("카테고리", "category", EXPENSE_CATEGORIES, draft.category), createSelectField("결제 수단", "method", EXPENSE_METHODS, draft.method), createTextField("날짜", "date", draft.date, { type: "date", required: true }), createTextField("메모", "memo", draft.memo, { placeholder: "선택 입력", maxlength: 120, multiline: true, help: "이 거래는 저장하면 이번 달 정원에 자동으로 반영돼." }));
  } else if (recordType === "income") {
    form.append(createTextField("날짜", "date", draft.date, { type: "date", required: true }), createSelectField("수입 카테고리", "category", INCOME_CATEGORIES, draft.category), createSelectField("받은 방식", "method", INCOME_METHODS, draft.method), createTextField("메모", "memo", draft.memo, { placeholder: "선택 입력", maxlength: 120, multiline: true }));
  } else {
    form.append(createTextField("날짜", "date", draft.date, { type: "date", required: true }), createTextField("저축 목적 또는 이름", "category", draft.category, { placeholder: "예: 비상금", required: true, maxlength: 50 }), createSelectField("보관 방식", "method", SAVING_METHODS, draft.method), createTextField("메모", "memo", draft.memo, { placeholder: "선택 입력", maxlength: 120, multiline: true, help: "저축은 정원에 씨앗으로 자동 반영돼." }));
  }
  const actions = element("div", { className: "overlay-actions" });
  actions.append(button("취소", "back-overlay", { className: "button button-secondary" }), element("button", { className: "button", text: mode === "edit" ? "수정 저장" : "기록하기", type: "submit", dataset: { saveButton: "true" } }));
  form.append(actions);
  body.append(form);
  return { title: mode === "edit" ? "거래 수정" : "거래 기록", body };
}

function createDateDetailOverlay(state, data) {
  const date = state.overlay.payload.date;
  const day = getDaySummary(data, date);
  const body = element("div", { className: "overlay-body" });
  body.append(detailLine("수입", `+${formatCurrency(day.income)}`), detailLine("지출", `-${formatCurrency(day.expense)}`), detailLine("저축", `-${formatCurrency(day.saving)}`));
  const list = element("div", { className: "transaction-list detail-list" });
  if (day.transactions.length) sortTransactions(day.transactions, "newest").forEach((transaction) => list.append(createTransactionRow(transaction, data)));
  else list.append(element("p", { className: "muted", text: "기록된 거래가 없어." }));
  body.append(list);
  if (!isFutureDate(date)) body.append(button("거래 추가", "open-add-transaction", { className: "button full-width" }));
  return { title: formatDateLabel(date), body };
}

function createGardenDetailOverlay(state, data) {
  const group = state.overlay.payload.gardenGroup;
  const item = getAutoGardenItem(data, state.selectedMonth, group);
  const body = element("div", { className: "overlay-body" });
  if (!item) {
    body.append(element("p", { text: "정원 기록을 찾을 수 없어." }));
    return { title: "정원 기록", body };
  }
  body.append(element("p", { className: "muted", text: item.meaning }), detailLine("기록", item.count ? `${item.count}건` : "기록 없음"), detailLine("금액", item.count ? `${group === "income" ? "+" : "-"}${formatCurrency(item.amount)}` : "—"));
  const list = element("div", { className: "transaction-list detail-list" });
  if (item.transactions.length) sortTransactions(item.transactions, "newest").forEach((transaction) => list.append(createTransactionRow(transaction, data)));
  else list.append(element("p", { className: "muted", text: "해당 기록이 없어." }));
  body.append(list);
  return { title: item.label, body };
}

function createSettingsOverlay(state, data) {
  const body = element("div", { className: "overlay-body settings-body" });
  const setting = data.monthSettings[state.selectedMonth];
  const start = element("section", { className: "setting-block" });
  start.append(element("h3", { text: "시작 가용 잔액" }), element("p", { className: "muted", text: formatMonthLabel(state.selectedMonth) }), element("strong", { className: "setting-value", text: setting ? formatCurrency(setting.startingAvailableBalance) : "설정되지 않음" }), button("수정하기", "edit-start-balance", { className: "button button-secondary" }));
  const thresholds = element("section", { className: "setting-block" });
  thresholds.append(element("h3", { text: "정원 자동 분류 기준" }), element("p", { text: `${formatCurrency(data.settings.smallExpenseThreshold)} 미만 → 작은 꽃` }), element("p", { text: `${formatCurrency(data.settings.largeExpenseThreshold)} 이상 → 나무` }), element("p", { className: "muted", text: "그 사이 금액은 관목으로 표시돼." }), button("기준 수정하기", "edit-garden-thresholds", { className: "button button-secondary" }));
  const management = element("section", { className: "setting-block" });
  management.append(element("h3", { text: "데이터 관리" }), button("JSON 파일로 내보내기", "export-json", { className: "button button-secondary" }), button("JSON 파일 불러오기", "trigger-import", { className: "button button-secondary" }), button("전체 데이터 삭제", "confirm-delete-all", { className: "button button-danger" }));
  body.append(start, divider(), thresholds, divider(), management, divider(), element("p", { className: "storage-notice", text: "이 가계부 데이터는 현재 브라우저에만 저장됩니다. 브라우저 데이터 또는 사이트 데이터를 삭제하면 기록이 사라질 수 있습니다. 다른 기기에서는 기록이 자동으로 이어지지 않습니다. 중요한 기록은 정기적으로 JSON 파일로 내보내 백업해 주세요." }));
  return { title: "설정", body };
}

function createStartBalanceOverlay(state, data) {
  const setting = data.monthSettings[state.selectedMonth];
  const previous = getMonthlySummary(data, getPreviousMonthKey(state.selectedMonth));
  const body = element("div", { className: "overlay-body" });
  body.append(element("p", { className: "muted", text: `${formatMonthLabel(state.selectedMonth)}의 첫날 기준으로 자유롭게 쓸 수 있던 금액을 입력해 주세요.` }));
  const form = element("form", { className: "transaction-form", attrs: { id: "start-balance-form", novalidate: "" }, dataset: { usePreviousBalance: "false" } });
  form.append(createTextField("시작 가용 잔액", "startingAvailableBalance", setting ? String(setting.startingAvailableBalance) : "", { inputmode: "numeric", placeholder: "0원 이상" }));
  if (previous.hasStartingBalance) form.append(button(`직전 달 마감 가용 잔액 ${formatCurrency(previous.availableBalance)} 가져오기`, "fill-prev-balance", { className: "button button-secondary" }));
  else form.append(element("p", { className: "field-help", text: "직전 달 시작 잔액이 없어 마감 잔액을 계산할 수 없어." }));
  const actions = element("div", { className: "overlay-actions" });
  actions.append(button("취소", "back-overlay", { className: "button button-secondary" }), element("button", { className: "button", text: "저장", type: "submit" }));
  form.append(actions);
  body.append(form);
  return { title: "시작 가용 잔액", body };
}

function createGardenThresholdOverlay(data) {
  const body = element("div", { className: "overlay-body" });
  body.append(element("p", { className: "muted", text: "지출 금액에 따라 꽃, 관목, 나무가 자동으로 정해져." }));
  const form = element("form", { className: "transaction-form", attrs: { id: "garden-threshold-form", novalidate: "" } });
  form.append(createTextField("소액 지출 기준", "smallExpenseThreshold", String(data.settings.smallExpenseThreshold), { inputmode: "numeric", placeholder: "예: 10,000" }), createTextField("큰 지출 기준", "largeExpenseThreshold", String(data.settings.largeExpenseThreshold), { inputmode: "numeric", placeholder: "예: 50,000" }), element("p", { className: "field-help", text: "소액 지출 기준은 큰 지출 기준보다 작아야 해." }));
  const actions = element("div", { className: "overlay-actions" });
  actions.append(button("취소", "back-overlay", { className: "button button-secondary" }), element("button", { className: "button", text: "저장", type: "submit" }));
  form.append(actions);
  body.append(form);
  return { title: "정원 자동 분류 기준", body };
}

function createConfirmTransactionDeleteOverlay(state) {
  const body = element("div", { className: "overlay-body confirm-body" });
  body.append(element("p", { text: "이 거래를 삭제할까요?" }), element("p", { className: "muted", text: "삭제하면 되돌릴 수 없습니다." }));
  const actions = element("div", { className: "overlay-actions" });
  actions.append(button("취소", "back-overlay", { className: "button button-secondary" }), button("삭제", "delete-transaction", { className: "button button-danger", dataset: { transactionId: state.overlay.payload.transactionId } }));
  body.append(actions);
  return { title: "거래 삭제", body };
}

function createConfirmDeleteAllOverlay() {
  const body = element("div", { className: "overlay-body confirm-body" });
  body.append(element("p", { text: "모든 거래와 설정을 삭제할까요?" }), element("p", { className: "muted", text: "삭제하면 되돌릴 수 없습니다." }));
  const actions = element("div", { className: "overlay-actions" });
  actions.append(button("취소", "back-overlay", { className: "button button-secondary" }), button("전체 삭제", "delete-all-data", { className: "button button-danger" }));
  body.append(actions);
  return { title: "전체 데이터 삭제", body };
}

function createImportChoiceOverlay() {
  const body = element("div", { className: "overlay-body" });
  body.append(element("p", { text: "불러온 데이터를 현재 가계부에 어떻게 적용할까요?" }));
  const actions = element("div", { className: "vertical-actions" });
  actions.append(button("현재 데이터를 덮어쓰기", "import-overwrite"), button("현재 데이터와 합치기", "import-merge", { className: "button button-secondary" }), button("취소", "back-overlay", { className: "button button-tertiary" }));
  body.append(actions);
  return { title: "JSON 데이터 불러오기", body };
}

function createOverlayContent(state, data) {
  switch (state.overlay.type) {
    case "transaction-type": {
      const body = element("div", { className: "overlay-body" });
      body.append(element("p", { className: "muted", text: "기록할 거래 유형을 선택해 주세요." }));
      const actions = element("div", { className: "vertical-actions" });
      ["income", "expense", "saving"].forEach((type) => actions.append(button(RECORD_TYPES[type], "choose-record-type", { dataset: { recordType: type } })));
      body.append(actions);
      return { title: "거래 추가", body };
    }
    case "transaction-form": return createTransactionFormOverlay(state);
    case "transaction-detail": return createTransactionDetailOverlay(state, data);
    case "date-detail": return createDateDetailOverlay(state, data);
    case "garden-detail": return createGardenDetailOverlay(state, data);
    case "settings": return createSettingsOverlay(state, data);
    case "start-balance": return createStartBalanceOverlay(state, data);
    case "garden-thresholds": return createGardenThresholdOverlay(data);
    case "confirm-transaction-delete": return createConfirmTransactionDeleteOverlay(state);
    case "confirm-delete-all": return createConfirmDeleteAllOverlay();
    case "import-choice": return createImportChoiceOverlay();
    default: return { title: "안내", body: element("div", { className: "overlay-body" }, [element("p", { text: "화면을 표시할 수 없어." })]) };
  }
}

export function renderOverlay(state, data) {
  overlayRoot.replaceChildren();
  if (!state.overlay) return;
  const backdrop = element("div", { className: "overlay-backdrop", attrs: { "data-overlay-backdrop": "true" } });
  const dialog = element("section", { className: "overlay-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "overlay-title", tabindex: "-1" } });
  const content = createOverlayContent(state, data);
  const header = createOverlayHeader(content.title, Boolean(state.overlay.back));
  header.querySelector("h2").id = "overlay-title";
  dialog.append(header, content.body);
  backdrop.append(dialog);
  overlayRoot.append(backdrop);
  requestAnimationFrame(() => (dialog.querySelector("input, select, textarea, button") || dialog).focus());
}

export function showToast(message, type = "normal") {
  toastRoot.replaceChildren();
  const toast = element("div", { className: `toast ${type === "error" ? "toast-error" : ""}`, text: message, attrs: { role: "status" } });
  toastRoot.append(toast);
  window.setTimeout(() => { if (toastRoot.contains(toast)) toast.remove(); }, 2800);
}

export function readTransactionDraft(form) {
  const recordType = form.closest(".overlay-body")?.querySelector(".record-type-tab.active")?.dataset.recordType || "expense";
  const data = new FormData(form);
  return {
    recordType,
    amount: String(data.get("amount") || ""),
    date: String(data.get("date") || ""),
    category: String(data.get("category") || ""),
    method: String(data.get("method") || ""),
    memo: String(data.get("memo") || "")
  };
}

export function transformTransactionDraft(draft, nextType) {
  const preserved = { amount: draft.amount, date: draft.date, memo: draft.memo };
  if (nextType === "saving") return createTransactionDraft("saving", draft.date, { ...preserved, method: "저축 통장" });
  return createTransactionDraft(nextType, draft.date, { ...preserved, category: "", method: "" });
}
