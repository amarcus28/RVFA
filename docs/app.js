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

  if (!transferCost) {
    return points;
  }

  return `${points} (-${transferCost})`;
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
  const chipLabels = {
    "3xc": "TC",
    bboost: "BB",
    freehit: "FH",
    wildcard: "WC",
  };

  return chipLabels[chip] ?? chip ?? "-";
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
      const pointsDisplay = monthPoints != null ? String(monthPoints) : "—";

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
      const ptsDisplay = row.pts != null ? String(row.pts) : "—";

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
          <td>${manager.rvfaRank}</td>
          <td>${teamLink(manager.entryId, teamNameFor(data, manager.entryId))}</td>
          <td>${manager.divisions.map((division) => escapeHtml(abbreviateDivisionKey(division))).join(", ")}</td>
          <td>${manager.totalPoints}</td>
          <td>${formatGameweekPoints(latest)}</td>
          <td>${escapeHtml(formatChip(latest?.activeChip))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderCup(cups, { includeLeagueName = false } = {}) {
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
    ? `${matches.length} matchups across ${availableCups.length} cups`
    : `${matches.length} matchups`;

  if (matches.length === 0) {
    container.innerHTML = '<p class="empty-state">No cup matchups yet.</p>';
    return;
  }

  const rounds = groupMatchesByRound(matches);

  container.innerHTML = rounds
    .map(
      ([roundName, roundMatches]) => `
        <section class="cup-round">
          <h3>${escapeHtml(roundName)}</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  ${
                    includeLeagueName
                      ? `<th><span class="th-long">League</span><span class="th-short">Lg</span></th>`
                      : ""
                  }
                  <th>GW</th>
                  <th><span class="th-long">Team 1</span><span class="th-short">T1</span></th>
                  <th><span class="th-long">Score</span><span class="th-short">Scr</span></th>
                  <th><span class="th-long">Team 2</span><span class="th-short">T2</span></th>
                </tr>
              </thead>
              <tbody>
                ${roundMatches
                  .map(
                    (match) => `
                      <tr>
                        ${
                          includeLeagueName
                            ? `<td>${escapeHtml(abbreviateLeagueLabel(match.leagueName))}</td>`
                            : ""
                        }
                        <td>${match.event ?? "-"}</td>
                        <td>${teamLink(match.entry1.entryId, match.entry1.entryName)}</td>
                        <td>${match.entry1.points ?? "-"} - ${match.entry2.points ?? "-"}</td>
                        <td>${teamLink(match.entry2.entryId, match.entry2.entryName)}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>
      `,
    )
    .join("");
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

  count.textContent = `${league.standings.length} teams`;
  body.innerHTML = league.standings
    .map((team) => {
      const manager = data.managers.find((candidate) => candidate.id === team.entryId);
      const latest = manager ? latestGameweek(manager) : null;

      return `
        <tr class="${standingsRowClass(league, team)}">
          <td>${team.rank}</td>
          <td>${teamLink(team.entryId, team.entryName)}</td>
          <td>${escapeHtml(team.playerName)}</td>
          <td>${team.total}</td>
          <td>${formatGameweekPoints(latest)}</td>
          <td>${escapeHtml(formatChip(latest?.activeChip))}</td>
          <td>${team.lastRank ?? "-"}</td>
        </tr>
      `;
    })
    .join("");
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
    return;
  }

  name.textContent = team.entryName;
  summary.textContent = `${team.playerName} · ${divisionLabels(data, manager.divisions).join(", ") || "RVFA"}`;

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
          <td>${history.points ?? "-"}</td>
          <td>${history.total_points ?? "-"}</td>
          <td>${history.event_transfers_cost ? `-${history.event_transfers_cost}` : "-"}</td>
          <td>${escapeHtml(formatChip(event.activeChip))}</td>
          <td>${history.overall_rank ?? "-"}</td>
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
      { includeLeagueName: false },
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
    renderCup([{ leagueName: league.name, cup: league.cup }]);
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
