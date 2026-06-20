import { AUTO_GARDEN_GROUPS, AUTO_GARDEN_META, GARDEN_ASSETS } from "./constants.js";

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalMonthString(date = new Date()) {
  return getLocalDateString(date).slice(0, 7);
}

export function parseLocalDate(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isValidDateString(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) return false;
  const [year, month, day] = String(dateString).split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

export function isValidMonthKey(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey))) return false;
  const [year, month] = String(monthKey).split("-").map(Number);
  return Number.isInteger(year) && month >= 1 && month <= 12;
}

export function isFutureDate(dateString) {
  return isValidDateString(dateString) && dateString > getLocalDateString();
}

export function getMonthRelation(monthKey) {
  const current = getLocalMonthString();
  if (monthKey < current) return "past";
  if (monthKey > current) return "future";
  return "current";
}

export function getPreviousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

export function getLastDateOfMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return getLocalDateString(new Date(year, month, 0));
}

export function getDefaultTransactionDate(selectedMonth, selectedCalendarDate) {
  if (getMonthRelation(selectedMonth) === "future") return null;
  if (selectedCalendarDate && isValidDateString(selectedCalendarDate) && !isFutureDate(selectedCalendarDate)) return selectedCalendarDate;
  return getMonthRelation(selectedMonth) === "past" ? getLastDateOfMonth(selectedMonth) : getLocalDateString();
}

export function getMonthTransactions(data, monthKey) {
  return data.transactions.filter((transaction) => transaction.date.slice(0, 7) === monthKey);
}

export function sumAmounts(transactions, recordType) {
  return transactions.filter((transaction) => transaction.recordType === recordType).reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function isLargeExpense(transaction, threshold) {
  return transaction.recordType === "expense" && transaction.amount >= threshold;
}

export function getMonthlySummary(data, monthKey) {
  const transactions = getMonthTransactions(data, monthKey);
  const income = sumAmounts(transactions, "income");
  const expense = sumAmounts(transactions, "expense");
  const saving = sumAmounts(transactions, "saving");
  const netChange = income - expense - saving;
  const setting = data.monthSettings[monthKey];
  const hasStartingBalance = Boolean(setting);
  const startingAvailableBalance = hasStartingBalance ? setting.startingAvailableBalance : null;
  const availableBalance = hasStartingBalance ? startingAvailableBalance + netChange : null;
  const counts = {
    income: transactions.filter((item) => item.recordType === "income").length,
    expense: transactions.filter((item) => item.recordType === "expense").length,
    saving: transactions.filter((item) => item.recordType === "saving").length
  };
  const largeExpenses = transactions.filter((transaction) => isLargeExpense(transaction, data.settings.largeExpenseThreshold));
  return {
    transactions,
    income,
    expense,
    saving,
    netChange,
    hasStartingBalance,
    startingAvailableBalance,
    availableBalance,
    counts,
    largeExpenses,
    largeExpenseAmount: largeExpenses.reduce((sum, item) => sum + item.amount, 0)
  };
}

export function getAutoGardenGroup(transaction, settings) {
  if (transaction.recordType === "income") return "income";
  if (transaction.recordType === "saving") return "saving";
  if (transaction.amount < settings.smallExpenseThreshold) return "small-expense";
  if (transaction.amount < settings.largeExpenseThreshold) return "medium-expense";
  return "large-expense";
}

export function getAutoGardenSummary(data, monthKey) {
  const transactions = getMonthTransactions(data, monthKey);
  return AUTO_GARDEN_GROUPS.map((group) => {
    const matching = transactions.filter((transaction) => getAutoGardenGroup(transaction, data.settings) === group);
    return {
      group,
      ...AUTO_GARDEN_META[group],
      count: matching.length,
      amount: matching.reduce((sum, transaction) => sum + transaction.amount, 0),
      transactions: matching
    };
  });
}

export function getAutoGardenItem(data, monthKey, group) {
  return getAutoGardenSummary(data, monthKey).find((item) => item.group === group) || null;
}

function cappedCount(count, rules) {
  for (const rule of rules) {
    if (count <= rule.max) return rule.images;
  }
  return rules.at(-1).images;
}

export function getGardenImageCount(group, count) {
  if (group === "small-expense") return cappedCount(count, [
    { max: 0, images: 0 }, { max: 3, images: 1 }, { max: 7, images: 2 }, { max: 12, images: 3 }, { max: 20, images: 4 }, { max: Infinity, images: 5 }
  ]);
  if (group === "medium-expense") return cappedCount(count, [
    { max: 0, images: 0 }, { max: 2, images: 1 }, { max: 5, images: 2 }, { max: 9, images: 3 }, { max: Infinity, images: 4 }
  ]);
  if (group === "large-expense") return Math.min(4, count);
  if (group === "saving") return cappedCount(count, [
    { max: 0, images: 0 }, { max: 3, images: 1 }, { max: 7, images: 2 }, { max: 12, images: 3 }, { max: Infinity, images: 4 }
  ]);
  return 0;
}

function hashText(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const POSITIONS = {
  "small-expense": [
    { left: 15, bottom: 14, width: 18 }, { left: 35, bottom: 17, width: 16 }, { left: 52, bottom: 12, width: 18 }, { left: 69, bottom: 18, width: 15 }, { left: 82, bottom: 13, width: 17 }
  ],
  "medium-expense": [
    { left: 25, bottom: 13, width: 27 }, { left: 58, bottom: 11, width: 28 }, { left: 74, bottom: 15, width: 24 }, { left: 43, bottom: 14, width: 23 }
  ],
  "large-expense": [
    { left: 8, bottom: 13, width: 33 }, { left: 72, bottom: 12, width: 31 }, { left: 45, bottom: 18, width: 28 }, { left: 55, bottom: 13, width: 28 }
  ],
  saving: [
    { left: 16, bottom: 9, width: 12 }, { left: 42, bottom: 8, width: 11 }, { left: 64, bottom: 9, width: 12 }, { left: 82, bottom: 8, width: 11 }
  ]
};

function assetListForGroup(group) {
  if (group === "small-expense") return GARDEN_ASSETS.flowers;
  if (group === "medium-expense") return GARDEN_ASSETS.shrubs;
  if (group === "large-expense") return GARDEN_ASSETS.trees;
  if (group === "saving") return GARDEN_ASSETS.seeds;
  return [];
}

export function getGardenVisualPlan(data, monthKey) {
  const summary = getAutoGardenSummary(data, monthKey);
  const items = [];
  for (const item of summary) {
    if (item.group === "income") continue;
    const count = getGardenImageCount(item.group, item.count);
    const positions = POSITIONS[item.group];
    const assets = assetListForGroup(item.group);
    for (let index = 0; index < count; index += 1) {
      const seed = hashText(`${monthKey}-${item.group}-${index}`);
      const position = positions[index % positions.length];
      items.push({
        group: item.group,
        src: assets[seed % assets.length],
        left: position.left,
        bottom: position.bottom,
        width: position.width,
        alt: `${item.label} ${index + 1}`
      });
    }
  }
  const income = summary.find((item) => item.group === "income");
  return {
    ground: GARDEN_ASSETS.ground,
    plants: items,
    showWater: income?.count > 0,
    showSunlight: Boolean(income && income.amount >= data.settings.largeExpenseThreshold),
    sunlight: GARDEN_ASSETS.sunlight,
    water: GARDEN_ASSETS.water,
    summary
  };
}

export function compareTransactions(left, right, sort = "newest") {
  const dateDescending = right.date.localeCompare(left.date);
  const dateAscending = left.date.localeCompare(right.date);
  const createdDescending = right.createdAt.localeCompare(left.createdAt);
  const createdAscending = left.createdAt.localeCompare(right.createdAt);
  const idCompare = left.id.localeCompare(right.id);
  if (sort === "oldest") return dateAscending || createdAscending || idCompare;
  if (sort === "amount-high") return right.amount - left.amount || dateDescending || createdDescending || idCompare;
  if (sort === "amount-low") return left.amount - right.amount || dateDescending || createdDescending || idCompare;
  return dateDescending || createdDescending || idCompare;
}

export function sortTransactions(transactions, sort = "newest") {
  return [...transactions].sort((left, right) => compareTransactions(left, right, sort));
}

export function groupTransactionsByDate(transactions, sort = "newest") {
  const groups = new Map();
  for (const transaction of sortTransactions(transactions, sort)) {
    if (!groups.has(transaction.date)) groups.set(transaction.date, []);
    groups.get(transaction.date).push(transaction);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, transactions: items }));
}

