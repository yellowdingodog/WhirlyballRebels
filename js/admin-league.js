function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

let SEASONS = [];
let CURRENT_SEASON = null;
let TEAMS = [];
let PLAYERS = [];
let GAMES = [];

function teamOptionsHtml(selectedId) {
  return TEAMS.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
}

async function initAdminLeague() {
  const main = document.getElementById('admin-league-content');

  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) {
    window.location.href = 'auth.html';
    return;
  }

  const { data: profile, error: profileError } = await window.sb
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile || !profile.is_admin) {
    main.innerHTML = '<p>You do not have access to this page.</p>';
    return;
  }

  const { data: seasons, error: seasonsError } = await window.sb
    .from('league_seasons')
    .select('*')
    .order('created_at', { ascending: false });

  if (seasonsError || !seasons || !seasons.length) {
    main.innerHTML = `
      <section class="block">
        <p>No seasons found yet. Run the "Seed the Fall 2026 season" section of supabase-schema.sql once in the Supabase SQL Editor, then reload this page.</p>
      </section>
    `;
    return;
  }

  SEASONS = seasons;
  const startingSeason = seasons.find(s => s.is_current) || seasons[0];

  main.innerHTML = `
    <section class="block">
      <h2>Season</h2>
      <div class="season-picker">
        <select id="season-select">
          ${seasons.map(s => `<option value="${s.id}" ${s.id === startingSeason.id ? 'selected' : ''}>${escapeHtml(s.name)}${s.is_current ? ' (live on site)' : ''}</option>`).join('')}
        </select>
        <button type="button" id="make-current-btn" class="btn btn-small">Make this the live season</button>
      </div>
      <form id="new-season-form" class="league-new-season-form">
        <input type="text" id="new-season-name" placeholder="e.g. Spring 2027" required>
        <button type="submit" class="link-button">+ Add a new season</button>
      </form>
      <p class="save-msg" id="season-save-msg"></p>
      <div id="season-settings"></div>
    </section>

    <section class="block">
      <h2>Teams</h2>
      <div id="league-teams-list"><p>Loading&hellip;</p></div>
    </section>

    <section class="block">
      <h2>Schedule &amp; Scores</h2>
      <div id="league-games-list"><p>Loading&hellip;</p></div>
    </section>

    <section class="block">
      <h2>Player Roster</h2>
      <div id="league-players-list"><p>Loading&hellip;</p></div>
    </section>
  `;

  document.getElementById('season-select').addEventListener('change', async (e) => {
    const season = SEASONS.find(s => s.id === e.target.value);
    if (season) {
      CURRENT_SEASON = season;
      updateMakeCurrentButton();
      await refreshAllLeagueData();
    }
  });

  document.getElementById('make-current-btn').addEventListener('click', async () => {
    const msgEl = document.getElementById('season-save-msg');
    const { error: clearError } = await window.sb.from('league_seasons').update({ is_current: false }).neq('id', CURRENT_SEASON.id);
    const { error: setError } = await window.sb.from('league_seasons').update({ is_current: true }).eq('id', CURRENT_SEASON.id);
    if (clearError || setError) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = 'Could not update: ' + (clearError || setError).message;
    } else {
      msgEl.style.color = 'var(--ink-soft)';
      msgEl.textContent = `${CURRENT_SEASON.name} is now the live season.`;
      const { data: refreshedSeasons } = await window.sb.from('league_seasons').select('*').order('created_at', { ascending: false });
      SEASONS = refreshedSeasons || [];
      CURRENT_SEASON = SEASONS.find(s => s.id === CURRENT_SEASON.id) || CURRENT_SEASON;
      rebuildSeasonSelect();
    }
  });

  document.getElementById('new-season-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('new-season-name');
    const name = nameInput.value.trim();
    const msgEl = document.getElementById('season-save-msg');
    if (!name) return;

    const { data: newSeason, error } = await window.sb
      .from('league_seasons')
      .insert({ name, is_current: false })
      .select()
      .single();

    if (error) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = 'Could not create season: ' + error.message;
      return;
    }

    // Give the new season the same 6 placeholder teams to start from.
    await window.sb.from('league_teams').insert(
      ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6'].map(name => ({
        season_id: newSeason.id, name,
      }))
    );

    nameInput.value = '';
    msgEl.style.color = 'var(--ink-soft)';
    msgEl.textContent = `${name} created with 6 placeholder teams.`;

    const { data: refreshedSeasons } = await window.sb.from('league_seasons').select('*').order('created_at', { ascending: false });
    SEASONS = refreshedSeasons || [];
    CURRENT_SEASON = newSeason;
    rebuildSeasonSelect();
    await refreshAllLeagueData();
  });

  CURRENT_SEASON = startingSeason;
  updateMakeCurrentButton();
  await refreshAllLeagueData();
}

