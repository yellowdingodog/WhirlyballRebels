function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

const DIVISIONS = ['', 'A', 'B', 'C', 'D'];
let CURRENT_USER_ID = null;
let PROFILES = [];

function divisionSelectHtml(id, current) {
  return `<select class="division-select" data-id="${id}">
    ${DIVISIONS.map(d => `<option value="${d}" ${(current || '') === d ? 'selected' : ''}>${d || '&mdash;'}</option>`).join('')}
  </select>`;
}

function rowHtml(p) {
  const isMe = p.id === CURRENT_USER_ID;
  return `
    <tr data-id="${p.id}" data-search="${escapeHtml(((p.real_name || '') + ' ' + (p.team_name || '')).toLowerCase())}">
      <td><input type="text" class="name-input" data-id="${p.id}" value="${escapeHtml(p.real_name || '')}" required></td>
      <td><input type="text" class="team-input" data-id="${p.id}" value="${escapeHtml(p.team_name || '')}" maxlength="50"></td>
      <td>${divisionSelectHtml(p.id, p.division)}</td>
      <td class="center">
        <input type="checkbox" class="admin-check" data-id="${p.id}" ${p.is_admin ? 'checked' : ''}
          ${isMe ? 'disabled title="You can\'t remove your own admin access"' : ''}>
      </td>
      <td class="nowrap">
        <button type="button" class="btn btn-small save-profile" data-id="${p.id}">Save</button>
      </td>
    </tr>`;
}

function renderTable() {
  const wrap = document.getElementById('profiles-table-wrap');
  wrap.innerHTML = `
    <table class="profiles-table">
      <thead>
        <tr><th>Real name</th><th>Team name</th><th>Division</th><th class="center">Admin</th><th></th></tr>
      </thead>
      <tbody>${PROFILES.map(rowHtml).join('')}</tbody>
    </table>`;

  wrap.querySelectorAll('.save-profile').forEach(btn => {
    btn.addEventListener('click', () => saveProfile(btn.dataset.id));
  });
}

async function saveProfile(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  const btn = row.querySelector('.save-profile');
  const statusEl = document.getElementById('profiles-status');
  const showError = (text) => {
    statusEl.textContent = text;
    statusEl.style.color = 'var(--red)';
    btn.textContent = 'Save';
    btn.disabled = false;
  };
  statusEl.textContent = '';
  const real_name = row.querySelector('.name-input').value.trim();
  const team_name = row.querySelector('.team-input').value.trim() || null;
  const division = row.querySelector('.division-select').value || null;
  const is_admin = row.querySelector('.admin-check').checked;

  if (!real_name) {
    showError('Name cannot be blank.');
    return;
  }

  const original = PROFILES.find(p => p.id === id);
  if (original && original.is_admin !== is_admin) {
    const verb = is_admin ? 'Grant admin access to' : 'Remove admin access from';
    if (!confirm(`${verb} ${real_name}?`)) return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving\u2026';

  const { data, error } = await window.sb
    .from('profiles')
    .update({ real_name, team_name, division, is_admin })
    .eq('id', id)
    .select('id, real_name, is_admin, team_name, division');

  if (error) {
    showError(`Could not save ${real_name}: ${error.message}`);
    return;
  }
  if (!data || !data.length) {
    // RLS silently filtered the update
    showError(`${real_name} was not saved — check the admin update policy in Supabase.`);
    return;
  }

  Object.assign(original, data[0]);
  row.dataset.search = ((data[0].real_name || '') + ' ' + (data[0].team_name || '')).toLowerCase();
  btn.textContent = 'Saved \u2713';
  setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1500);
}

async function initAdminProfiles() {
  const main = document.getElementById('admin-content');

  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) {
    window.location.href = 'auth.html';
    return;
  }
  CURRENT_USER_ID = session.user.id;

  const { data: me, error: meError } = await window.sb
    .from('profiles').select('is_admin').eq('id', session.user.id).single();

  if (meError || !me || !me.is_admin) {
    main.innerHTML = '<p>You do not have access to this page.</p>';
    return;
  }

  const { data: profiles, error } = await window.sb
    .from('profiles')
    .select('id, real_name, is_admin, team_name, division')
    .order('real_name', { ascending: true });

  if (error) {
    main.innerHTML = `<p>Could not load profiles: ${escapeHtml(error.message)}</p>
      <p>If this mentions team_name or division, run sql/2026-10-09_profiles_team_division.sql in Supabase first.</p>`;
    return;
  }

  PROFILES = profiles || [];

  main.innerHTML = `
    <section class="block">
      <h2>Player profiles <span class="profiles-count">(${PROFILES.length})</span></h2>
      <input type="search" id="profile-filter" class="profile-filter" placeholder="Filter by name or team">
      <p id="profiles-status" class="profiles-status" role="status"></p>
      <div id="profiles-table-wrap" class="table-scroll"></div>
    </section>`;

  renderTable();

  document.getElementById('profile-filter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.profiles-table tbody tr').forEach(tr => {
      tr.hidden = q && !tr.dataset.search.includes(q);
    });
  });
}

document.addEventListener('DOMContentLoaded', initAdminProfiles);
