function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function formatPollDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function nameFor(id, profileMap) {
  const p = profileMap[id];
  if (!p) return 'Unknown';
  return p.username || p.real_name;
}

async function initAdmin() {
  const main = document.getElementById('admin-content');

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

  main.innerHTML = `
    <section class="block">
      <h2>Create a new poll</h2>
      <form id="create-poll-form" class="auth-form">
        <label>Title
          <input type="text" id="poll-title" required placeholder="e.g. Week of Sept 14 Practice">
        </label>
        <label>Practice date
          <input type="date" id="poll-date">
        </label>
        <label>Description (optional)
          <textarea id="poll-description" rows="3" placeholder="Anything players should know"></textarea>
        </label>
        <button class="btn" type="submit">Create Poll</button>
        <p id="create-poll-error" class="form-error"></p>
      </form>
    </section>
    <section class="block">
      <h2>Existing polls</h2>
      <div id="admin-polls-list"><p>Loading&hellip;</p></div>
    </section>
  `;

  document.getElementById('create-poll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('create-poll-error');
    errorEl.textContent = '';

    const title = document.getElementById('poll-title').value.trim();
    const practice_date = document.getElementById('poll-date').value || null;
    const description = document.getElementById('poll-description').value.trim() || null;

    const { error } = await window.sb.from('polls').insert({
      title, practice_date, description, created_by: session.user.id,
    });

    if (error) {
      errorEl.textContent = error.message;
      return;
    }

    document.getElementById('create-poll-form').reset();
    loadAdminPolls();
  });

  loadAdminPolls();
}

async function loadAdminPolls() {
  const list = document.getElementById('admin-polls-list');
  if (!list) return;

  const [{ data: polls, error: pollsError }, { data: profiles }, { data: votes }] = await Promise.all([
    window.sb.from('polls').select('*').order('practice_date', { ascending: false }),
    window.sb.from('profiles').select('id, real_name, username'),
    window.sb.from('poll_votes').select('poll_id, user_id, vote'),
  ]);

  if (pollsError) {
    list.innerHTML = '<p>Could not load polls.</p>';
    console.error(pollsError);
    return;
  }

  if (!polls || !polls.length) {
    list.innerHTML = '<p>No polls yet. Create one above.</p>';
    return;
  }

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  list.innerHTML = '';

  for (const poll of polls) {
    const pollVotes = (votes || []).filter(v => v.poll_id === poll.id);
    const votedIds = new Set(pollVotes.map(v => v.user_id));
    const notVoted = (profiles || []).filter(p => !votedIds.has(p.id));

    const goingList = pollVotes.filter(v => v.vote === 'going').map(v => nameFor(v.user_id, profileMap));
    const maybeList = pollVotes.filter(v => v.vote === 'maybe').map(v => nameFor(v.user_id, profileMap));
    const notGoingList = pollVotes.filter(v => v.vote === 'not_going').map(v => nameFor(v.user_id, profileMap));
    const notVotedList = notVoted.map(p => p.username || p.real_name);

    const card = document.createElement('div');
    card.className = 'card admin-poll-card';
    card.innerHTML = `
      <h3>${escapeHtml(poll.title)}</h3>
      ${poll.practice_date ? `<p class="poll-date">${formatPollDate(poll.practice_date)}</p>` : ''}
      ${poll.description ? `<p>${escapeHtml(poll.description)}</p>` : ''}

      <div class="admin-status-row">
        <label>Status
          <select class="status-select" data-poll="${poll.id}">
            <option value="open" ${poll.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="booked" ${poll.status === 'booked' ? 'selected' : ''}>Booked</option>
            <option value="cancelled" ${poll.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </label>
        <label>Booked info
          <input type="text" class="booked-info" data-poll="${poll.id}" value="${escapeHtml(poll.booked_info || '')}" placeholder="e.g. Court 2, 7pm">
        </label>
        <button type="button" class="btn btn-small save-status" data-poll="${poll.id}">Save</button>
        <p class="save-msg" id="save-msg-${poll.id}"></p>
      </div>

      <div class="vote-breakdown">
        <p><strong>Going (${goingList.length}):</strong> ${goingList.join(', ') || '&mdash;'}</p>
        <p><strong>Maybe (${maybeList.length}):</strong> ${maybeList.join(', ') || '&mdash;'}</p>
        <p><strong>Not going (${notGoingList.length}):</strong> ${notGoingList.join(', ') || '&mdash;'}</p>
        <p><strong>Haven't voted (${notVotedList.length}):</strong> ${notVotedList.join(', ') || '&mdash;'}</p>
      </div>
    `;
    list.appendChild(card);
  }

  list.querySelectorAll('.save-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pollId = btn.dataset.poll;
      const status = list.querySelector(`.status-select[data-poll="${pollId}"]`).value;
      const bookedInfo = list.querySelector(`.booked-info[data-poll="${pollId}"]`).value.trim() || null;
      const msgEl = document.getElementById(`save-msg-${pollId}`);

      const { error } = await window.sb.from('polls').update({
        status: status,
        booked_info: bookedInfo,
      }).eq('id', pollId);

      if (error) {
        msgEl.textContent = 'Could not save: ' + error.message;
        msgEl.style.color = 'var(--red)';
      } else {
        msgEl.textContent = 'Saved.';
        msgEl.style.color = 'var(--ink-soft)';
        loadAdminPolls();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', initAdmin);
