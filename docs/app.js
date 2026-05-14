const dataUrl = "./data/rvfa.json";

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

function latestGameweek(manager) {
  return [...manager.gameweeks].reverse().find((gameweek) => gameweek.points !== null);
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

function renderCombinedStandings(data) {
  const body = document.querySelector("#combined-standings");
  const divisionNames = new Map(data.divisions.map((division) => [division.key, division.name]));

  if (data.combinedStandings.length === 0) {
    body.innerHTML = '<tr><td colspan="7">Run npm run fetch:data to populate standings.</td></tr>';
    return;
  }

  body.innerHTML = data.combinedStandings
    .map((manager) => {
      const latest = latestGameweek(manager);
      return `
        <tr>
          <td>${manager.rvfaRank}</td>
          <td>${escapeHtml(teamNameFor(data, manager.entryId))}</td>
          <td>${manager.divisions.map((division) => escapeHtml(divisionNames.get(division) ?? division)).join(", ")}</td>
          <td>${manager.totalPoints}</td>
          <td>${latest?.points ?? "-"}</td>
          <td>${latest?.transferCost ?? 0}</td>
          <td>${escapeHtml(latest?.activeChip ?? "-")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderCup(data) {
  const status = document.querySelector("#cup-status");
  const body = document.querySelector("#cup-matchups");
  const leagues = [data.rvfaLeague, ...data.divisions].filter(Boolean);
  const leagueCups = leagues.map((league) => ({
    leagueName: league.name,
    cup: league.cup ?? (league.key === "rvfa" ? data.cup : null),
  }));
  const availableCups = leagueCups.filter(({ cup }) => cup?.available);
  const matches = availableCups.flatMap(({ leagueName, cup }) =>
    cup.matches.map((match) => ({
      ...match,
      leagueName,
    })),
  );

  if (availableCups.length === 0) {
    status.textContent = "Cup endpoints unavailable";
    body.innerHTML = '<tr><td colspan="5">No cup data was returned by FPL.</td></tr>';
    return;
  }

  status.textContent = `${matches.length} matchups across ${availableCups.length} cups`;

  if (matches.length === 0) {
    body.innerHTML = '<tr><td colspan="5">No cup matchups yet.</td></tr>';
    return;
  }

  body.innerHTML = matches
    .map(
      (match) => `
        <tr>
          <td>${escapeHtml(match.leagueName)}</td>
          <td>${match.event ?? "-"}</td>
          <td>${escapeHtml(match.entry1.entryName ?? "Bye")}</td>
          <td>${match.entry1.points ?? "-"} - ${match.entry2.points ?? "-"}</td>
          <td>${escapeHtml(match.entry2.entryName ?? "Bye")}</td>
        </tr>
      `,
    )
    .join("");
}

function renderDivisions(data) {
  const container = document.querySelector("#division-standings");
  const leagues = [data.rvfaLeague, ...data.divisions].filter(Boolean);

  container.innerHTML = leagues
    .map(
      (league) => `
        <section class="card">
          <div class="section-heading">
            <h2>${escapeHtml(league.name)}</h2>
            <p>${league.standings.length} teams</p>
          </div>
          <ol class="division-list">
            ${league.standings
              .map(
                (team) => `
                  <li>
                    <span>${team.rank}. ${escapeHtml(team.entryName)}</span>
                    <strong>${team.total}</strong>
                  </li>
                `,
              )
              .join("")}
          </ol>
        </section>
      `,
    )
    .join("");
}

async function main() {
  const response = await fetch(dataUrl);
  const data = await response.json();

  document.querySelector("#generated-at").textContent = formatGeneratedAt(data.generatedAt);
  renderCombinedStandings(data);
  renderCup(data);
  renderDivisions(data);
}

main().catch((error) => {
  document.querySelector("#generated-at").textContent = `Could not load data: ${error.message}`;
});