function rebuildSeasonSelect() {
  const select = document.getElementById('season-select');
  select.innerHTML = SEASONS.map(s =>
    `<option value="${s.id}" ${s.id === CURRENT_SEASON.id ? 'selected' : ''}>${escapeHtml(s.name)}${s.is_current ? ' (live on site)' : ''}</option>`
  ).join('');
  updateMakeCurrentButton();
}

function updateMakeCurrentButton() {
  const btn = document.getElementById('make-current-btn');
  if (!btn) return;
  btn.disabled = !!CURRENT_SEASON.is_current;
  btn.textContent = CURRENT_SEASON.is_current ? 'This is the live season' : 'Make this the live season';
}

async function refreshAllLeagueData() {
  const [{ data: teams }, { data: players }, { data: games }] = await Promise.all([
    window.sb.from('league_teams').select('*').eq('season_id', CURRENT_SEASON.id).order('name'),
    window.sb.from('league_players').select('*').eq('season_id', CURRENT_SEASON.id).order('real_name'),
    window.sb.from('league_games').select('*').eq('season_id', CURRENT_SEASON.id),
  ]);

  TEAMS = teams || [];
  PLAYERS = players || [];
  GAMES = games || [];

  renderSeasonSettings();
  renderTeamsSection();
  renderPlayersSection();
  renderGamesSection();
}

/* ---------------- Season settings ---------------- */

function renderSeasonSettings() {
  const container = document.getElementById('season-settings');
  const s = CURRENT_SEASON;

  container.innerHTML = `
    <form id="season-settings-form" class="auth-form league-season-settings-form">
      <label class="checkbox-label">
        <input type="checkbox" id="season-show-registration" ${s.show_registration ? 'checked' : ''}>
        Show registration on the public page
      </label>
      <div class="season-settings-grid">
        <label>League start date <input type="date" id="season-start-date" value="${s.league_start_date || ''}"></label>
        <label>League end date <input type="date" id="season-end-date" value="${s.league_end_date || ''}"></label>
        <label>Early bird price ($) <input type="number" step="0.01" id="season-early-price" value="${s.early_bird_price != null ? s.early_bird_price : ''}"></label>
        <label>Early bird deadline <input type="date" id="season-early-deadline" value="${s.early_bird_deadline || ''}"></label>
        <label>Regular price ($) <input type="number" step="0.01" id="season-regular-price" value="${s.regular_price != null ? s.regular_price : ''}"></label>
        <label>Registration deadline <input type="date" id="season-reg-deadline" value="${s.registration_deadline || ''}"></label>
        <label class="season-settings-wide">Registration link (URL) <input type="url" id="season-reg-url" value="${escapeHtml(s.registration_url || '')}" placeholder="https://..."></label>
      </div>
      <button class="btn btn-small" type="submit">Save Season Settings</button>
      <p class="save-msg" id="season-settings-msg"></p>
    </form>
  `;

  document.getElementById('season-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('season-settings-msg');

    const priceVal = (id) => {
      const v = document.getElementById(id).value;
      return v === '' ? null : parseFloat(v);
    };
    const dateVal = (id) => document.getElementById(id).value || null;

    const updates = {
      show_registration: document.getElementById('season-show-registration').checked,
      league_start_date: dateVal('season-start-date'),
      league_end_date: dateVal('season-end-date'),
      early_bird_price: priceVal('season-early-price'),
      early_bird_deadline: dateVal('season-early-deadline'),
      regular_price: priceVal('season-regular-price'),
      registration_deadline: dateVal('season-reg-deadline'),
      registration_url: document.getElementById('season-reg-url').value.trim() || null,
    };

    const { error } = await window.sb.from('league_seasons').update(updates).eq('id', CURRENT_SEASON.id);
    if (error) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = 'Could not save: ' + error.message;
    } else {
      msgEl.style.color = 'var(--ink-soft)';
      msgEl.textContent = 'Saved.';
      Object.assign(CURRENT_SEASON, updates);
    }
  });
}

