export const APP_STORAGE_KEY = "flower-budget-app-data-v1";
export const SCHEMA_VERSION = 2;

export const INCOME_CATEGORIES = ["용돈", "알바비", "선물 받은 돈", "환불", "중고 판매", "기타 수입"];
export const EXPENSE_CATEGORIES = ["식비", "교통비", "카페 / 간식", "취미", "게임", "쇼핑", "교육", "생활용품", "선물", "큰 물건 구매", "기타"];
export const INCOME_METHODS = ["현금", "계좌이체", "카카오페이", "토스", "기타"];
export const EXPENSE_METHODS = ["현금", "체크카드", "신용카드", "계좌이체", "카카오페이", "토스", "기타"];
export const SAVING_METHODS = ["저축 통장", "현금 보관", "적금", "기타"];

export const RECORD_TYPES = {
  income: "수입",
  expense: "지출",
  saving: "저축"
};

export const DEFAULT_SMALL_EXPENSE_THRESHOLD = 10000;
export const DEFAULT_LARGE_EXPENSE_THRESHOLD = 50000;

export const AUTO_GARDEN_META = {
  income: {
    label: "햇빛과 물",
    shortLabel: "수입",
    meaning: "이번 달 정원에 들어온 수입",
    className: "garden-income",
    buttonLabel: "수입 기록 보기"
  },
  "small-expense": {
    label: "작은 꽃",
    shortLabel: "소액 지출",
    meaning: "가볍게 쌓인 소비",
    className: "garden-small",
    buttonLabel: "작은 지출 보기"
  },
  "medium-expense": {
    label: "관목",
    shortLabel: "중간 지출",
    meaning: "존재감 있는 소비",
    className: "garden-medium",
    buttonLabel: "중간 지출 보기"
  },
  "large-expense": {
    label: "나무",
    shortLabel: "큰 지출",
    meaning: "이번 달에 존재감이 큰 소비",
    className: "garden-large",
    buttonLabel: "큰 지출 보기"
  },
  saving: {
    label: "씨앗",
    shortLabel: "저축",
    meaning: "따로 심어 둔 돈",
    className: "garden-saving",
    buttonLabel: "저축 보기"
  }
};

export const AUTO_GARDEN_GROUPS = ["small-expense", "medium-expense", "large-expense", "saving", "income"];

export const GARDEN_ASSETS = {
  ground: "./assets/garden/ground.svg",
  flowers: [
    "./assets/garden/flower-01.svg",
    "./assets/garden/flower-02.svg",
    "./assets/garden/flower-03.svg"
  ],
  shrubs: ["./assets/garden/shrub-01.svg", "./assets/garden/shrub-02.svg"],
  trees: ["./assets/garden/tree-01.svg", "./assets/garden/tree-02.svg"],
  seeds: ["./assets/garden/seed-01.svg", "./assets/garden/seed-02.svg"],
  sunlight: "./assets/garden/sunlight.svg",
  water: "./assets/garden/water-drop.svg"
};

export function createDefaultAppData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      smallExpenseThreshold: DEFAULT_SMALL_EXPENSE_THRESHOLD,
      largeExpenseThreshold: DEFAULT_LARGE_EXPENSE_THRESHOLD
    },
    monthSettings: {},
    transactions: []
  };
}
