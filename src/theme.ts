import { createContext, useContext } from "react";

export type ThemeId = "default" | "metal" | "tech";
export const THEME_STORAGE_KEY = "ecostation-ops-theme-v1";
export const THEMES: { id: ThemeId; name: string; description: string }[] = [
  { id: "default", name: "默认科研", description: "蓝白清晰 · 科研汇报" },
  { id: "metal", name: "金属灰", description: "银灰质感 · 稳重专业" },
  { id: "tech", name: "科技蓝", description: "深蓝层次 · 大屏展示" },
];
export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
function storedTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(value) ? value : "default";
  } catch {
    return "default";
  }
}
export const INITIAL_THEME = storedTheme();
document.documentElement.dataset.theme = INITIAL_THEME;
export const ThemeContext = createContext<ThemeId>(INITIAL_THEME);
export const useTheme = () => useContext(ThemeContext);
export function applyTheme(theme: ThemeId) {
  document.documentElement.classList.add("theme-changing");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "tech" ? "dark" : "light";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Color switching remains usable when storage is unavailable. */
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() =>
      document.documentElement.classList.remove("theme-changing"),
    );
  });
}

/** Canvas charts and map styles use the same CSS color tokens as the page. */
export function readVisualPalette() {
  const styles = getComputedStyle(document.documentElement);
  const color = (token: string, fallback: string) =>
    styles.getPropertyValue(`--theme-${token}`).trim() || fallback;
  return {
    text: color("text", "#223958"),
    heading: color("heading", "#123b8a"),
    muted: color("muted", "#64748b"),
    accent: color("accent", "#1677ff"),
    success: color("success", "#2e9d62"),
    warning: color("warning", "#ed8b2c"),
    surface: color("surface", "#ffffff"),
    border: color("border", "#dce7f4"),
    chartGrid: color("chart-grid", "#e9eff7"),
    chartArea: color("chart-area", "#e6f1ff"),
    chartAreaAlt: color("chart-area-alt", "#e9f4ff"),
    chartWarningArea: color("chart-warning-area", "rgba(237,139,44,.10)"),
    mapLand: color("map-land", "#eaf1ec"),
    mapOutline: color("map-outline", "#dbe5df"),
    mapWater: color("map-water", "#c9e5f3"),
    mapWaterOutline: color("map-water-outline", "#acd2e7"),
    mapRoad: color("map-road", "#bdcbd9"),
    mapRiver: color("map-river", "#a9d2e9"),
    mapBoundary: color("map-boundary", "#c1cdd9"),
    mapLabel: color("map-label", "#8a9aa9"),
    mapLabelHalo: color("map-label-halo", "#f8fbff"),
    mapMarkerBorder: color("map-marker-border", "#ffffff"),
    mapMarkerLabel: color("map-marker-label", "#4a627d"),
    mapUnknown: color("map-unknown", "#91a2b8"),
  };
}