/* ---------------- Teams ---------------- */

function renderTeamsSection() {
  const container = document.getElementById('league-teams-list');
  let html = '<div class="league-teams-grid">';
  TEAMS.forEach(t => {
    html += `
      <div class="league-team-row">
        <input type="text" class="team-name-input" data-team="${t.id}" value="${escapeHtml(t.name)}">
      </div>
    `;
  });
  html += '</div><button type="button" id="save-teams-btn" class="btn btn-small">Save Teams</button><p class="save-msg" id="team-save-msg"></p>';
  container.innerHTML = html;

  document.getElementById('save-teams-btn').addEventListener('click', async () => {
    const msgEl = document.getElementById('team-save-msg');
    const updates = TEAMS.map(t => ({
      id: t.id,
      name: container.querySelector(`.team-name-input[data-team="${t.id}"]`).value.trim() || t.name,
    }));

    const { error } = await window.sb.from('league_teams').upsert(updates);
    if (error) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = 'Could not save: ' + error.message;
    } else {
      msgEl.style.color = 'var(--ink-soft)';
      msgEl.textContent = 'Saved.';
      await refreshAllLeagueData();
    }
  });
}

/* ---------------- Players ---------------- */

function renderPlayersSection() {
  const container = document.getElementById('league-players-list');

  let html = `
    <form id="add-player-form" class="auth-form league-player-form">
      <label>Name <input type="text" id="new-player-name" required></label>
      <label>Email <input type="email" id="new-player-email"></label>
      <label>Phone <input type="tel" id="new-player-phone"></label>
      <label>Team
        <select id="new-player-team">
          <option value="">Unassigned</option>
          ${teamOptionsHtml(null)}
        </select>
      </label>
      <label class="checkbox-label"><input type="checkbox" id="new-player-paid"> Paid</label>
      <button class="btn" type="submit">Add Player</button>
      <p id="add-player-error" class="form-error"></p>
    </form>
    <table class="roster-table">
      <thead>
        <tr><th>Name</th><th>Email</th><th>Phone</th><th>Team</th><th>Paid</th><th></th></tr>
      </thead>
      <tbody>
  `;

  PLAYERS.forEach(p => {
    html += `
      <tr data-player="${p.id}">
        <td><input type="text" class="player-name" value="${escapeHtml(p.real_name)}"></td>
        <td><input type="email" class="player-email" value="${escapeHtml(p.email || '')}"></td>
        <td><input type="tel" class="player-phone" value="${escapeHtml(p.phone || '')}"></td>
        <td>
          <select class="player-team">
            <option value="">Unassigned</option>
            ${teamOptionsHtml(p.team_id)}
          </select>
        </td>
        <td class="paid-cell"><input type="checkbox" class="player-paid" ${p.paid ? 'checked' : ''}></td>
        <td>
          <button type="button" class="link-button delete-player" data-player="${p.id}">Remove</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table><button type="button" id="save-players-btn" class="btn btn-small">Save Roster Changes</button><p class="save-msg" id="players-save-msg"></p>';
  container.innerHTML = html;

  document.getElementById('add-player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-player-error');
    errorEl.textContent = '';

    const real_name = document.getElementById('new-player-name').value.trim();
    const email = document.getElementById('new-player-email').value.trim() || null;
    const phone = document.getElementById('new-player-phone').value.trim() || null;
    const team_id = document.getElementById('new-player-team').value || null;
    const paid = document.getElementById('new-player-paid').checked;

    if (!real_name) {
      errorEl.textContent = 'Name is required.';
      return;
    }

    const { error } = await window.sb.from('league_players').insert({
      season_id: CURRENT_SEASON.id, real_name, email, phone, team_id, paid,
    });

    if (error) {
      errorEl.textContent = error.message;
      return;
    }

    document.getElementById('add-player-form').reset();
    await refreshAllLeagueData();
  });

  document.getElementById('save-players-btn').addEventListener('click', async () => {
    const msgEl = document.getElementById('players-save-msg');

    const updates = PLAYERS.map(p => {
      const row = container.querySelector(`tr[data-player="${p.id}"]`);
      return {
        id: p.id,
        season_id: p.season_id,
        real_name: row.querySelector('.player-name').value.trim() || p.real_name,
        email: row.querySelector('.player-email').value.trim() || null,
        phone: row.querySelector('.player-phone').value.trim() || null,
        team_id: row.querySelector('.player-team').value || null,
        paid: row.querySelector('.player-paid').checked,
        sort_order: p.sort_order,
      };
    });

    const { error } = await window.sb.from('league_players').upsert(updates);
    if (error) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = 'Could not save: ' + error.message;
    } else {
      msgEl.style.color = 'var(--ink-soft)';
      msgEl.textContent = 'Saved.';
      await refreshAllLeagueData();
    }
  });

  container.querySelectorAll('.delete-player').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this player from the roster?')) return;
      const playerId = btn.dataset.player;
      const { error } = await window.sb.from('league_players').delete().eq('id', playerId);
      if (error) {
        alert('Could not remove player: ' + error.message);
      } else {
        await refreshAllLeagueData();
      }
    });
  });
}

/* ---------------- Games / Schedule / Scores ---------------- */

function renderGamesSection() {
  const container = document.getElementById('league-games-list');

  const byWeek = {};
  GAMES.forEach(g => {
    if (!byWeek[g.week_number]) byWeek[g.week_number] = [];
    byWeek[g.week_number].push(g);
  });
  const weekNumbers = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

  if (!weekNumbers.length) {
    container.innerHTML = '<p>No games scheduled for this season yet.</p>';
    return;
  }

  let html = '';
  weekNumbers.forEach(wk => {
    const weekGames = byWeek[wk].sort((a, b) => a.game_order - b.game_order);
    html += `<h3 class="league-week-heading">Week ${wk}</h3>`;
    weekGames.forEach(g => {
      html += `
        <div class="league-game-row" data-game="${g.id}">
          <select class="game-red">${teamOptionsHtml(g.red_team_id)}</select>
          <input type="number" class="game-red-score" placeholder="Score" value="${g.red_score != null ? g.red_score : ''}">
          <span class="vs-label">vs</span>
          <select class="game-black">${teamOptionsHtml(g.black_team_id)}</select>
          <input type="number" class="game-black-score" placeholder="Score" value="${g.black_score != null ? g.black_score : ''}">
          <input type="text" class="game-refname" placeholder="Ref" value="${escapeHtml(g.ref_name || '')}">
          <input type="date" class="game-date" value="${g.game_date || ''}">
        </div>
      `;
    });
  });

  html += '<button type="button" id="save-games-btn" class="btn btn-small">Save Schedule &amp; Scores</button><p class="save-msg" id="games-save-msg"></p>';
  container.innerHTML = html;

  document.getElementById('save-games-btn').addEventListener('click', async () => {
    const msgEl = document.getElementById('games-save-msg');

    const updates = GAMES.map(g => {
      const row = container.querySelector(`.league-game-row[data-game="${g.id}"]`);
      const redScoreVal = row.querySelector('.game-red-score').value;
      const blackScoreVal = row.querySelector('.game-black-score').value;

      return {
        id: g.id,
        season_id: g.season_id,
        week_number: g.week_number,
        game_order: g.game_order,
        red_team_id: row.querySelector('.game-red').value,
        black_team_id: row.querySelector('.game-black').value,
        red_score: redScoreVal === '' ? null : parseInt(redScoreVal, 10),
        black_score: blackScoreVal === '' ? null : parseInt(blackScoreVal, 10),
        ref_name: row.querySelector('.game-refname').value.trim() || null,
        game_date: row.querySelector('.game-date').value || null,
      };
    });

    const { error } = await window.sb.from('league_games').upsert(updates);
    if (error) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = 'Could not save: ' + error.message;
    } else {
      msgEl.style.color = 'var(--ink-soft)';
      msgEl.textContent = 'Saved.';
      await refreshAllLeagueData();
    }
  });
}

document.addEventListener('DOMContentLoaded', initAdminLeague);
