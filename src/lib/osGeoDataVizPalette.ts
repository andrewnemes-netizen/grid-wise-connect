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
 * Get a layer colour from the OS qualitative palette by index,
 * with a fallback to the category colour.
 */
export function getOsLayerColor(category: string, index: number): string {
  const base = OS_CATEGORY_COLORS[category];
  if (base && index === 0) return base;
  return OS_QUALITATIVE[index % OS_QUALITATIVE.length];
}
