function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

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

  const { data: season, error: seasonError } = await window.sb
    .from('seasons')
    .select('*')
    .eq('is_current', true)
    .limit(1)
    .single();

  if (seasonError || !season) {
    main.innerHTML = `
      <section class="block">
        <p>No active season found. Run the "Seed the Fall 2026 season" section of supabase-schema.sql once in the Supabase SQL Editor, then reload this page.</p>
      </section>
    `;
    return;
  }

  CURRENT_SEASON = season;

  main.innerHTML = `
    <section class="block">
      <h2>Teams</h2>
      <div id="league-teams-list"><p>Loading&hellip;</p></div>
    </section>
    <section class="block">
      <h2>Player Roster</h2>
      <div id="league-players-list"><p>Loading&hellip;</p></div>
    </section>
    <section class="block">
      <h2>Schedule &amp; Scores</h2>
      <div id="league-games-list"><p>Loading&hellip;</p></div>
    </section>
  `;

  await refreshAllLeagueData();
}

async function refreshAllLeagueData() {
  const [{ data: teams }, { data: players }, { data: games }] = await Promise.all([
    window.sb.from('teams').select('*').eq('season_id', CURRENT_SEASON.id).order('name'),
    window.sb.from('players').select('*').eq('season_id', CURRENT_SEASON.id).order('real_name'),
    window.sb.from('games').select('*').eq('season_id', CURRENT_SEASON.id),
  ]);

  TEAMS = teams || [];
  PLAYERS = players || [];
  GAMES = games || [];

  renderTeamsSection();
  renderPlayersSection();
  renderGamesSection();
}

/* ---------------- Teams ---------------- */

