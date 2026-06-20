import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  INCOME_CATEGORIES,
  INCOME_METHODS,
  SAVING_METHODS,
  createDefaultAppData
} from "./constants.js";
import {
  createUniqueId,
  getDefaultTransactionDate,
  getMonthRelation,
  getMonthlySummary,
  getPreviousMonthKey,
  isFutureDate,
  isValidDateString,
  shiftMonth
} from "./finance.js";
import {
  clearStoredAppData,
  downloadBackup,
  loadAppData,
  mergeAppData,
  readJsonFile,
  saveAppData
} from "./storage.js";
import {
  closeOverlay,
  goBackOverlay,
  openOverlay,
  resetLedgerControls,
  resetViewState,
  setAppData,
  setSelectedMonth,
  state
} from "./state.js";
import {
  createTransactionDraft,
  readTransactionDraft,
  renderActiveView,
  renderOverlay,
  showToast,
  transformTransactionDraft
} from "./ui.js";

const importInput = document.querySelector("#import-file");

function snapshotOverlay() {
  if (!state.overlay) return null;
  return { type: state.overlay.type, payload: { ...state.overlay.payload }, back: state.overlay.back || null };
}

function renderAll() {
  renderActiveView(state, state.appData);
  renderOverlay(state, state.appData);
}

function renderViewOnly() {
  renderActiveView(state, state.appData);
}

function persistAndRender(message = "") {
  const result = saveAppData(state.appData);
  renderAll();
  if (!result.ok) return showToast(result.error, "error");
  if (message) showToast(message);
}

