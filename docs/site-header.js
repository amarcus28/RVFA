const LEAGUE_PAGES = new Set(["overall.html", "premier-league.html", "championship.html"]);

function currentHtmlFile() {
  const path = window.location.pathname;
  const segment = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;

  return segment && segment.includes(".") ? segment : "index.html";
}

function initSiteNavJump() {
  const select = document.getElementById("site-nav-jump");
  if (!select) {
    return;
  }

  const file = currentHtmlFile();

  if (LEAGUE_PAGES.has(file)) {
    const match = `./${file}`;
    const index = [...select.options].findIndex((option) => option.value === match);

    if (index >= 0) {
      select.selectedIndex = index;
    }
  }

  select.addEventListener("change", () => {
    const url = select.value;

    if (url) {
      window.location.href = url;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSiteNavJump);
} else {
  initSiteNavJump();
}
