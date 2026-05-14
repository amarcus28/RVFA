# RVFA

RVFA is a lightweight Fantasy Premier League data fetcher and static site for a two-division league setup:

- Premier League
- Championship
- Consolidated RVFA league
- Cup matchups for RVFA and each division, when the FPL cup endpoints return them

The site is built to be hosted from GitHub Pages with the `docs/` folder as the publishing source.

## Setup

Copy the example config and replace the placeholder league IDs with your FPL classic league IDs:

```sh
cp rvfa.config.example.json rvfa.config.json
```

```json
{
  "currentSeason": "2025-26",
  "seasons": [
    {
      "key": "2025-26",
      "name": "2025/26",
      "leagues": {
        "rvfa": {
          "key": "rvfa",
          "name": "RVFA",
          "leagueId": 345678,
          "includeCup": true
        },
        "divisions": [
          {
            "key": "premier-league",
            "name": "Premier League",
            "leagueId": 123456,
            "includeCup": true
          },
          {
            "key": "championship",
            "name": "Championship",
            "leagueId": 234567,
            "includeCup": true
          }
        ]
      }
    }
  ]
}
```

## Fetch Data

```sh
npm run fetch:data
```

The fetch script defaults to `currentSeason`. It writes season-specific data to `docs/data/seasons/<season>.json`, updates `docs/data/manifest.json`, and writes the current season to `docs/data/rvfa.json` for the static site.

You can fetch an explicitly configured season with:

```sh
npm run fetch:data -- 2025-26
```

The current data file includes:

- consolidated RVFA standings
- division standings from each configured FPL classic league
- combined RVFA standings
- cup matchups from RVFA and each division with `includeCup: true`, if available from FPL
- manager gameweek histories
- active chip usage by gameweek
- transfer hits by gameweek
- picks and automatic substitutions for each started gameweek

Past seasons can stay in `docs/data/seasons/` after they finish. When a new FPL season starts, add a new season entry, set `currentSeason` to the new key, and keep the old season data untouched.

## Preview The Site

```sh
npm run serve
```

Then open <http://localhost:8000>.

## GitHub Pages

In the repository settings on GitHub, set Pages to deploy from the `docs/` folder on your default branch.
