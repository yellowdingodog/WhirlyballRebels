function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function formatGameDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function computeStandings(teams, games) {
  const stats = {};
  teams.forEach(t => {
    stats[t.id] = { team: t, wins: 0, losses: 0, ties: 0 };
  });

  games.forEach(g => {
    if (g.red_score == null || g.black_score == null) return; // not played yet
    const redStat = stats[g.red_team_id];
    const blackStat = stats[g.black_team_id];
    if (!redStat || !blackStat) return;

    if (g.red_score > g.black_score) {
      redStat.wins++; blackStat.losses++;
    } else if (g.red_score < g.black_score) {
      redStat.losses++; blackStat.wins++;
    } else {
      redStat.ties++; blackStat.ties++;
    }
  });

  const rows = Object.values(stats).map(s => {
    const gp = s.wins + s.losses + s.ties;
    const winPct = gp > 0 ? (s.wins + 0.5 * s.ties) / gp : 0;
    const diff = s.wins - s.losses;
    return { ...s, gp, winPct, diff };
  });

  const maxDiff = rows.length ? Math.max(...rows.map(r => r.diff)) : 0;
  rows.forEach(r => { r.gamesBack = maxDiff - r.diff; });

  rows.sort((a, b) => (b.winPct - a.winPct) || (a.gamesBack - b.gamesBack));
  rows.forEach((r, i) => { r.rank = i + 1; });

  return rows;
}

function renderStandings(rows) {
  const container = document.getElementById('standings-content');
  if (!rows.length) {
    container.innerHTML = '<p>No teams set up yet.</p>';
    return;
  }

  let html = `
    <table class="standings-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Team</th>
          <th>Games Played</th>
          <th>Wins</th>
          <th>Losses</th>
          <th>Ties</th>
          <th>Win %</th>
          <th>Games Back</th>
        </tr>
      </thead>
      <tbody>
  `;
  rows.forEach(r => {
    html += `
      <tr>
        <td>${r.rank}</td>
        <td>${escapeHtml(r.team.name)}</td>
        <td>${r.gp}</td>
        <td>${r.wins}</td>
        <td>${r.losses}</td>
        <td>${r.ties}</td>
        <td>${(r.winPct * 100).toFixed(1)}%</td>
        <td>${r.gamesBack === 0 ? '&mdash;' : r.gamesBack}</td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderSchedule(games, teamMap) {
  const container = document.getElementById('schedule-content');
  if (!games.length) {
    container.innerHTML = '<p>Schedule hasn\'t been posted yet.</p>';
    return;
  }

  const byWeek = {};
  games.forEach(g => {
    if (!byWeek[g.week_number]) byWeek[g.week_number] = [];
    byWeek[g.week_number].push(g);
  });

  const weekNumbers = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

  let html = '';
  weekNumbers.forEach(wk => {
    const weekGames = byWeek[wk].sort((a, b) => a.game_order - b.game_order);
    const dateLabel = weekGames[0].game_date ? formatGameDate(weekGames[0].game_date) : '';

    html += `
      <div class="schedule-week">
        <h3>Week ${wk}${dateLabel ? ' &middot; ' + dateLabel : ''}</h3>
        <table class="schedule-table">
          <thead>
            <tr><th>Red</th><th>Score</th><th>Black</th><th>Ref</th></tr>
          </thead>
          <tbody>
    `;

    weekGames.forEach(g => {
      const redName = teamMap[g.red_team_id] ? teamMap[g.red_team_id].name : 'TBD';
      const blackName = teamMap[g.black_team_id] ? teamMap[g.black_team_id].name : 'TBD';
      const played = g.red_score != null && g.black_score != null;
      const scoreCell = played
        ? `${g.red_score} &ndash; ${g.black_score}`
        : `<span class="game-score-tbd">vs</span>`;

      html += `
        <tr>
          <td>${escapeHtml(redName)}</td>
          <td class="score-cell">${scoreCell}</td>
          <td>${escapeHtml(blackName)}</td>
          <td>${g.ref_name ? escapeHtml(g.ref_name) : '&mdash;'}</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
  });

  container.innerHTML = html;
}

