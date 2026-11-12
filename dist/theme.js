const themePreferenceKey = "portfolio-color-theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let themePreference = readThemePreference();

function readThemePreference() {
  try {
    return localStorage.getItem(themePreferenceKey);
  } catch {
    return null;
  }
}

function applyTheme() {
  const dark = themePreference ? themePreference === "dark" : systemTheme.matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector(".theme-toggle")?.setAttribute("aria-pressed", String(dark));
}

applyTheme();
systemTheme.addEventListener("change", applyTheme);

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    themePreference = readThemePreference() ?? themePreference;
    applyTheme();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();

  document.querySelector(".theme-toggle")?.addEventListener("click", () => {
    themePreference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme();

    try {
      localStorage.setItem(themePreferenceKey, themePreference);
    } catch {
      // The current page still uses the selected theme if storage is unavailable.
    }
  });

  const about = document.querySelector("#about");
  document.querySelector("#about-open")?.addEventListener("click", () => about.showModal());
});
