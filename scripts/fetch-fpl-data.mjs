import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const CONFIG_PATH = path.resolve("rvfa.config.json");
const OUTPUT_PATH = path.resolve("docs/data/rvfa.json");
const MANIFEST_PATH = path.resolve("docs/data/manifest.json");
const SEASONS_DIR = path.resolve("docs/data/seasons");
const ROSTER_OUTPUT_PATH = path.resolve("data/roster.json");
const execFileAsync = promisify(execFile);

async function readConfig() {
  try {
    const rawConfig = await readFile(CONFIG_PATH, "utf8");
    const config = JSON.parse(rawConfig);

    if (!config.currentSeason) {
      throw new Error("rvfa.config.json must include currentSeason.");
    }

    if (!Array.isArray(config.seasons) || config.seasons.length === 0) {
      throw new Error("rvfa.config.json must include at least one season.");
    }

    for (const season of config.seasons) {
      if (!season.key || !season.name) {
        throw new Error("Each season needs key and name.");
      }

      if (!season.leagues?.rvfa?.leagueId) {
        throw new Error(`Season ${season.key} needs leagues.rvfa.leagueId.`);
      }

      if (!Array.isArray(season.leagues?.divisions) || season.leagues.divisions.length === 0) {
        throw new Error(`Season ${season.key} needs at least one division.`);
      }

      for (const division of season.leagues.divisions) {
        if (!division.key || !division.name || !division.leagueId) {
          throw new Error(`Each division in ${season.key} needs key, name, and leagueId.`);
        }
      }
    }

    return config;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "Missing rvfa.config.json. Copy rvfa.config.example.json and fill in your FPL league IDs.",
      );
    }

    throw error;
  }
}

