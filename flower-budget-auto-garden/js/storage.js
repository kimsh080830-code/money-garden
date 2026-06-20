import {
  APP_STORAGE_KEY,
  SCHEMA_VERSION,
  createDefaultAppData,
  DEFAULT_LARGE_EXPENSE_THRESHOLD,
  DEFAULT_SMALL_EXPENSE_THRESHOLD,
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  INCOME_CATEGORIES,
  INCOME_METHODS,
  SAVING_METHODS
} from "./constants.js";
import { isFutureDate, isValidDateString, isValidMonthKey } from "./finance.js";

function isSafePositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isSafeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidCreatedAt(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeSchemaOne(candidate) {
  const transactions = Array.isArray(candidate.transactions)
    ? candidate.transactions.map((transaction) => {
      const { gardenType, ...rest } = transaction || {};
      return rest;
    })
    : candidate.transactions;

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      smallExpenseThreshold: DEFAULT_SMALL_EXPENSE_THRESHOLD,
      largeExpenseThreshold: candidate?.settings?.largeExpenseThreshold ?? DEFAULT_LARGE_EXPENSE_THRESHOLD
    },
    monthSettings: candidate?.monthSettings,
    transactions
  };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, error: "JSON 최상위 데이터 형식이 올바르지 않습니다." };
  }
  if (candidate.schemaVersion === 1) {
    return { ok: true, data: normalizeSchemaOne(candidate), migrated: true };
  }
  if (candidate.schemaVersion === SCHEMA_VERSION) {
    return { ok: true, data: candidate, migrated: false };
  }
  return { ok: false, error: "지원하지 않는 데이터 버전입니다." };
}

function validateTransaction(transaction) {
  if (!transaction || typeof transaction !== "object") return "거래 형식이 올바르지 않습니다.";
  if (!isNonEmptyString(transaction.id)) return "거래 ID가 올바르지 않습니다.";
  if (!Object.prototype.hasOwnProperty.call({ income: true, expense: true, saving: true }, transaction.recordType)) return "거래 유형이 올바르지 않습니다.";
  if (!isSafePositiveInteger(transaction.amount)) return "거래 금액이 올바르지 않습니다.";
  if (!isValidDateString(transaction.date) || isFutureDate(transaction.date)) return "거래 날짜가 올바르지 않습니다.";
  if (!isValidCreatedAt(transaction.createdAt)) return "생성 시각이 올바르지 않습니다.";
  if (!isNonEmptyString(transaction.category) || !isNonEmptyString(transaction.method)) return "카테고리 또는 방식이 올바르지 않습니다.";
  if (typeof transaction.memo !== "string") return "메모 형식이 올바르지 않습니다.";

  if (transaction.recordType === "income") {
    if (!INCOME_CATEGORIES.includes(transaction.category) || !INCOME_METHODS.includes(transaction.method)) {
      return "수입 카테고리 또는 방식이 올바르지 않습니다.";
    }
  }
  if (transaction.recordType === "expense") {
    if (!EXPENSE_CATEGORIES.includes(transaction.category) || !EXPENSE_METHODS.includes(transaction.method)) {
      return "지출 카테고리 또는 방식이 올바르지 않습니다.";
    }
  }
  if (transaction.recordType === "saving" && !SAVING_METHODS.includes(transaction.method)) {
    return "저축 보관 방식이 올바르지 않습니다.";
  }
  return null;
}

export function validateAppData(candidate) {
  const normalized = normalizeCandidate(candidate);
  if (!normalized.ok) return { valid: false, error: normalized.error };
  const data = normalized.data;

  if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
    return { valid: false, error: "설정 정보가 올바르지 않습니다." };
  }
  if (!isSafePositiveInteger(data.settings.smallExpenseThreshold) || !isSafePositiveInteger(data.settings.largeExpenseThreshold)) {
    return { valid: false, error: "정원 기준 금액이 올바르지 않습니다." };
  }
  if (data.settings.smallExpenseThreshold >= data.settings.largeExpenseThreshold) {
    return { valid: false, error: "소액 지출 기준은 큰 지출 기준보다 작아야 합니다." };
  }
  if (!data.monthSettings || typeof data.monthSettings !== "object" || Array.isArray(data.monthSettings)) {
    return { valid: false, error: "월별 설정이 올바르지 않습니다." };
  }
  if (!Array.isArray(data.transactions)) {
    return { valid: false, error: "거래 목록이 올바르지 않습니다." };
  }

  for (const [monthKey, setting] of Object.entries(data.monthSettings)) {
    if (!isValidMonthKey(monthKey) || !setting || typeof setting !== "object") {
      return { valid: false, error: "월별 시작 가용 잔액 정보가 올바르지 않습니다." };
    }
    if (!isSafeNonNegativeInteger(setting.startingAvailableBalance) || typeof setting.isManuallySet !== "boolean") {
      return { valid: false, error: "시작 가용 잔액 정보가 올바르지 않습니다." };
    }
  }

  const ids = new Set();
  for (const transaction of data.transactions) {
    const error = validateTransaction(transaction);
    if (error) return { valid: false, error };
    if (ids.has(transaction.id)) return { valid: false, error: "JSON 파일 안에 중복된 거래 ID가 있습니다." };
    ids.add(transaction.id);
  }

  return { valid: true, data, migrated: normalized.migrated };
}

export function loadAppData() {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return { ok: true, data: createDefaultAppData(), recovered: false, migrated: false };
    const validation = validateAppData(JSON.parse(raw));
    if (!validation.valid) return { ok: false, data: createDefaultAppData(), recovered: true, migrated: false, error: validation.error };
    return { ok: true, data: validation.data, recovered: false, migrated: validation.migrated };
  } catch {
    return { ok: false, data: createDefaultAppData(), recovered: true, migrated: false, error: "저장된 데이터를 읽지 못했습니다." };
  }
}

export function saveAppData(data) {
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return { ok: false, error: "브라우저에 저장하지 못했어. 저장 공간 또는 브라우저 설정을 확인해 주세요." };
  }
}

export function clearStoredAppData() {
  try {
    localStorage.removeItem(APP_STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: "브라우저 저장 데이터를 삭제하지 못했어." };
  }
}

export function mergeAppData(currentData, importedData) {
  const currentIds = new Set(currentData.transactions.map((transaction) => transaction.id));
  const importedTransactions = importedData.transactions.filter((transaction) => !currentIds.has(transaction.id));
  const importedMonthSettings = {};
  for (const [monthKey, setting] of Object.entries(importedData.monthSettings)) {
    if (!currentData.monthSettings[monthKey]) importedMonthSettings[monthKey] = setting;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      smallExpenseThreshold: currentData.settings.smallExpenseThreshold || DEFAULT_SMALL_EXPENSE_THRESHOLD,
      largeExpenseThreshold: currentData.settings.largeExpenseThreshold || DEFAULT_LARGE_EXPENSE_THRESHOLD
    },
    monthSettings: { ...currentData.monthSettings, ...importedMonthSettings },
    transactions: [...currentData.transactions, ...importedTransactions]
  };
}

export function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const datePart = new Date().toLocaleDateString("en-CA").replaceAll("/", "-");
  anchor.href = url;
  anchor.download = `flower-budget-backup-${datePart}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file) {
  if (!file) return { ok: false, error: "파일을 선택해 주세요." };
  try {
    const validation = validateAppData(JSON.parse(await file.text()));
    return validation.valid ? { ok: true, data: validation.data, migrated: validation.migrated } : { ok: false, error: validation.error };
  } catch {
    return { ok: false, error: "JSON 파일을 읽지 못했습니다." };
  }
}
