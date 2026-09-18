const root = document.documentElement;
const toggle = document.querySelector("[data-theme-toggle]");

const updateToggle = (theme) => {
  const next = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;
  toggle.setAttribute("aria-label", label);
  toggle.setAttribute("title", label);
  toggle.setAttribute("aria-pressed", theme === "dark");
};

updateToggle(root.dataset.theme);

toggle.addEventListener("click", () => {
  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = theme;
  localStorage.setItem("opalin-theme", theme);
  location.reload();
});