async function fetchJson(endpoint) {
  const url = `${FPL_BASE_URL}${endpoint}`;
  let response;

  try {
    response = await fetch(url, {
      headers: {
        "user-agent": "RVFA data fetcher",
      },
    });
  } catch (error) {
    if (error.cause?.code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") {
      return fetchJsonWithCurl(url, endpoint);
    }

    throw new Error(`FPL request failed for ${endpoint}: ${error.cause?.message ?? error.message}`);
  }

  if (!response.ok) {
    throw new Error(`FPL request failed for ${endpoint}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchJsonWithCurl(url, endpoint) {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["--fail", "--silent", "--show-error", "--location", "--compressed", url],
      {
        maxBuffer: 25 * 1024 * 1024,
      },
    );

    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`FPL request failed for ${endpoint} using curl fallback: ${error.message}`);
  }
}

async function tryFetchJson(endpoint, { quiet = false } = {}) {
  try {
    return await fetchJson(endpoint);
  } catch (error) {
    if (!quiet) {
      console.warn(error.message);
    }

    return null;
  }
}

async function fetchLeagueStandings(leagueId) {
  const results = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await fetchJson(`/leagues-classic/${leagueId}/standings/?page_standings=${page}`);
    results.push(...data.standings.results);
    hasNext = Boolean(data.standings.has_next);
    page += 1;
  }

  return results;
}

async function fetchLeagueCup(leagueId) {
  const status = await tryFetchJson(`/league/${leagueId}/cup-status/`, { quiet: true });

  if (!status?.league) {
    return {
      available: false,
      status,
      matches: [],
      rawPages: [],
    };
  }

  const pages = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await tryFetchJson(`/leagues-h2h-matches/league/${status.league}/?page=${page}`);

    if (!data) {
      return {
        available: false,
        status,
        matches: [],
        rawPages: pages,
      };
    }

    pages.push(data);
    hasNext = Boolean(data.has_next ?? data.cup_matches?.has_next ?? data.matches?.has_next);
    page += 1;
  }

  return {
    available: true,
    status,
    matches: pages.flatMap((pageData) => normalizeCupMatches(pageData)),
    rawPages: pages,
  };
}

async function fetchManager(entryId, eventIds) {
  const history = await fetchJson(`/entry/${entryId}/history/`);
  const eventDetails = await Promise.all(
    eventIds.map(async (eventId) => {
      try {
        const picks = await fetchJson(`/entry/${entryId}/event/${eventId}/picks/`);

        return {
          event: eventId,
          activeChip: picks.active_chip ?? null,
          automaticSubs: picks.automatic_subs ?? [],
          picks: picks.picks ?? [],
          entryHistory: picks.entry_history ?? null,
        };
      } catch (error) {
        console.warn(`Skipping picks for entry ${entryId}, gameweek ${eventId}: ${error.message}`);

        return null;
      }
    }),
  );

  return {
    id: entryId,
    current: history.current ?? [],
    past: history.past ?? [],
    chips: history.chips ?? [],
    eventDetails: eventDetails.filter(Boolean),
  };
}

function normalizeLeague(league, standings) {
  return {
    key: league.key,
    name: league.name,
    leagueId: league.leagueId,
    standings: standings.map((team) => ({
      entryId: team.entry,
      entryName: team.entry_name,
      playerName: team.player_name,
      rank: team.rank,
      lastRank: team.last_rank,
      total: team.total,
    })),
  };
}

function normalizeCupMatches(cupData) {
  const cupMatches = cupData.cup_matches?.results ?? cupData.cup_matches;
  const matchesData = cupData.matches?.results ?? cupData.matches;
  const matches = Array.isArray(cupMatches)
    ? cupMatches
    : Array.isArray(matchesData)
      ? matchesData
      : Array.isArray(cupData.results)
        ? cupData.results
        : [];

  return matches.map((match) => ({
    id: match.id ?? null,
    event: match.event ?? match.event_id ?? null,
    isBye: match.is_bye ?? false,
    winner: match.winner ?? null,
    knockoutName: match.knockout_name ?? null,
    tiebreak: match.tiebreak ?? null,
    entry1: {
      entryId: match.entry_1_entry ?? match.entry_1 ?? match.entry1_entry ?? null,
      entryName: match.entry_1_name ?? match.entry1_name ?? null,
      playerName: match.entry_1_player_name ?? match.entry1_player_name ?? null,
      points: match.entry_1_points ?? match.entry1_points ?? null,
    },
    entry2: {
      entryId: match.entry_2_entry ?? match.entry_2 ?? match.entry2_entry ?? null,
      entryName: match.entry_2_name ?? match.entry2_name ?? null,
      playerName: match.entry_2_player_name ?? match.entry2_player_name ?? null,
      points: match.entry_2_points ?? match.entry2_points ?? null,
    },
  }));
}

function buildManagers(leagues, managerDataByEntryId) {
  return Array.from(managerDataByEntryId.values()).map((manager) => {
    const divisionMemberships = leagues.divisions
      .filter((division) => division.standings.some((team) => team.entryId === manager.id))
      .map((division) => division.key);

    const rvfaTeam = leagues.rvfa.standings.find((team) => team.entryId === manager.id);

    return {
      ...manager,
      divisions: divisionMemberships,
      rvfaRank: rvfaTeam?.rank ?? null,
    };
  });
}

function buildCombinedStandings(managers) {
  return managers
    .map((manager) => {
      const latest = manager.current.at(-1);
      const summary = manager.eventDetails.map((event) => ({
        event: event.event,
        points: event.entryHistory?.points ?? null,
        totalPoints: event.entryHistory?.total_points ?? null,
        transferCost: event.entryHistory?.event_transfers_cost ?? null,
        activeChip: event.activeChip,
      }));

      return {
        entryId: manager.id,
        divisions: manager.divisions,
        totalPoints: latest?.total_points ?? 0,
        rank: latest?.overall_rank ?? null,
        gameweeks: summary,
        chips: manager.chips,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((manager, index) => ({
      ...manager,
      rvfaRank: index + 1,
    }));
}

function abbrevDivisionKey(key) {
  if (key === "premier-league") {
    return "Prem";
  }

  if (key === "championship") {
    return "Champ";
  }

  return key;
}

function buildRosterExport(rvfaLeague, divisionStandings) {
  const byId = new Map();

  const addStanding = (row, divisionKey) => {
    const id = row.entryId;
    if (id == null) {
      return;
    }

    if (!byId.has(id)) {
      byId.set(id, {
        entryId: id,
        team: row.entryName,
        manager: row.playerName,
        divisions: new Set(),
      });
    }

    if (divisionKey) {
      byId.get(id).divisions.add(abbrevDivisionKey(divisionKey));
    }
  };

  for (const row of rvfaLeague?.standings ?? []) {
    addStanding(row, null);
  }

  for (const div of divisionStandings ?? []) {
    for (const row of div.standings ?? []) {
      addStanding(row, div.key);
    }
  }

  return Array.from(byId.values())
    .map((row) => ({
      entryId: row.entryId,
      team: row.team,
      manager: row.manager,
      divisions: [...row.divisions].sort().join(", ") || null,
    }))
    .sort((a, b) => String(a.team).localeCompare(String(b.team), undefined, { sensitivity: "base" }));
}

async function main() {
  const config = await readConfig();
  const seasonKey = process.argv[2] ?? config.currentSeason;
  const season = config.seasons.find((candidate) => candidate.key === seasonKey);

  if (!season) {
    throw new Error(`Season ${seasonKey} is not configured in rvfa.config.json.`);
  }

  const bootstrap = await fetchJson("/bootstrap-static/");
  const startedEvents = bootstrap.events.filter((event) => event.finished || event.is_current);
  const eventIds = startedEvents.map((event) => event.id);

  console.log(`Fetching ${season.name} with ${eventIds.length} gameweeks...`);

  const rvfaStandings = await fetchLeagueStandings(season.leagues.rvfa.leagueId);
  const rvfaLeague = normalizeLeague(season.leagues.rvfa, rvfaStandings);
  rvfaLeague.cup = season.leagues.rvfa.includeCup
    ? await fetchLeagueCup(season.leagues.rvfa.leagueId)
    : { available: false, matches: [], rawPages: [] };

  const divisionStandings = await Promise.all(
    season.leagues.divisions.map(async (division) => {
      const standings = await fetchLeagueStandings(division.leagueId);
      const normalizedDivision = normalizeLeague(division, standings);
      normalizedDivision.cup = division.includeCup
        ? await fetchLeagueCup(division.leagueId)
        : { available: false, matches: [], rawPages: [] };

      return normalizedDivision;
    }),
  );

  const entryIds = new Set(
    [rvfaLeague, ...divisionStandings].flatMap((league) =>
      league.standings.map((team) => team.entryId),
    ),
  );

  console.log(`Fetching manager histories for ${entryIds.size} teams...`);

  const managerDataByEntryId = new Map();
  for (const entryId of entryIds) {
    managerDataByEntryId.set(entryId, await fetchManager(entryId, eventIds));
  }

  const managers = buildManagers(
    {
      rvfa: rvfaLeague,
      divisions: divisionStandings,
    },
    managerDataByEntryId,
  );
  const combinedStandings = buildCombinedStandings(managers);
  const payload = {
    generatedAt: new Date().toISOString(),
    season: season.key,
    seasonName: season.name,
    currentGameweek: bootstrap.events.find((event) => event.is_current)?.id ?? null,
    totalPlayers: bootstrap.total_players ?? null,
    rvfaLeague,
    cup: rvfaLeague.cup,
    divisions: divisionStandings,
    combinedStandings,
    managers,
    gameweeks: bootstrap.events.map((event) => ({
      id: event.id,
      name: event.name,
      deadlineTime: event.deadline_time,
      isCurrent: event.is_current,
      isNext: event.is_next,
      isFinished: event.finished,
    })),
  };

  const seasonOutputPath = path.join(SEASONS_DIR, `${season.key}.json`);
  const manifest = {
    currentSeason: config.currentSeason,
    seasons: config.seasons.map((configuredSeason) => ({
      key: configuredSeason.key,
      name: configuredSeason.name,
      path: `./seasons/${configuredSeason.key}.json`,
    })),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await mkdir(SEASONS_DIR, { recursive: true });
  await writeFile(seasonOutputPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  if (season.key === config.currentSeason) {
    await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  }

  await mkdir(path.dirname(ROSTER_OUTPUT_PATH), { recursive: true });
  const rosterExport = {
    generatedAt: payload.generatedAt,
    season: payload.season,
    seasonName: payload.seasonName,
    teams: buildRosterExport(rvfaLeague, divisionStandings),
  };
  await writeFile(ROSTER_OUTPUT_PATH, `${JSON.stringify(rosterExport, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), ROSTER_OUTPUT_PATH)}`);

  console.log(`Wrote ${path.relative(process.cwd(), seasonOutputPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