function renderTeams(teams, players) {
  const container = document.getElementById('teams-content');
  if (!teams.length) {
    container.innerHTML = '<p>Teams haven\'t been set up yet.</p>';
    return;
  }

  const sortedPlayers = [...players].sort((a, b) => {
    const ao = a.sort_order == null ? Infinity : a.sort_order;
    const bo = b.sort_order == null ? Infinity : b.sort_order;
    if (ao !== bo) return ao - bo;
    return (a.real_name || '').localeCompare(b.real_name || '');
  });

  const rosterByTeam = {};
  teams.forEach(t => { rosterByTeam[t.id] = []; });
  sortedPlayers.forEach(p => {
    if (p.team_id && rosterByTeam[p.team_id]) {
      rosterByTeam[p.team_id].push(p.real_name);
    }
  });

  let html = '<div class="teams-grid">';
  teams.forEach(t => {
    const roster = rosterByTeam[t.id] || [];
    html += `
      <div class="team-card">
        <h3>${escapeHtml(t.name)}</h3>
        <ul>${roster.length ? roster.map(n => `<li>${escapeHtml(n)}</li>`).join('') : '<li>&mdash;</li>'}</ul>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

function formatLongDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderRegistration(season) {
  const section = document.getElementById('registration-section');
  const content = document.getElementById('registration-content');

  if (!season.show_registration) {
    section.style.display = 'none';
    return;
  }

  let html = '<p>';
  const parts = [];
  if (season.early_bird_price != null && season.early_bird_deadline) {
    parts.push(`Early bird rate is $${season.early_bird_price} by ${formatLongDate(season.early_bird_deadline)}`);
  }
  if (season.regular_price != null && season.registration_deadline) {
    parts.push(`$${season.regular_price} due by ${formatLongDate(season.registration_deadline)}`);
  }
  html += parts.length ? parts.join(', or ') + '.' : 'Registration is open.';
  html += '</p>';
  content.innerHTML = html;

  if (season.registration_url) {
    const btn = document.createElement('a');
    btn.className = 'btn';
    btn.href = season.registration_url;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.textContent = 'Register here';
    content.appendChild(btn);
  }

  section.style.display = 'block';
}

async function loadSeason() {
  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) {
    window.location.href = 'auth.html';
    return;
  }

  const { data: season, error: seasonError } = await window.sb
    .from('league_seasons')
    .select('*')
    .eq('is_current', true)
    .limit(1)
    .single();

  if (seasonError || !season) {
    document.getElementById('season-title').textContent = 'No active season';
    document.getElementById('registration-section').style.display = 'none';
    document.getElementById('standings-content').innerHTML = '<p>No active season set up yet.</p>';
    document.getElementById('schedule-content').innerHTML = '';
    document.getElementById('teams-content').innerHTML = '';
    return;
  }

  document.getElementById('season-title').textContent = season.name;
  const datesEl = document.getElementById('season-dates');
  if (season.league_start_date && season.league_end_date) {
    datesEl.textContent = `${formatLongDate(season.league_start_date)} \u2013 ${formatLongDate(season.league_end_date)}`;
  } else {
    datesEl.textContent = '';
  }
  renderRegistration(season);

  const [{ data: teams }, { data: games }, { data: players }] = await Promise.all([
    window.sb.from('league_teams').select('*').eq('season_id', season.id),
    window.sb.from('league_games').select('*').eq('season_id', season.id),
    window.sb.rpc('get_league_players_directory', { p_season_id: season.id }),
  ]);

  const teamList = teams || [];
  const gameList = games || [];
  const playerList = players || [];

  const teamMap = {};
  teamList.forEach(t => { teamMap[t.id] = t; });

  const standings = computeStandings(teamList, gameList);
  renderStandings(standings);
  renderSchedule(gameList, teamMap);
  renderTeams(teamList, playerList);
}

document.addEventListener('DOMContentLoaded', loadSeason);