function renderTeamsSection() {
  const container = document.getElementById('league-teams-list');
  let html = '<div class="league-teams-grid">';
  TEAMS.forEach(t => {
    html += `
      <div class="league-team-row">
        <input type="text" class="team-name-input" data-team="${t.id}" value="${escapeHtml(t.name)}">
        <button type="button" class="btn btn-small save-team" data-team="${t.id}">Save</button>
      </div>
    `;
  });
  html += '</div><p class="save-msg" id="team-save-msg"></p>';
  container.innerHTML = html;

  container.querySelectorAll('.save-team').forEach(btn => {
    btn.addEventListener('click', async () => {
      const teamId = btn.dataset.team;
      const name = container.querySelector(`.team-name-input[data-team="${teamId}"]`).value.trim();
      const msgEl = document.getElementById('team-save-msg');
      if (!name) return;

      const { error } = await window.sb.from('teams').update({ name }).eq('id', teamId);
      if (error) {
        msgEl.style.color = 'var(--red)';
        msgEl.textContent = 'Could not save: ' + error.message;
      } else {
        msgEl.style.color = 'var(--ink-soft)';
        msgEl.textContent = 'Saved.';
        await refreshAllLeagueData();
      }
    });
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
          <button type="button" class="btn btn-small save-player" data-player="${p.id}">Save</button>
          <button type="button" class="link-button delete-player" data-player="${p.id}">Remove</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table><p class="save-msg" id="players-save-msg"></p>';
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

    const { error } = await window.sb.from('players').insert({
      season_id: CURRENT_SEASON.id, real_name, email, phone, team_id, paid,
    });

    if (error) {
      errorEl.textContent = error.message;
      return;
    }

    document.getElementById('add-player-form').reset();
    await refreshAllLeagueData();
  });

  container.querySelectorAll('.save-player').forEach(btn => {
    btn.addEventListener('click', async () => {
      const playerId = btn.dataset.player;
      const row = container.querySelector(`tr[data-player="${playerId}"]`);
      const msgEl = document.getElementById('players-save-msg');

      const updates = {
        real_name: row.querySelector('.player-name').value.trim(),
        email: row.querySelector('.player-email').value.trim() || null,
        phone: row.querySelector('.player-phone').value.trim() || null,
        team_id: row.querySelector('.player-team').value || null,
        paid: row.querySelector('.player-paid').checked,
      };

      const { error } = await window.sb.from('players').update(updates).eq('id', playerId);
      if (error) {
        msgEl.style.color = 'var(--red)';
        msgEl.textContent = 'Could not save: ' + error.message;
      } else {
        msgEl.style.color = 'var(--ink-soft)';
        msgEl.textContent = 'Saved.';
        await refreshAllLeagueData();
      }
    });
  });

  container.querySelectorAll('.delete-player').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this player from the roster?')) return;
      const playerId = btn.dataset.player;
      const { error } = await window.sb.from('players').delete().eq('id', playerId);
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

  let html = `
    <form id="add-game-form" class="auth-form league-game-form">
      <label>Week # <input type="number" id="new-game-week" min="1" required></label>
      <label>Date <input type="date" id="new-game-date"></label>
      <label>Red Team <select id="new-game-red">${teamOptionsHtml(null)}</select></label>
      <label>Black Team <select id="new-game-black">${teamOptionsHtml(null)}</select></label>
      <label>Ref Team <select id="new-game-refteam"><option value="">None</option>${teamOptionsHtml(null)}</select></label>
      <label>Ref Name (optional) <input type="text" id="new-game-refname"></label>
      <button class="btn" type="submit">Add Game</button>
      <p id="add-game-error" class="form-error"></p>
    </form>
  `;

  if (!weekNumbers.length) {
    html += '<p>No games scheduled yet. Add one above.</p>';
  }

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
          <select class="game-refteam"><option value="">No ref</option>${teamOptionsHtml(g.ref_team_id)}</select>
          <input type="text" class="game-refname" placeholder="Ref name" value="${escapeHtml(g.ref_name || '')}">
          <input type="date" class="game-date" value="${g.game_date || ''}">
          <button type="button" class="btn btn-small save-game" data-game="${g.id}">Save</button>
          <button type="button" class="link-button delete-game" data-game="${g.id}">Delete</button>
        </div>
      `;
    });
  });

  html += '<p class="save-msg" id="games-save-msg"></p>';
  container.innerHTML = html;

  document.getElementById('add-game-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-game-error');
    errorEl.textContent = '';

    const week_number = parseInt(document.getElementById('new-game-week').value, 10);
    const game_date = document.getElementById('new-game-date').value || null;
    const red_team_id = document.getElementById('new-game-red').value;
    const black_team_id = document.getElementById('new-game-black').value;
    const ref_team_id = document.getElementById('new-game-refteam').value || null;
    const ref_name = document.getElementById('new-game-refname').value.trim() || null;

    if (!red_team_id || !black_team_id) {
      errorEl.textContent = 'Pick both teams.';
      return;
    }
    if (red_team_id === black_team_id) {
      errorEl.textContent = 'Red and Black must be different teams.';
      return;
    }

    const existingInWeek = GAMES.filter(g => g.week_number === week_number).length;

    const { error } = await window.sb.from('games').insert({
      season_id: CURRENT_SEASON.id,
      week_number,
      game_order: existingInWeek + 1,
      game_date,
      red_team_id,
      black_team_id,
      ref_team_id,
      ref_name,
    });

    if (error) {
      errorEl.textContent = error.message;
      return;
    }

    document.getElementById('add-game-form').reset();
    await refreshAllLeagueData();
  });

  container.querySelectorAll('.save-game').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gameId = btn.dataset.game;
      const row = container.querySelector(`.league-game-row[data-game="${gameId}"]`);
      const msgEl = document.getElementById('games-save-msg');

      const redScoreVal = row.querySelector('.game-red-score').value;
      const blackScoreVal = row.querySelector('.game-black-score').value;

      const updates = {
        red_team_id: row.querySelector('.game-red').value,
        black_team_id: row.querySelector('.game-black').value,
        red_score: redScoreVal === '' ? null : parseInt(redScoreVal, 10),
        black_score: blackScoreVal === '' ? null : parseInt(blackScoreVal, 10),
        ref_team_id: row.querySelector('.game-refteam').value || null,
        ref_name: row.querySelector('.game-refname').value.trim() || null,
        game_date: row.querySelector('.game-date').value || null,
      };

      const { error } = await window.sb.from('games').update(updates).eq('id', gameId);
      if (error) {
        msgEl.style.color = 'var(--red)';
        msgEl.textContent = 'Could not save: ' + error.message;
      } else {
        msgEl.style.color = 'var(--ink-soft)';
        msgEl.textContent = 'Saved.';
        await refreshAllLeagueData();
      }
    });
  });

  container.querySelectorAll('.delete-game').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this game?')) return;
      const gameId = btn.dataset.game;
      const { error } = await window.sb.from('games').delete().eq('id', gameId);
      if (error) {
        alert('Could not delete game: ' + error.message);
      } else {
        await refreshAllLeagueData();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', initAdminLeague);
