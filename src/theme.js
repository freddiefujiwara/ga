// Theme handling: same behavior as the health site (dark by default,
// data-theme="light" on <html>, the button label shows the target theme).
export const THEME_KEY = "ga-theme";

export function resolveTheme(stored) {
  return stored === "light" ? "light" : "dark";
}

export function nextTheme(theme) {
  return theme === "light" ? "dark" : "light";
}

export function applyTheme(root, button, theme) {
  if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    root.removeAttribute("data-theme");
  }
  button.textContent = theme === "light" ? "ダーク" : "ライト";
}