function parseIntegerInput(value, allowZero = false) {
  const raw = String(value ?? "").replaceAll(",", "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || (allowZero ? amount < 0 : amount <= 0)) return null;
  return amount;
}

function getTransactionById(id) {
  return state.appData.transactions.find((transaction) => transaction.id === id) || null;
}

function updateSelectedMonth(delta) {
  setSelectedMonth(shiftMonth(state.selectedMonth, delta));
  renderAll();
}

function openTransactionTypePicker() {
  if (getMonthRelation(state.selectedMonth) === "future") return showToast("미래 월에는 거래를 기록할 수 없어.", "error");
  if (state.selectedCalendarDate && isFutureDate(state.selectedCalendarDate)) return showToast("미래 날짜에는 거래를 기록할 수 없어.", "error");
  openOverlay("transaction-type", {}, snapshotOverlay());
  renderOverlay(state, state.appData);
}

function openNewTransactionForm(recordType, back = null) {
  const defaultDate = getDefaultTransactionDate(state.selectedMonth, state.selectedCalendarDate);
  if (!defaultDate) return showToast("미래 월에는 거래를 기록할 수 없어.", "error");
  openOverlay("transaction-form", { mode: "add", recordType, draft: createTransactionDraft(recordType, defaultDate) }, back);
  renderOverlay(state, state.appData);
}

function openEditTransactionForm(transactionId) {
  const transaction = getTransactionById(transactionId);
  if (!transaction) return showToast("거래를 찾을 수 없어.", "error");
  const draft = createTransactionDraft(transaction.recordType, transaction.date, {
    amount: String(transaction.amount), date: transaction.date, category: transaction.category, method: transaction.method, memo: transaction.memo
  });
  openOverlay("transaction-form", { mode: "edit", transactionId: transaction.id, recordType: transaction.recordType, draft }, snapshotOverlay());
  renderOverlay(state, state.appData);
}

function validateTransactionDraft(draft) {
  const amount = parseIntegerInput(draft.amount);
  if (amount === null) return { valid: false, message: "금액을 입력해 주세요." };
  if (!draft.date) return { valid: false, message: "거래 날짜를 선택해 주세요." };
  if (!isValidDateString(draft.date) || isFutureDate(draft.date)) return { valid: false, message: "오늘 또는 과거의 실제 날짜만 저장할 수 있어." };
  if (!draft.category.trim()) return { valid: false, message: "카테고리를 선택해 주세요." };
  if (!draft.method.trim()) return { valid: false, message: "방식을 선택해 주세요." };
  if (draft.recordType === "income" && (!INCOME_CATEGORIES.includes(draft.category) || !INCOME_METHODS.includes(draft.method))) return { valid: false, message: "수입 카테고리와 방식을 선택해 주세요." };
  if (draft.recordType === "expense" && (!EXPENSE_CATEGORIES.includes(draft.category) || !EXPENSE_METHODS.includes(draft.method))) return { valid: false, message: "카테고리와 결제 수단을 선택해 주세요." };
  if (draft.recordType === "saving" && !SAVING_METHODS.includes(draft.method)) return { valid: false, message: "방식을 선택해 주세요." };
  if (!["income", "expense", "saving"].includes(draft.recordType)) return { valid: false, message: "거래 유형을 확인해 주세요." };
  return { valid: true, amount };
}

function submitTransactionForm(form) {
  const draft = readTransactionDraft(form);
  const validation = validateTransactionDraft(draft);
  if (!validation.valid) return showToast(validation.message, "error");
  const saveButton = form.querySelector("[data-save-button]");
  if (saveButton) saveButton.disabled = true;
  const original = form.dataset.mode === "edit" ? getTransactionById(form.dataset.transactionId) : null;
  if (form.dataset.mode === "edit" && !original) {
    if (saveButton) saveButton.disabled = false;
    return showToast("수정할 거래를 찾을 수 없어.", "error");
  }
  const transaction = {
    id: original?.id || createUniqueId(),
    recordType: draft.recordType,
    amount: validation.amount,
    date: draft.date,
    category: draft.category.trim(),
    method: draft.method.trim(),
    memo: draft.memo,
    createdAt: original?.createdAt || new Date().toISOString()
  };
  if (original) {
    state.appData.transactions = state.appData.transactions.map((item) => item.id === original.id ? transaction : item);
    closeOverlay();
    persistAndRender("거래가 수정되었습니다.");
  } else {
    state.appData.transactions = [...state.appData.transactions, transaction];
    closeOverlay();
    persistAndRender(draft.recordType === "income" ? "수입이 기록되었습니다." : draft.recordType === "saving" ? "저축이 기록되었습니다." : "지출이 기록되었습니다.");
  }
}

function submitStartBalanceForm(form) {
  const amount = parseIntegerInput(new FormData(form).get("startingAvailableBalance"), true);
  if (amount === null) return showToast("0원 이상의 정수로 시작 가용 잔액을 입력해 주세요.", "error");
  const previous = getMonthlySummary(state.appData, getPreviousMonthKey(state.selectedMonth));
  state.appData.monthSettings[state.selectedMonth] = {
    startingAvailableBalance: amount,
    isManuallySet: !(form.dataset.usePreviousBalance === "true" && previous.hasStartingBalance && amount === previous.availableBalance)
  };
  closeOverlay();
  persistAndRender("시작 가용 잔액이 저장되었습니다.");
}

function submitGardenThresholdForm(form) {
  const formData = new FormData(form);
  const small = parseIntegerInput(formData.get("smallExpenseThreshold"));
  const large = parseIntegerInput(formData.get("largeExpenseThreshold"));
  if (small === null || large === null) return showToast("기준 금액은 1원 이상의 정수로 입력해 주세요.", "error");
  if (small >= large) return showToast("소액 지출 기준은 큰 지출 기준보다 작아야 해.", "error");
  state.appData.settings.smallExpenseThreshold = small;
  state.appData.settings.largeExpenseThreshold = large;
  closeOverlay();
  persistAndRender("정원 자동 분류 기준이 저장되었습니다.");
}

function applyImportedData(mode) {
  if (!state.pendingImportData) return showToast("불러올 데이터를 찾지 못했어.", "error");
  setAppData(mode === "overwrite" ? state.pendingImportData : mergeAppData(state.appData, state.pendingImportData));
  resetViewState();
  persistAndRender(mode === "overwrite" ? "JSON 데이터를 덮어썼습니다." : "JSON 데이터를 합쳤습니다.");
}

function openSettings() { openOverlay("settings"); renderOverlay(state, state.appData); }
function openStartBalance() { openOverlay("start-balance", {}, snapshotOverlay()); renderOverlay(state, state.appData); }
function openGardenThresholds() { openOverlay("garden-thresholds", {}, snapshotOverlay()); renderOverlay(state, state.appData); }

function openTransactionDetail(transactionId) {
  if (!getTransactionById(transactionId)) return showToast("거래를 찾을 수 없어.", "error");
  openOverlay("transaction-detail", { transactionId }, snapshotOverlay());
  renderOverlay(state, state.appData);
}

function openCalendarDate(date) {
  if (getMonthRelation(state.selectedMonth) === "future" || isFutureDate(date)) return showToast("미래 날짜에는 거래를 기록할 수 없어.", "error");
  state.selectedCalendarDate = date;
  openOverlay("date-detail", { date });
  renderAll();
}

function openGardenDetail(gardenGroup) {
  openOverlay("garden-detail", { gardenGroup }, snapshotOverlay());
  renderOverlay(state, state.appData);
}

function moveToLedger(options = {}) {
  state.activeTab = "ledger";
  resetLedgerControls();
  if (options.largeOnly) {
    state.filters.recordType = "expense";
    state.filters.largeOnly = true;
  }
  renderAll();
}

function handleAction(element) {
  switch (element.dataset.action) {
    case "switch-tab": state.activeTab = element.dataset.tab; closeOverlay(); renderAll(); break;
    case "month-prev": updateSelectedMonth(-1); break;
    case "month-next": updateSelectedMonth(1); break;
    case "open-settings": openSettings(); break;
    case "open-add-transaction": openTransactionTypePicker(); break;
    case "choose-record-type": openNewTransactionForm(element.dataset.recordType, snapshotOverlay()); break;
    case "change-transaction-type": {
      const form = element.closest(".overlay-body")?.querySelector("#transaction-form");
      if (!form) break;
      const draft = transformTransactionDraft(readTransactionDraft(form), element.dataset.recordType);
      openOverlay("transaction-form", { mode: form.dataset.mode, transactionId: form.dataset.transactionId || "", recordType: draft.recordType, draft }, state.overlay?.back || null);
      renderOverlay(state, state.appData);
      break;
    }
    case "open-transaction": openTransactionDetail(element.dataset.transactionId); break;
    case "edit-transaction": openEditTransactionForm(element.dataset.transactionId); break;
    case "confirm-transaction-delete": openOverlay("confirm-transaction-delete", { transactionId: element.dataset.transactionId }, snapshotOverlay()); renderOverlay(state, state.appData); break;
    case "delete-transaction": state.appData.transactions = state.appData.transactions.filter((transaction) => transaction.id !== element.dataset.transactionId); closeOverlay(); persistAndRender("거래가 삭제되었습니다."); break;
    case "open-calendar-date": openCalendarDate(element.dataset.date); break;
    case "open-garden-detail": openGardenDetail(element.dataset.gardenGroup); break;
    case "show-all-ledger": moveToLedger(); break;
    case "show-large-ledger": moveToLedger({ largeOnly: true }); break;
    case "go-garden": state.activeTab = "garden"; closeOverlay(); renderAll(); break;
    case "reset-ledger-controls": resetLedgerControls(); renderViewOnly(); break;
    case "close-overlay": closeOverlay(); renderOverlay(state, state.appData); break;
    case "back-overlay": goBackOverlay(); renderOverlay(state, state.appData); break;
    case "edit-start-balance": openStartBalance(); break;
    case "fill-prev-balance": {
      const previous = getMonthlySummary(state.appData, getPreviousMonthKey(state.selectedMonth));
      const field = document.querySelector('#start-balance-form [name="startingAvailableBalance"]');
      if (previous.hasStartingBalance && field instanceof HTMLInputElement) {
        field.value = String(previous.availableBalance);
        const form = field.closest("form");
        if (form) form.dataset.usePreviousBalance = "true";
      }
      break;
    }
    case "edit-garden-thresholds": openGardenThresholds(); break;
    case "export-json": downloadBackup(state.appData); showToast("JSON 백업 파일을 만들었습니다."); break;
    case "trigger-import": importInput.value = ""; importInput.click(); break;
    case "confirm-delete-all": openOverlay("confirm-delete-all", {}, snapshotOverlay()); renderOverlay(state, state.appData); break;
    case "delete-all-data": {
      setAppData(createDefaultAppData());
      resetViewState();
      const cleared = clearStoredAppData();
      renderAll();
      showToast(cleared.ok ? "모든 데이터가 삭제되었습니다." : cleared.error, cleared.ok ? "normal" : "error");
      break;
    }
    case "import-overwrite": applyImportedData("overwrite"); break;
    case "import-merge": applyImportedData("merge"); break;
    default: break;
  }
}

function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.filter) {
    const key = target.dataset.filter;
    state.filters[key] = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
    renderViewOnly();
  }
  if (target.dataset.sort) {
    state.sort = target.value;
    renderViewOnly();
  }
}

function handleInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.name === "startingAvailableBalance") {
    const form = target.closest("form");
    if (form) form.dataset.usePreviousBalance = "false";
  }
  if (!target.dataset.ledgerSearch) return;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  state.searchQuery = target.value;
  renderViewOnly();
  const next = document.querySelector("[data-ledger-search]");
  if (next instanceof HTMLInputElement) {
    next.focus();
    next.setSelectionRange(start ?? next.value.length, end ?? next.value.length);
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches("#transaction-form, #start-balance-form, #garden-threshold-form")) return;
  event.preventDefault();
  if (form.id === "transaction-form") submitTransactionForm(form);
  if (form.id === "start-balance-form") submitStartBalanceForm(form);
  if (form.id === "garden-threshold-form") submitGardenThresholdForm(form);
}

async function handleImportFile(event) {
  const result = await readJsonFile(event.target.files?.[0]);
  if (!result.ok) return showToast(result.error, "error");
  state.pendingImportData = result.data;
  openOverlay("import-choice", {}, snapshotOverlay());
  renderOverlay(state, state.appData);
}

function trapOverlayFocus(event) {
  if (event.key !== "Tab" || !state.overlay) return;
  const dialog = document.querySelector(".overlay-dialog");
  if (!dialog) return;
  const items = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((node) => node.offsetParent !== null);
  if (!items.length) return;
  if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
  if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
}

function initialize() {
  const loaded = loadAppData();
  setAppData(loaded.data);
  if (loaded.migrated) saveAppData(state.appData);
  renderAll();
  if (loaded.recovered) showToast("저장된 데이터에 문제가 있어 빈 가계부로 시작했어.", "error");
  if (loaded.migrated) showToast("기존 기록을 자동 정원 방식으로 전환했어.");
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.matches("[data-overlay-backdrop]")) { closeOverlay(); renderOverlay(state, state.appData); return; }
  const action = target.closest("[data-action]");
  if (action instanceof HTMLElement) handleAction(action);
});
document.addEventListener("change", handleChange);
document.addEventListener("input", handleInput);
document.addEventListener("submit", handleSubmit);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.overlay) { closeOverlay(); renderOverlay(state, state.appData); return; }
  trapOverlayFocus(event);
});
importInput.addEventListener("change", handleImportFile);

initialize();
