export type ColumnType =
  | "text"
  | "number"
  | "date"
  | "status"
  | "person"
  | "currency"
  | "checkbox"
  | "dropdown"
  | "formula"
  | "builtin";

export interface StatusOption {
  value: string;
  label: string;
  color: string; // hsl(var(--status-xxx)) or hex
}

export interface ColumnOptions {
  // status / dropdown
  options?: StatusOption[];
  // formula
  expression?: string;
  // builtin
  builtinKey?: string;
  // number/currency
  currency?: string;
  decimals?: number;
  // aggregation
  aggregate?: "sum" | "avg" | "count" | "none";
}

export interface BoardColumn {
  id: string;
  project_id: string;
  key: string;
  label: string;
  type: ColumnType;
  options_json: ColumnOptions;
  width: number;
  sort_index: number;
  is_system: boolean;
}

export interface BoardViewConfig {
  visibleColumns?: string[]; // column ids
  columnOrder?: string[];
  groupBy?: string | null; // column key
  sortBy?: { key: string; dir: "asc" | "desc" }[];
  filter?: string;
  search?: string;
}

export interface BoardView {
  id: string;
  project_id: string;
  user_id: string | null;
  name: string;
  is_default: boolean;
  config_json: BoardViewConfig;
}

export interface BoardAutomation {
  id: string;
  project_id: string;
  name: string;
  trigger_json: { type: "status_changes_to" | "percent_reaches_100"; status?: string };
  action_json: { type: "set_date_today" | "set_status"; column?: string; status?: string };
  enabled: boolean;
}

export const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  { value: "todo", label: "To do", color: "hsl(var(--status-todo))" },
  { value: "in_progress", label: "In progress", color: "hsl(var(--status-progress))" },
  { value: "review", label: "Review", color: "hsl(var(--status-review))" },
  { value: "blocked", label: "Blocked", color: "hsl(var(--status-blocked))" },
  { value: "done", label: "Done", color: "hsl(var(--status-done))" },
];

export const DEFAULT_PRIORITY_OPTIONS: StatusOption[] = [
  { value: "low", label: "Low", color: "hsl(var(--prio-low))" },
  { value: "medium", label: "Medium", color: "hsl(var(--prio-medium))" },
  { value: "high", label: "High", color: "hsl(var(--prio-high))" },
  { value: "critical", label: "Critical", color: "hsl(var(--prio-critical))" },
];

export const BUILTIN_COLUMNS: Omit<BoardColumn, "id" | "project_id">[] = [
  { key: "title", label: "Task", type: "builtin", options_json: { builtinKey: "title" }, width: 280, sort_index: 0, is_system: true },
  { key: "status", label: "Status", type: "builtin", options_json: { builtinKey: "status", options: DEFAULT_STATUS_OPTIONS }, width: 140, sort_index: 1, is_system: true },
  { key: "owner", label: "Owner", type: "builtin", options_json: { builtinKey: "owner" }, width: 120, sort_index: 2, is_system: true },
  { key: "priority", label: "Priority", type: "builtin", options_json: { builtinKey: "priority", options: DEFAULT_PRIORITY_OPTIONS }, width: 120, sort_index: 3, is_system: true },
  { key: "due_date", label: "Due", type: "builtin", options_json: { builtinKey: "due_date" }, width: 120, sort_index: 4, is_system: true },
  { key: "percent_complete", label: "Progress", type: "builtin", options_json: { builtinKey: "percent_complete", aggregate: "avg" }, width: 140, sort_index: 5, is_system: true },
  { key: "estimated_hours", label: "Est. hrs", type: "builtin", options_json: { builtinKey: "estimated_hours", aggregate: "sum" }, width: 100, sort_index: 6, is_system: true },
];