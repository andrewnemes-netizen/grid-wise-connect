/**
 * OS GeoDataViz Toolkit colour palettes.
 * Source: https://github.com/OrdnanceSurvey/GeoDataViz-Toolkit
 *
 * These palettes are designed for cartographic clarity and accessibility,
 * including colour-vision-deficiency (CVD) safe variants.
 */

/** Qualitative palette — distinct categories (up to 8) */
export const OS_QUALITATIVE = [
  "#FF1F5B", // 1 - magenta-red
  "#00CD6C", // 2 - green
  "#009ADE", // 3 - blue
  "#AF58BA", // 4 - purple
  "#FFC61E", // 5 - yellow
  "#F28522", // 6 - orange
  "#A0B1BA", // 7 - grey-blue
  "#A6761D", // 8 - brown
] as const;

/** Red-Amber-Green (RAG) status — standard & CVD-safe */
export const OS_RAG = {
  default: { red: "#E9002D", amber: "#FFAA00", green: "#00B000" },
  cvd:     { red: "#C40F5B", amber: "#FD8D3C", green: "#089099" },
} as const;

/** Sequential palettes — low-to-high gradients */
export const OS_SEQUENTIAL = {
  blue:     ["#E4F1F7", "#C5E1EF", "#9EC9E2", "#6CB0D6", "#3C93C2", "#226E9C", "#0D4A70"],
  green:    ["#E1F2E3", "#CDE5D2", "#9CCEA7", "#6CBA7D", "#40AD5A", "#228B3B", "#06592A"],
  pink:     ["#F9D8E6", "#F2ACCA", "#ED85B0", "#E95694", "#E32977", "#C40F5B", "#8F003B"],
  teal:     ["#B7E6A5", "#7CCBA2", "#46AEA0", "#089099", "#00718B", "#045275", "#003147"],
  warm:     ["#FCE1A4", "#FABF7B", "#F08F6E", "#E05C5C", "#D12959", "#AB1866", "#6E005F"],
  heat:     ["#FFF3B2", "#FED976", "#FEB24C", "#FD8D3C", "#FC4E2A", "#E31A1C", "#B10026"],
} as const;

/** Diverging palettes — bidirectional scales */
export const OS_DIVERGING = {
  tealOrange: ["#009392", "#39B185", "#9CCB86", "#E9E29C", "#EEB479", "#E88471", "#CF597E"],
  blueRed:    ["#045275", "#089099", "#7CCBA2", "#FCDE9C", "#F0746E", "#DC3977", "#7C1D6F"],
} as const;

/**
 * Semantic mapping for network infrastructure categories.
 * Uses OS GeoDataViz qualitative palette for maximum distinction.
 */
export const OS_CATEGORY_COLORS: Record<string, string> = {
  substations: "#009ADE",  // OS blue
  feeders:     "#AF58BA",  // OS purple
  cables:      "#F28522",  // OS orange
  constraints: "#A0B1BA",  // OS grey-blue
  points:      "#00CD6C",  // OS green
  polygons:    "#FFC61E",  // OS yellow
};

/**
 * Utilisation band colours using OS RAG palette.
 */
export const OS_UTILISATION_COLORS = {
  Low:           "#00B000",
  "Below Average": "#86C440",
  Average:       "#FFAA00",
  "Above Average": "#F28522",
  High:          "#E9002D",
} as const;

/**
 * Route classification colours for cable/route design.
 */
export const OS_ROUTE_COLORS = {
  lv:       "#00CD6C",  // green — low voltage
  hv:       "#009ADE",  // blue — high voltage
  ehv:      "#AF58BA",  // purple — extra-high voltage
  proposed: "#FFC61E",  // yellow — proposed routes
  existing: "#A0B1BA",  // grey — existing routes
  rejected: "#E9002D",  // red — rejected/infeasible
} as const;

/**
 * Constraint severity colours (RAG-based).
 */
export const OS_CONSTRAINT_SEVERITY = {
  blocker:  "#E9002D",  // red — hard constraint, route blocked
  warning:  "#FFAA00",  // amber — soft constraint, cost impact
  info:     "#009ADE",  // blue — informational
  clear:    "#00B000",  // green — no constraint
} as const;

/**
 * Scoring / feasibility gradient (7-step, green→red).
 */
export const OS_SCORING_GRADIENT = [
  "#00B000",  // 1 - excellent
  "#40AD5A",  // 2 - good
  "#86C440",  // 3 - above average
  "#FFAA00",  // 4 - average
  "#F28522",  // 5 - below average
  "#E9002D",  // 6 - poor
  "#8F003B",  // 7 - critical
] as const;

/**
 * Planning category colours.
 */
export const OS_PLANNING_COLORS: Record<string, string> = {
  residential:  "#FF1F5B",
  commercial:   "#009ADE",
  industrial:   "#F28522",
  mixed_use:    "#AF58BA",
  green_belt:   "#00CD6C",
  conservation: "#A6761D",
  flood_zone:   "#3C93C2",
  heritage:     "#FFC61E",
};

/**
 * Land ownership / registry colours.
 */
export const OS_LAND_COLORS: Record<string, string> = {
  freehold:     "#009ADE",
  leasehold:    "#AF58BA",
  commonhold:   "#00CD6C",
  crown:        "#FFC61E",
  unknown:      "#A0B1BA",
};

/**
 * Get a layer colour from the OS qualitative palette by index,
 * with a fallback to the category colour.
 */
export function getOsLayerColor(category: string, index: number): string {
  const base = OS_CATEGORY_COLORS[category];
  if (base && index === 0) return base;
  return OS_QUALITATIVE[index % OS_QUALITATIVE.length];
}

/**
 * Get scoring colour by normalised score (0-1).
 */
export function getScoreColor(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  const idx = Math.min(
    OS_SCORING_GRADIENT.length - 1,
    Math.floor(clamped * OS_SCORING_GRADIENT.length)
  );
  return OS_SCORING_GRADIENT[idx];
}

/**
 * Get constraint colour by severity level.
 */
export function getConstraintColor(severity: keyof typeof OS_CONSTRAINT_SEVERITY): string {
  return OS_CONSTRAINT_SEVERITY[severity] || OS_CONSTRAINT_SEVERITY.info;
}