export function getDaySummary(data, dateString) {
  const transactions = data.transactions.filter((transaction) => transaction.date === dateString);
  return {
    transactions,
    income: sumAmounts(transactions, "income"),
    expense: sumAmounts(transactions, "expense"),
    saving: sumAmounts(transactions, "saving"),
    hasLargeExpense: transactions.some((transaction) => isLargeExpense(transaction, data.settings.largeExpenseThreshold))
  };
}

export function formatCurrency(amount) {
  return `${new Intl.NumberFormat("ko-KR").format(Math.abs(amount))}원`;
}

export function formatTransactionAmount(transaction) {
  return `${transaction.recordType === "income" ? "+" : "-"}${formatCurrency(transaction.amount)}`;
}

export function formatCompactCurrency(amount, type) {
  const sign = type === "income" ? "+" : "-";
  const absolute = Math.abs(amount);
  if (absolute < 1000) return `${sign}${absolute}원`;
  const value = absolute / 1000;
  return `${sign}${Number.isInteger(value) ? value : value.toFixed(1).replace(/\.0$/, "")}K`;
}

export function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

export function formatDateLabel(dateString, includeWeekday = true) {
  const date = parseLocalDate(dateString);
  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const base = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return includeWeekday ? `${base} ${weekdays[date.getDay()]}` : base;
}

export function getMonthCalendarCells(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const cells = [];
  for (let index = 0; index < first.getDay(); index += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 35) cells.push(null);
  return cells;
}

export function getMonthBalanceLabel(monthKey) {
  const relation = getMonthRelation(monthKey);
  if (relation === "past") return `${formatMonthLabel(monthKey)} 마감 가용 잔액`;
  if (relation === "future") return "시작 가용 잔액";
  return "현재 가용 잔액";
}

export function createUniqueId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
