import { createDefaultAppData } from "./constants.js";
import { getLocalMonthString } from "./finance.js";

export const state = {
  appData: createDefaultAppData(),
  activeTab: "home",
  selectedMonth: getLocalMonthString(),
  searchQuery: "",
  filters: {
    recordType: "all",
    category: "all",
    method: "all",
    largeOnly: false
  },
  sort: "newest",
  selectedCalendarDate: null,
  overlay: null,
  pendingImportData: null
};

export function setAppData(nextData) {
  state.appData = nextData;
}

export function resetLedgerControls() {
  state.searchQuery = "";
  state.filters = {
    recordType: "all",
    category: "all",
    method: "all",
    largeOnly: false
  };
  state.sort = "newest";
}

export function resetViewState() {
  state.activeTab = "home";
  state.selectedMonth = getLocalMonthString();
  state.selectedCalendarDate = null;
  state.overlay = null;
  state.pendingImportData = null;
  resetLedgerControls();
}

export function setSelectedMonth(monthKey) {
  state.selectedMonth = monthKey;
  state.selectedCalendarDate = null;
  state.overlay = null;
}

export function openOverlay(type, payload = {}, back = null) {
  state.overlay = { type, payload, back };
}

export function closeOverlay() {
  state.overlay = null;
}

export function goBackOverlay() {
  state.overlay = state.overlay?.back || null;
}
