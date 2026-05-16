const dataUrl = "./data/rvfa.json";
const leagueUpdateUrl = "./data/league_updates/latest.md";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function formatCount(value, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const num = Number(value);

  if (!Number.isFinite(num)) {
    return fallback;
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}

function formatFixed(value, digits = 1, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const num = Number(value);

  if (!Number.isFinite(num)) {
    return fallback;
  }

  return num.toFixed(digits);
}

function fplTeamValueToMillion(value) {
  if (value == null || value === "") {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n / 10 : null;
}

function formatTopPercentOfAllManagers(overallRank, totalPlayers) {
  if (
    overallRank == null ||
    totalPlayers == null ||
    !Number.isFinite(Number(totalPlayers)) ||
    !Number.isFinite(Number(overallRank)) ||
    totalPlayers <= 0 ||
    overallRank <= 0
  ) {
    return null;
  }

  return formatFixed((overallRank / totalPlayers) * 100, 1);
}

function formatGeneratedAt(value) {
  if (!value) {
    return "No data fetched yet";
  }

  return `Updated ${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))}`;
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let listItems = [];

  function flushList() {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      listItems = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    flushList();

    if (trimmed.startsWith("### ")) {
      html.push(`<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith("## ")) {
      html.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("# ")) {
      html.push(`<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`);
    } else {
      html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
    }
  }

  flushList();

  return html.join("");
}

/** Instant when squads lock: May 24, 2026 at 6:30am US Pacific (PDT). */
const GW_DEADLINE_MS = Date.UTC(2026, 4, 24, 13, 30, 0);

function formatDeadlineInLocalTime(ms) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
}

function parseCountdownParts(ms) {
  if (ms <= 0) {
    return null;
  }

  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hour = Math.floor(totalSec / 3600) % 24;
  const day = Math.floor(totalSec / 86400);

  return { day, hour, min, sec };
}

function applyCountdownToDom(el, parts) {
  el.querySelector('[data-part="d"]').textContent = String(parts.day);
  el.querySelector('[data-part="h"]').textContent = String(parts.hour).padStart(2, "0");
  el.querySelector('[data-part="m"]').textContent = String(parts.min).padStart(2, "0");
  el.querySelector('[data-part="s"]').textContent = String(parts.sec).padStart(2, "0");
  el.setAttribute(
    "aria-label",
    `${parts.day} days, ${parts.hour} hours, ${parts.min} minutes, ${parts.sec} seconds until the deadline`,
  );
}

function startGameweekDeadlineCountdown() {
  const el = document.querySelector("#gw-deadline-countdown");
  const datetimeEl = document.querySelector("#gw-deadline-datetime");

  if (!el) {
    return;
  }

  if (datetimeEl) {
    datetimeEl.textContent = formatDeadlineInLocalTime(GW_DEADLINE_MS);
  }

  const tick = () => {
    const remaining = GW_DEADLINE_MS - Date.now();

    if (remaining <= 0) {
      el.classList.add("gw-deadline-countdown--done");
      el.removeAttribute("aria-label");
      el.textContent = "Deadline has passed — good luck this gameweek.";
      return false;
    }

    const parts = parseCountdownParts(remaining);

    if (!parts) {
      return false;
    }

    applyCountdownToDom(el, parts);
    return true;
  };

  if (!tick()) {
    return;
  }

  const id = window.setInterval(() => {
    if (!tick()) {
      window.clearInterval(id);
    }
  }, 1000);
}

async function renderHomePage() {
  const status = document.querySelector("#league-update-status");
  const container = document.querySelector("#league-update");

  if (!status || !container) {
    return;
  }

  try {
    const response = await fetch(leagueUpdateUrl);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const markdown = await response.text();
    container.innerHTML = markdownToHtml(markdown);
    status.textContent = "Gameweek 37";
  } catch (error) {
    status.textContent = "No update found";
    container.innerHTML = `<p>Could not load the latest league update: ${escapeHtml(error.message)}</p>`;
  }
}

function latestGameweek(manager) {
  if (Array.isArray(manager.gameweeks)) {
    return [...manager.gameweeks].reverse().find((gameweek) => gameweek.points != null);
  }

  if (Array.isArray(manager.eventDetails)) {
    return [...manager.eventDetails].reverse().find((event) => event.entryHistory?.points != null);
  }

  return null;
}

function formatGameweekPoints(gameweek) {
  const points = gameweek?.points ?? gameweek?.entryHistory?.points ?? null;
  const transferCost =
    gameweek?.transferCost ?? gameweek?.entryHistory?.event_transfers_cost ?? null;

  if (points === null) {
    return "-";
  }

  const pointsStr = formatCount(points, "-");

  if (!transferCost) {
    return pointsStr;
  }

  return `${pointsStr} (-${formatCount(transferCost, "-")})`;
}

function parseGameweekRange(value) {
  if (value == null || value === "") {
    return null;
  }

  const parts = String(value)
    .trim()
    .split(/\s*-\s*/)
    .map((part) => Number(part.trim()));

  if (parts.length === 1 && Number.isFinite(parts[0])) {
    return { start: parts[0], end: parts[0] };
  }

  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return {
      start: Math.min(parts[0], parts[1]),
      end: Math.max(parts[0], parts[1]),
    };
  }

  return null;
}

function sumPointsInGameweekRange(manager, range, throughEventId = null) {
  if (!manager || !range || !Array.isArray(manager.eventDetails)) {
    return null;
  }

  const endInclusive =
    throughEventId != null && Number.isFinite(throughEventId)
      ? Math.min(range.end, throughEventId)
      : range.end;

  if (range.start > endInclusive) {
    return null;
  }

  let total = 0;
  let counted = 0;

  for (let eventId = range.start; eventId <= endInclusive; eventId += 1) {
    const detail = manager.eventDetails.find((event) => event.event === eventId);
    const history = detail?.entryHistory;
    const points = history?.points;

    if (points != null) {
      const transferHit = Number(history.event_transfers_cost) || 0;
      total += points - transferHit;
      counted += 1;
    }
  }

  return counted > 0 ? total : null;
}

function findMotmPeriodForCurrentGameweek(winners, currentGw) {
  if (!Number.isFinite(currentGw)) {
    return null;
  }

  for (const row of winners) {
    const range = parseGameweekRange(row.gameweeks);

    if (!range || currentGw < range.start || currentGw > range.end) {
      continue;
    }

    return {
      month: row.month,
      gameweeks: row.gameweeks,
      range,
    };
  }

  return null;
}

function formatChip(chip) {
  const key = normalizeManagerChipKey(chip);

  const chipLabels = {
    "3xc": "TC",
    bboost: "BB",
    freehit: "FH",
    wildcard: "WC",
  };

  if (chipLabels[key]) {
    return chipLabels[key];
  }

  return chip == null || chip === "" ? "-" : String(chip);
}

function normalizeManagerChipKey(chip) {
  if (chip == null || chip === "") {
    return "";
  }

  const raw = String(chip).trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  const lower = raw.toLowerCase();

  const aliases = {
    bench_boost: "bboost",
    benchboost: "bboost",
    triple_captain: "3xc",
    triplecaptain: "3xc",
  };

  return aliases[lower] ?? lower;
}

/** Suffix for CSS: manager-chart-chip-marker--{suffix} */
function managerChartChipKindClass(chip) {
  const key = normalizeManagerChipKey(chip);

  if (key === "3xc") {
    return "tc";
  }

  if (key === "bboost") {
    return "bb";
  }

  if (key === "freehit") {
    return "fh";
  }

  if (key === "wildcard") {
    return "wc";
  }

  return "other";
}

function managerChartChipAccent(chip) {
  const key = normalizeManagerChipKey(chip);

  const byChip = {
    "3xc": "#e11d48",
    bboost: "#4ade80",
    freehit: "#fb923c",
    wildcard: "#c4b5fd",
  };

  return byChip[key] ?? "#38bdf8";
}

function managerUrl(entryId) {
  return `./manager.html?id=${encodeURIComponent(entryId)}`;
}

function eventUrl(entryId, eventId) {
  if (!entryId || !eventId) {
    return null;
  }

  return `https://fantasy.premierleague.com/entry/${entryId}/event/${eventId}`;
}

function teamLink(entryId, teamName) {
  const escapedName = escapeHtml(teamName ?? "Bye");
  if (!entryId) {
    return escapedName;
  }

  return `<a class="team-link" href="${managerUrl(entryId)}">${escapedName}</a>`;
}

function eventLink(entryId, eventId) {
  const label = `GW${eventId}`;
  const url = eventUrl(entryId, eventId);

  if (!url) {
    return label;
  }

  return `<a class="team-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function abbreviateDivisionKey(key) {
  if (key === "premier-league") {
    return "Prem";
  }

  if (key === "championship") {
    return "Champ";
  }

  return key;
}

function abbreviateLeagueLabel(name) {
  const labels = {
    "Premier League": "Prem",
    Championship: "Champ",
    RVFA: "RVFA",
  };

  return labels[name] ?? name;
}

function teamNameFor(data, entryId) {
  const rvfaTeam = data.rvfaLeague?.standings?.find((standing) => standing.entryId === entryId);
  if (rvfaTeam) {
    return rvfaTeam.entryName;
  }

  for (const division of data.divisions) {
    const team = division.standings.find((standing) => standing.entryId === entryId);
    if (team) {
      return team.entryName;
    }
  }

  return `Entry ${entryId}`;
}

function setGeneratedAt(data) {
  const element = document.querySelector("#generated-at");
  if (element) {
    element.textContent = formatGeneratedAt(data.generatedAt);
  }
}

function renderMotmWinnersTable(leagueKey, data, motm) {
  const status = document.querySelector("#motm-status");
  const body = document.querySelector("#motm-standings");

  if (!status || !body) {
    return;
  }

  const winners = Array.isArray(motm.winners) ? motm.winners : [];
  const withEntry = winners.filter((row) => {
    const raw = row.entryId != null && row.entryId !== "" ? Number(row.entryId) : null;

    return raw != null && !Number.isNaN(raw);
  });
  const seasonPart = motm.season ? `${motm.season}` : "";
  const namePart = motm.divisionName ?? "";
  status.textContent = [seasonPart, namePart].filter(Boolean).join(" · ");

  if (withEntry.length === 0) {
    body.innerHTML =
      winners.length === 0
        ? '<tr><td colspan="5">No MOTM rows yet. Edit <code>docs/data/motm/' +
          escapeHtml(leagueKey) +
          ".json</code>.</td></tr>"
        : '<tr><td colspan="5" class="empty-state">No MOTM winners to show. Set <code>entryId</code> on each month you want listed.</td></tr>';
    return;
  }

  body.innerHTML = withEntry
    .map((row) => {
      const entryId = Number(row.entryId);
      const resolved = teamForEntry(data, entryId);
      const teamName = resolved?.entryName ?? row.team ?? "—";
      const managerName = resolved?.playerName ?? row.manager ?? "—";
      const teamCell = teamLink(entryId, teamName);
      const manager = data.managers.find((candidate) => candidate.id === entryId);
      const gwRange = parseGameweekRange(row.gameweeks);
      const monthPoints = sumPointsInGameweekRange(manager, gwRange);
      const pointsDisplay = monthPoints != null ? formatCount(monthPoints) : "—";

      return `
        <tr>
          <td>${escapeHtml(row.month ?? "—")}</td>
          <td>${escapeHtml(row.gameweeks ?? "—")}</td>
          <td>${teamCell}</td>
          <td>${escapeHtml(managerName)}</td>
          <td>${escapeHtml(pointsDisplay)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderMotmLiveLeaders(league, data, motm) {
  const liveStatus = document.querySelector("#motm-live-status");
  const liveBody = document.querySelector("#motm-live-standings");

  if (!liveStatus || !liveBody) {
    return;
  }

  const winners = Array.isArray(motm.winners) ? motm.winners : [];
  const currentGw = Number(data.currentGameweek);

  if (!Number.isFinite(currentGw) || currentGw < 1) {
    liveStatus.textContent = "";
    liveBody.innerHTML =
      '<tr><td colspan="4" class="empty-state">Current gameweek is not available in the data file.</td></tr>';
    return;
  }

  const period = findMotmPeriodForCurrentGameweek(winners, currentGw);

  if (!period) {
    liveStatus.textContent = "";
    liveBody.innerHTML = `<tr><td colspan="4" class="empty-state">No MOTM month in <code>docs/data/motm/</code> covers gameweek ${escapeHtml(String(currentGw))}.</td></tr>`;
    return;
  }

  liveStatus.textContent = [
    period.month,
    `Month GWs ${period.range.start}–${period.range.end}`,
    `Totals through GW\u00A0${currentGw}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const scored = league.standings.map((team) => {
    const manager = data.managers.find((candidate) => candidate.id === team.entryId);
    const pts = sumPointsInGameweekRange(manager, period.range, currentGw);

    return { team, pts };
  });

  scored.sort((rowA, rowB) => {
    const scoreA = rowA.pts ?? -1;
    const scoreB = rowB.pts ?? -1;

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    return rowA.team.entryId - rowB.team.entryId;
  });

  const top = scored.slice(0, 3);

  liveBody.innerHTML = top
    .map((row, index) => {
      const ptsDisplay = row.pts != null ? formatCount(row.pts) : "—";

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${teamLink(row.team.entryId, row.team.entryName)}</td>
          <td>${escapeHtml(row.team.playerName)}</td>
          <td>${escapeHtml(ptsDisplay)}</td>
        </tr>
      `;
    })
    .join("");
}

async function renderManagerOfTheMonth(leagueKey, league, data) {
  const status = document.querySelector("#motm-status");
  const body = document.querySelector("#motm-standings");
  const liveStatus = document.querySelector("#motm-live-status");
  const liveBody = document.querySelector("#motm-live-standings");

  if (!status || !body) {
    return;
  }

  const motmUrl = `./data/motm/${leagueKey}.json`;
  const errorRow = (message) =>
    `<tr><td colspan="5" class="empty-state">${escapeHtml(message)}</td></tr>`;
  const liveErrorRow = (message) =>
    `<tr><td colspan="4" class="empty-state">${escapeHtml(message)}</td></tr>`;

  try {
    const response = await fetch(motmUrl);
    if (!response.ok) {
      throw new Error(`No MOTM file (${response.status}). Add docs/data/motm/${leagueKey}.json`);
    }

    const motm = await response.json();
    renderMotmWinnersTable(leagueKey, data, motm);
    renderMotmLiveLeaders(league, data, motm);
  } catch (error) {
    status.textContent = "";
    body.innerHTML = errorRow(error.message);
    if (liveStatus && liveBody) {
      liveStatus.textContent = "";
      liveBody.innerHTML = liveErrorRow(error.message);
    }
  }
}

function renderCombinedStandings(data) {
  const body = document.querySelector("#combined-standings");
  if (!body) {
    return;
  }

  if (data.combinedStandings.length === 0) {
    body.innerHTML = '<tr><td colspan="6">Run npm run fetch:data to populate standings.</td></tr>';
    return;
  }

  body.innerHTML = data.combinedStandings
    .map((manager) => {
      const latest = latestGameweek(manager);
      return `
        <tr>
          <td>${formatCount(manager.rvfaRank)}</td>
          <td>${teamLink(manager.entryId, teamNameFor(data, manager.entryId))}</td>
          <td>${manager.divisions.map((division) => escapeHtml(abbreviateDivisionKey(division))).join(", ")}</td>
          <td>${formatCount(manager.totalPoints)}</td>
          <td>${formatGameweekPoints(latest)}</td>
          <td>${escapeHtml(formatChip(latest?.activeChip))}</td>
        </tr>
      `;
    })
    .join("");
}

const CUP_PRIZE_CAPTION = {
  overall: "Prize: $50 and a guaranteed Premier League spot next season",
  "premier-league": "Prize: $30",
  championship: "Prize: Guaranteed promotion",
};

const PREMIER_LEAGUE_STANDINGS_PRIZE_CAPTION =
  "Season prizes: $414 (1st), $207 (2nd), $69 (3rd)";

function renderCup(cups, { includeLeagueName = false, prizeCaption = null } = {}) {
  const status = document.querySelector("#cup-status");
  const container = document.querySelector("#cup-matchups");
  if (!status || !container) {
    return;
  }

  const availableCups = cups.filter(({ cup }) => cup?.available);
  const matches = availableCups.flatMap(({ leagueName, cup }) =>
    cup.matches.map((match) => ({
      ...match,
      leagueName,
    })),
  );

  if (availableCups.length === 0) {
    status.textContent = "Cup endpoints unavailable";
    container.innerHTML = '<p class="empty-state">No cup data was returned by FPL.</p>';
    return;
  }

  status.textContent = includeLeagueName
    ? `${formatCount(matches.length)} matchups across ${formatCount(availableCups.length)} cups`
    : `${formatCount(matches.length)} matchups`;

  if (matches.length === 0) {
    container.innerHTML = '<p class="empty-state">No cup matchups yet.</p>';
    return;
  }

  const rounds = groupMatchesByRound(matches);
  const colCount = includeLeagueName ? 5 : 4;

  const theadCells = [
    includeLeagueName
      ? `<th class="cup-th-league"><span class="th-long">League</span><span class="th-short">Lg</span></th>`
      : "",
    `<th class="cup-th-gw">GW</th>`,
    `<th class="cup-th-t1"><span class="th-long">Team 1</span><span class="th-short">T1</span></th>`,
    `<th class="cup-th-score"><span class="th-long">Score</span><span class="th-short">Scr</span></th>`,
    `<th class="cup-th-t2"><span class="th-long">Team 2</span><span class="th-short">T2</span></th>`,
  ]
    .filter(Boolean)
    .join("");

  const bodyRows = rounds.flatMap(([roundName, roundMatches]) => {
    const titleRow = `
        <tr class="cup-round-label">
          <td colspan="${colCount}">
            <h3 class="cup-round-heading">${escapeHtml(roundName)}</h3>
          </td>
        </tr>`;

    const matchRows = roundMatches.map(
      (match) => `
                      <tr>
                        ${
                          includeLeagueName
                            ? `<td class="cup-td-league">${escapeHtml(abbreviateLeagueLabel(match.leagueName))}</td>`
                            : ""
                        }
                        <td class="cup-td-gw">${match.event != null ? formatCount(match.event) : "-"}</td>
                        <td class="cup-td-t1">${teamLink(match.entry1.entryId, match.entry1.entryName)}</td>
                        <td class="cup-td-score">${formatCount(match.entry1.points, "-")} – ${formatCount(match.entry2.points, "-")}</td>
                        <td class="cup-td-t2">${teamLink(match.entry2.entryId, match.entry2.entryName)}</td>
                      </tr>
                    `,
    );

    return [titleRow, ...matchRows];
  });

  const captionHtml = prizeCaption
    ? `<caption class="cup-prize-caption">${escapeHtml(prizeCaption)}</caption>`
    : "";

  container.innerHTML = `
        <div class="table-wrap cup-table-wrap">
          <table class="cup-matchups">
            ${captionHtml}
            <thead>
              <tr>
                ${theadCells}
              </tr>
            </thead>
            <tbody>
              ${bodyRows.join("")}
            </tbody>
          </table>
        </div>
      `;
}

function groupMatchesByRound(matches) {
  const groups = new Map();
  for (const match of matches) {
    const roundName = match.knockoutName ?? "Cup";
    if (!groups.has(roundName)) {
      groups.set(roundName, []);
    }

    groups.get(roundName).push(match);
  }

  return Array.from(groups.entries()).sort(([, firstMatches], [, secondMatches]) => {
    const firstEvent = Math.max(...firstMatches.map((match) => match.event ?? 0));
    const secondEvent = Math.max(...secondMatches.map((match) => match.event ?? 0));
    return secondEvent - firstEvent;
  });
}

function renderLeagueStandings(league, data) {
  const body = document.querySelector("#league-standings");
  const count = document.querySelector("#league-count");
  if (!body || !count) {
    return;
  }

  count.textContent = `${formatCount(league.standings.length)} teams`;
  body.innerHTML = league.standings
    .map((team) => {
      const manager = data.managers.find((candidate) => candidate.id === team.entryId);
      const latest = manager ? latestGameweek(manager) : null;

      return `
        <tr class="${standingsRowClass(league, team)}">
          <td>${formatCount(team.rank)}</td>
          <td>${teamLink(team.entryId, team.entryName)}</td>
          <td>${escapeHtml(team.playerName)}</td>
          <td>${formatCount(team.total)}</td>
          <td>${formatGameweekPoints(latest)}</td>
          <td>${escapeHtml(formatChip(latest?.activeChip))}</td>
          <td>${team.lastRank != null ? formatCount(team.lastRank) : "-"}</td>
        </tr>
      `;
    })
    .join("");

  const table = body.closest("table");
  if (table) {
    const captionSelector = "caption.standings-prize-caption";
    const existingCaption = table.querySelector(captionSelector);

    if (league.key === "premier-league") {
      const caption = existingCaption ?? document.createElement("caption");
      caption.className = "standings-prize-caption";
      caption.textContent = PREMIER_LEAGUE_STANDINGS_PRIZE_CAPTION;

      if (!existingCaption) {
        table.insertBefore(caption, table.firstElementChild);
      }
    } else if (existingCaption) {
      existingCaption.remove();
    }
  }
}

function standingsRowClass(league, team) {
  const rank = Number(team.rank);

  if (league.key === "premier-league") {
    const bottomTwoStart = league.standings.length - 1;

    if (rank === 1) {
      return "zone-gold";
    }

    if (rank === 2) {
      return "zone-silver";
    }

    if (rank === 3) {
      return "zone-bronze";
    }

    if (rank >= bottomTwoStart) {
      return "zone-relegation";
    }

    if (rank === bottomTwoStart - 1) {
      return "zone-playoff";
    }
  }

  if (league.key === "championship" && rank <= 2) {
    return "zone-promotion";
  }

  return "";
}

function teamForEntry(data, entryId) {
  const leagues = [data.rvfaLeague, ...data.divisions].filter(Boolean);

  for (const league of leagues) {
    const team = league.standings.find((standing) => standing.entryId === entryId);
    if (team) {
      return team;
    }
  }

  return null;
}

function divisionLabels(data, divisionKeys) {
  const divisionNames = new Map(data.divisions.map((division) => [division.key, division.name]));

  return divisionKeys.map((key) => divisionNames.get(key) ?? key);
}

const MANAGER_CHART_COLORS = {
  overall: "#38bdf8",
  gwRank: "#4ade80",
  points: "#fb923c",
  bench: "#f472b6",
};

function buildManagerGameweekRows(manager) {
  if (!manager?.eventDetails?.length) {
    return [];
  }

  return [...manager.eventDetails]
    .map((ev) => {
      const h = ev.entryHistory ?? {};

      return {
        gw: ev.event,
        overallRank: h.overall_rank,
        gwRank: h.rank,
        points: h.points,
        bench: h.points_on_bench,
        totalPoints: h.total_points,
        value: h.value,
        transfers: h.event_transfers,
        chip: ev.activeChip,
      };
    })
    .filter((r) => r.gw != null)
    .sort((a, b) => a.gw - b.gw);
}

function normalizeToUnitInterval(values, invert) {
  const finite = values.filter((v) => v != null && Number.isFinite(Number(v)));

  if (!finite.length) {
    return values.map(() => null);
  }

  let min = Math.min(...finite.map(Number));
  let max = Math.max(...finite.map(Number));

  if (min === max) {
    return values.map((v) => (v != null && Number.isFinite(Number(v)) ? 0.5 : null));
  }

  return values.map((v) => {
    if (v == null || !Number.isFinite(Number(v))) {
      return null;
    }

    const n = Number(v);
    let t = (n - min) / (max - min);

    if (invert) {
      t = 1 - t;
    }

    return t;
  });
}

function buildManagerStatCells(stats) {
  const cell = (label, value, sub = "") => `
    <div class="manager-stat-cell">
      <span class="manager-stat-label">${escapeHtml(label)}</span>
      <span class="manager-stat-value">${escapeHtml(value)}</span>
      ${sub ? `<span class="manager-stat-sub">${escapeHtml(sub)}</span>` : ""}
    </div>`;

  return `
    ${cell("RANK", stats.overallRank, stats.rankSub)}
    ${cell("POINTS", stats.totalPoints, stats.ptsPerGw)}
    ${cell("TEAM VALUE", stats.teamValue, "")}
    ${cell("BEST GW RANK", stats.bestGwRank, stats.bestGwRankSub)}
    ${cell("BEST GW SCORE", stats.bestGwScore, stats.bestGwScoreSub)}
    ${cell("TOTAL TRANSFERS", stats.totalTransfers, stats.transfersPerGw)}
  `;
}

function computeManagerDashboardStats(rows, totalPlayers) {
  const withPoints = rows.filter((r) => r.points != null);
  const played = withPoints.length;
  const last = rows.length ? rows.at(-1) : null;
  const latestHist = last?.totalPoints;

  let overallRank = "—";
  let rankSub = "";

  if (last?.overallRank != null) {
    overallRank = formatCount(last.overallRank);
    const topPct = formatTopPercentOfAllManagers(last.overallRank, totalPlayers);

    if (topPct != null) {
      rankSub = `Top ${topPct}% of all managers`;
    }
  }

  let totalPoints = "—";
  let ptsPerGw = "";

  if (latestHist != null && played > 0) {
    totalPoints = formatCount(latestHist);
    ptsPerGw = `${formatFixed(latestHist / played, 1)}/GW`;
  }

  let teamValue = "—";

  if (last?.value != null) {
    const m = fplTeamValueToMillion(last.value);

    if (m != null) {
      teamValue = `${formatFixed(m, 1)}M`;
    }
  }

  const gwRanks = rows.map((r) => r.gwRank).filter((v) => v != null && Number.isFinite(Number(v)));
  let bestGwRank = "—";
  let bestGwRankSub = "";

  if (gwRanks.length) {
    const best = Math.min(...gwRanks.map(Number));
    const at = rows.find((r) => Number(r.gwRank) === best);
    bestGwRank = formatCount(best);

    if (at?.gw != null) {
      bestGwRankSub = `GW${at.gw}`;
    }
  }

  const scores = rows.map((r) => r.points).filter((v) => v != null && Number.isFinite(Number(v)));
  let bestGwScore = "—";
  let bestGwScoreSub = "";

  if (scores.length) {
    const best = Math.max(...scores.map(Number));
    const at = rows.find((r) => Number(r.points) === best);
    bestGwScore = formatCount(best);

    if (at?.gw != null) {
      bestGwScoreSub = `GW${at.gw}`;
    }
  }

  const transfers = rows.reduce((sum, r) => sum + (Number(r.transfers) || 0), 0);
  let transfersPerGw = "";

  if (played > 0) {
    transfersPerGw = `${formatFixed(transfers / played, 1)}/GW`;
  }

  return {
    overallRank,
    rankSub,
    totalPoints,
    ptsPerGw,
    teamValue,
    bestGwRank,
    bestGwRankSub,
    bestGwScore,
    bestGwScoreSub,
    totalTransfers: formatCount(transfers),
    transfersPerGw,
  };
}

function renderManagerChipBadges(manager) {
  const chips = manager.chips ?? [];

  if (!chips.length) {
    return '<p class="manager-chip-empty">No chips logged yet.</p>';
  }

  return chips
    .map((chip) => {
      const label = formatChip(chip.name);
      const gwPart = chip.event != null ? ` \u00B7 ${chip.event}` : "";
      const title = [label, chip.event != null ? `GW ${chip.event}` : ""].filter(Boolean).join(" · ");

      return `<span class="manager-chip-badge" title="${escapeHtml(title)}">${escapeHtml(label)}${escapeHtml(gwPart)}</span>`;
    })
    .join("");
}

function wireManagerChartSeriesToggles(svg) {
  const dashboard = svg.closest("#manager-dashboard");

  if (!dashboard) {
    return () => {};
  }

  const toggles = [...dashboard.querySelectorAll(".manager-chart-series-toggle")];

  const applyVisibility = (toggle) => {
    const key = toggle.dataset.series;

    if (!key) {
      return;
    }

    const path = svg.querySelector(`.manager-chart-series--${key}`);
    const item = toggle.closest(".manager-chart-legend-item");

    if (path) {
      path.setAttribute("visibility", toggle.checked ? "visible" : "hidden");
    }

    if (item) {
      item.classList.toggle("is-off", !toggle.checked);
    }
  };

  const onChange = (event) => {
    applyVisibility(event.target);
  };

  for (const toggle of toggles) {
    toggle.addEventListener("change", onChange);
    applyVisibility(toggle);
  }

  return () => {
    for (const toggle of toggles) {
      toggle.removeEventListener("change", onChange);
    }
  };
}

function resetManagerChartLegendToggles() {
  const dashboard = document.querySelector("#manager-dashboard");

  if (!dashboard) {
    return;
  }

  for (const toggle of dashboard.querySelectorAll(".manager-chart-series-toggle")) {
    toggle.checked = true;
  }

  for (const item of dashboard.querySelectorAll(".manager-chart-legend-item")) {
    item.classList.remove("is-off");
  }
}

function renderManagerPerformanceChart(svg, tooltip, rows, totalPlayers) {
  const W = 800;
  const H = 280;
  const pad = { l: 44, r: 20, t: 18, b: 52 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  if (!rows.length) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#94a3b8" font-size="14">No gameweek data to chart yet.</text>`;
    tooltip.hidden = true;

    return () => {};
  }

  const gwMin = rows[0].gw;
  const gwMax = rows.at(-1).gw;
  const gwSpan = Math.max(1, gwMax - gwMin);

  const xAt = (gw) => pad.l + ((gw - gwMin) / gwSpan) * plotW;

  const normOverall = normalizeToUnitInterval(
    rows.map((r) => r.overallRank),
    true,
  );
  const normGwRank = normalizeToUnitInterval(
    rows.map((r) => r.gwRank),
    true,
  );
  const normPoints = normalizeToUnitInterval(
    rows.map((r) => r.points),
    false,
  );
  const normBench = normalizeToUnitInterval(
    rows.map((r) => r.bench),
    false,
  );

  const yAt = (t) => (t == null ? null : pad.t + (1 - t) * plotH);

  const linePath = (norms) => {
    const parts = [];

    for (let i = 0; i < rows.length; i += 1) {
      const t = norms[i];

      if (t == null) {
        continue;
      }

      const x = xAt(rows[i].gw);
      const y = yAt(t);

      if (y == null) {
        continue;
      }

      parts.push(`${parts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }

    return parts.join(" ");
  };

  const chipDots = rows
    .filter((r) => r.chip)
    .map((r) => {
      const cx = xAt(r.gw);
      const cy = H - pad.b + 8;
      const label = formatChip(r.chip);
      const tip = `${label} · GW${r.gw}`;
      const kind = managerChartChipKindClass(r.chip);
      const accent = managerChartChipAccent(r.chip);
      const fillBg = "#0f172a";

      return `<g class="manager-chart-chip-marker manager-chart-chip-marker--${kind}">
        <circle cx="${cx.toFixed(1)}" cy="${cy}" r="9" fill="${fillBg}" stroke="${accent}" stroke-width="1.75" style="fill:${fillBg};stroke:${accent};stroke-width:1.75px"/>
        <text x="${cx.toFixed(1)}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${accent}" font-size="8.5" font-weight="800" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" style="fill:${accent}">${escapeHtml(label)}</text>
        <title>${escapeHtml(tip)}</title>
      </g>`;
    })
    .join("");

  const xTicks = [];
  const tickStep = gwSpan > 18 ? 2 : 1;

  for (let g = gwMin; g <= gwMax; g += tickStep) {
    xTicks.push(`<text x="${xAt(g).toFixed(1)}" y="${H - 22}" text-anchor="middle" fill="#64748b" font-size="11">${g}</text>`);
  }

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Line chart of overall rank, gameweek rank, gameweek points, and bench points by gameweek; chip markers show TC, BB, FH, or WC where played",
  );
  svg.innerHTML = `
    <line class="manager-chart-crosshair" x1="0" y1="${pad.t}" x2="0" y2="${pad.t + plotH}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 4" opacity="0" pointer-events="none"/>
    <path class="manager-chart-series manager-chart-series--overall" d="${linePath(normOverall)}" fill="none" stroke="${MANAGER_CHART_COLORS.overall}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path class="manager-chart-series manager-chart-series--gwRank" d="${linePath(normGwRank)}" fill="none" stroke="${MANAGER_CHART_COLORS.gwRank}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path class="manager-chart-series manager-chart-series--points" d="${linePath(normPoints)}" fill="none" stroke="${MANAGER_CHART_COLORS.points}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path class="manager-chart-series manager-chart-series--bench" d="${linePath(normBench)}" fill="none" stroke="${MANAGER_CHART_COLORS.bench}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${chipDots}
    ${xTicks.join("")}
  `;

  const crosshair = svg.querySelector(".manager-chart-crosshair");

  const nearestRow = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / W;
    const padLPx = pad.l * scaleX;
    const plotWPx = plotW * scaleX;
    const x = clientX - rect.left;
    const ratio = plotWPx > 0 ? Math.min(1, Math.max(0, (x - padLPx) / plotWPx)) : 0;
    const idx = Math.round(ratio * Math.max(0, rows.length - 1));

    return rows[idx];
  };

  const showTooltip = (row, clientX, clientY) => {
    crosshair.setAttribute("opacity", "0.55");
    crosshair.setAttribute("x1", xAt(row.gw).toFixed(1));
    crosshair.setAttribute("x2", xAt(row.gw).toFixed(1));

    const or = row.overallRank != null ? formatCount(row.overallRank) : "—";
    const gr = row.gwRank != null ? formatCount(row.gwRank) : "—";
    const pt = row.points != null ? formatCount(row.points) : "—";
    const bn = row.bench != null ? formatCount(row.bench) : "—";

    const topOverallPct = formatTopPercentOfAllManagers(row.overallRank, totalPlayers);
    const ch = row.chip ? formatChip(row.chip) : "—";

    tooltip.innerHTML = `
      <div class="manager-chart-tooltip-title">GW\u00A0${escapeHtml(String(row.gw))}</div>
      <dl class="manager-chart-tooltip-dl">
        <div><dt>Overall rank</dt><dd>${escapeHtml(or)}</dd></div>
        <div><dt>GW rank</dt><dd>${escapeHtml(gr)}</dd></div>
        <div><dt>Top of all managers</dt><dd>${topOverallPct != null ? escapeHtml(`${topOverallPct}%`) : "—"}</dd></div>
        <div><dt>GW points</dt><dd>${escapeHtml(pt)}</dd></div>
        <div><dt>Points on bench</dt><dd>${escapeHtml(bn)}</dd></div>
        <div><dt>Chip</dt><dd>${escapeHtml(ch)}</dd></div>
      </dl>
    `;
    tooltip.hidden = false;
    tooltip.style.position = "fixed";
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const offset = 14;
    const margin = 10;
    let left = clientX + offset;
    let top = clientY + offset;

    if (left + tw > window.innerWidth - margin) {
      left = clientX - tw - offset;
    }

    if (top + th > window.innerHeight - margin) {
      top = clientY - th - offset;
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - th - margin));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const hideTooltip = () => {
    crosshair.setAttribute("opacity", "0");
    tooltip.hidden = true;
  };

  const removeToggles = wireManagerChartSeriesToggles(svg);

  const onMove = (event) => {
    const row = nearestRow(event.clientX);
    showTooltip(row, event.clientX, event.clientY);
  };

  const onLeave = () => hideTooltip();

  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerleave", onLeave);
  svg.addEventListener("pointerdown", onMove);

  return () => {
    removeToggles();
    svg.removeEventListener("pointermove", onMove);
    svg.removeEventListener("pointerleave", onLeave);
    svg.removeEventListener("pointerdown", onMove);
  };
}

function initManagerDashboard(manager, data, team) {
  const root = document.querySelector("#manager-dashboard");

  if (!root) {
    return;
  }

  const headlineEl = document.querySelector("#manager-dashboard-headline");
  const gridEl = document.querySelector("#manager-stat-grid");
  const chipsEl = document.querySelector("#manager-chip-badges");
  const svg = document.querySelector("#manager-chart-svg");
  const tooltip = document.querySelector("#manager-chart-tooltip");

  if (!headlineEl || !gridEl || !chipsEl || !svg || !tooltip) {
    return;
  }

  root.hidden = false;
  headlineEl.textContent = [data.seasonName ?? data.season, team.entryName].filter(Boolean).join(" ");

  const rows = buildManagerGameweekRows(manager);
  const stats = computeManagerDashboardStats(rows, data.totalPlayers ?? null);

  gridEl.innerHTML = buildManagerStatCells(stats);
  chipsEl.innerHTML = renderManagerChipBadges(manager);

  if (root._chartTeardown) {
    root._chartTeardown();
    root._chartTeardown = null;
  }

  resetManagerChartLegendToggles();
  root._chartTeardown = renderManagerPerformanceChart(svg, tooltip, rows, data.totalPlayers ?? null);
}

function hideManagerDashboard() {
  const root = document.querySelector("#manager-dashboard");

  if (!root) {
    return;
  }

  root.hidden = true;

  if (root._chartTeardown) {
    root._chartTeardown();
    root._chartTeardown = null;
  }
}

function renderManagerPage(data) {
  const params = new URLSearchParams(window.location.search);
  const entryId = Number(params.get("id"));
  const manager = data.managers.find((candidate) => candidate.id === entryId);
  const team = teamForEntry(data, entryId);
  const name = document.querySelector("#manager-name");
  const summary = document.querySelector("#manager-summary");
  const body = document.querySelector("#manager-gameweeks");

  if (!name || !summary || !body) {
    return;
  }

  if (!manager || !team) {
    name.textContent = "Manager Not Found";
    summary.textContent = "Check the manager link and try again.";
    body.innerHTML = '<tr><td colspan="6">No manager data found.</td></tr>';
    hideManagerDashboard();

    return;
  }

  name.textContent = team.entryName;
  summary.textContent = `${team.playerName} · ${divisionLabels(data, manager.divisions).join(", ") || "RVFA"}`;

  initManagerDashboard(manager, data, team);
  body.innerHTML = [...manager.eventDetails]
    .reverse()
    .map((event) => {
      const history = event.entryHistory ?? {};
      const chipResetRow =
        event.event === 19
          ? '<tr class="chip-reset-row"><td colspan="6">Chips reset between Gameweek 19 and Gameweek 20</td></tr>'
          : "";

      return `
        ${chipResetRow}
        <tr>
          <td>${eventLink(manager.id, event.event)}</td>
          <td>${history.points != null ? formatCount(history.points) : "-"}</td>
          <td>${history.total_points != null ? formatCount(history.total_points) : "-"}</td>
          <td>${history.event_transfers_cost ? `-${formatCount(history.event_transfers_cost)}` : "-"}</td>
          <td>${escapeHtml(formatChip(event.activeChip))}</td>
          <td>${history.overall_rank != null ? formatCount(history.overall_rank) : "-"}</td>
        </tr>
      `;
    })
    .join("");
}

async function main() {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`Could not fetch ${dataUrl}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const page = document.body.dataset.page;

  setGeneratedAt(data);

  if (page === "home") {
    startGameweekDeadlineCountdown();
    await renderHomePage();
    return;
  }

  if (page === "overall") {
    renderCombinedStandings(data);
    renderCup(
      [
        {
          leagueName: data.rvfaLeague?.name ?? "RVFA",
          cup: data.rvfaLeague?.cup ?? data.cup,
        },
      ],
      { includeLeagueName: false, prizeCaption: CUP_PRIZE_CAPTION.overall },
    );
    return;
  }

  if (page === "league") {
    const leagueKey = document.body.dataset.league;
    const league = data.divisions.find((division) => division.key === leagueKey);

    if (!league) {
      throw new Error(`Could not find league: ${leagueKey}`);
    }

    renderLeagueStandings(league, data);
    renderCup([{ leagueName: league.name, cup: league.cup }], {
      prizeCaption: CUP_PRIZE_CAPTION[leagueKey] ?? null,
    });
    await renderManagerOfTheMonth(leagueKey, league, data);
    return;
  }

  if (page === "manager") {
    renderManagerPage(data);
  }
}

main().catch((error) => {
  const statusElement =
    document.querySelector("#generated-at") ??
    document.querySelector("#league-count") ??
    document.querySelector("#league-update-status") ??
    document.querySelector("#cup-status") ??
    document.querySelector("#motm-status") ??
    document.querySelector("#motm-live-status");

  if (statusElement) {
    statusElement.textContent = `Could not load data: ${error.message}`;
    return;
  }

  const mainElement = document.querySelector("main");
  if (mainElement) {
    const errorElement = document.createElement("p");
    errorElement.className = "empty-state";
    errorElement.textContent = `Could not load data: ${error.message}`;
    mainElement.append(errorElement);
  }
});
