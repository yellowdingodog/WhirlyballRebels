function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function formatPollDate(d) {
  if (!d) return 'Date TBD';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function splitUpcomingPast(polls) {
  const today = todayStr();
  const upcoming = [];
  const past = [];
  for (const p of polls) {
    if (!p.practice_date || p.practice_date >= today) {
      upcoming.push(p);
    } else {
      past.push(p);
    }
  }
  upcoming.sort((a, b) => {
    if (!a.practice_date) return 1;
    if (!b.practice_date) return -1;
    return a.practice_date.localeCompare(b.practice_date);
  });
  past.sort((a, b) => b.practice_date.localeCompare(a.practice_date));
  return { upcoming, past };
}

function nameFor(id, profileMap) {
  const p = profileMap[id];
  if (!p) return 'Unknown';
  return p.real_name;
}

const LOCATION_OPTIONS = ['Any', 'Chicago', 'Vernon Hills'];

function locationSelectHtml(idAttr, current) {
  const isKnown = LOCATION_OPTIONS.includes(current);
  const opts = LOCATION_OPTIONS.map(loc =>
    `<option value="${loc}" ${current === loc ? 'selected' : ''}>${loc}</option>`
  ).join('');
  return `
    <select class="location-select" data-poll="${idAttr}">
      ${opts}
      <option value="__other__" ${!isKnown ? 'selected' : ''}>Other&hellip;</option>
    </select>
    <input type="text" class="location-other" data-poll="${idAttr}" placeholder="Enter location"
      value="${!isKnown ? escapeHtml(current || '') : ''}"
      style="display:${!isKnown ? 'block' : 'none'}">
  `;
}

function wireLocationToggle(container) {
  container.querySelectorAll('.location-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const pollId = sel.dataset.poll;
      const otherInput = container.querySelector(`.location-other[data-poll="${pollId}"]`);
      if (sel.value === '__other__') {
        otherInput.style.display = 'block';
        otherInput.focus();
      } else {
        otherInput.style.display = 'none';
      }
    });
  });
}

function resolveLocationValue(container, pollId) {
  const sel = container.querySelector(`.location-select[data-poll="${pollId}"]`);
  if (sel.value === '__other__') {
    const otherInput = container.querySelector(`.location-other[data-poll="${pollId}"]`);
    return otherInput.value.trim() || 'Any';
  }
  return sel.value;
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
        <label>Type
          ${pollTypeSelectHtml('type-select', ' id="poll-type"', 'practice')}
        </label>
        <label>Date
          <input type="date" id="poll-date">
        </label>
        <label>Location
          <span class="location-field">${locationSelectHtml('new', 'Any')}</span>
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

  wireLocationToggle(document.getElementById('create-poll-form'));

  document.getElementById('create-poll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('create-poll-error');
    errorEl.textContent = '';

    const title = document.getElementById('poll-title').value.trim();
    const practice_date = document.getElementById('poll-date').value || null;
    const description = document.getElementById('poll-description').value.trim() || null;
    const location = resolveLocationValue(document.getElementById('create-poll-form'), 'new');
    const poll_type = document.getElementById('poll-type').value;

    const { error } = await window.sb.from('polls').insert({
      title, practice_date, description, location, poll_type, created_by: session.user.id,
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

const POLL_TYPE_OPTIONS = [['practice', 'Practice'], ['event', 'Event'], ['other', 'Other']];
function pollTypeSelectHtml(cls, idAttr, current) {
  current = current || 'practice';
  const opts = POLL_TYPE_OPTIONS.map(([v, l]) =>
    `<option value="${v}"${v === current ? ' selected' : ''}>${l}</option>`).join('');
  return `<select class="${cls}"${idAttr}>${opts}</select>`;
}

function renderAdminPollCard(poll, profiles, votes, profileMap, guests) {
  const pollGuests = (guests || []).filter(g => String(g.poll_id) === String(poll.id));
  const pollVotes = votes.filter(v => v.poll_id === poll.id).concat(pollGuests);
  const votedIds = new Set(pollVotes.map(v => v.user_id));
  const notVoted = profiles.filter(p => !votedIds.has(p.id));
  const guestNote = pollGuests.length ? ` &nbsp;&middot;&nbsp; <em>incl. ${pollGuests.length} guest${pollGuests.length === 1 ? '' : 's'}</em>` : '';

  const goingCount = pollVotes.filter(v => v.vote === 'going').length;
  const maybeCount = pollVotes.filter(v => v.vote === 'maybe').length;
  const notGoingCount = pollVotes.filter(v => v.vote === 'not_going').length;
  const notVotedCount = notVoted.length;

  const timeVal = poll.practice_time ? poll.practice_time.slice(0, 5) : '';

  const card = document.createElement('div');
  card.className = 'card admin-poll-card';
  card.innerHTML = `
    <h3>${escapeHtml(poll.title)}</h3>
    <p class="poll-date">${({ event: 'Event', other: 'Other' })[poll.poll_type] || 'Practice'} &middot; ${formatPollDate(poll.practice_date)}</p>
    ${poll.description ? `<p class="poll-desc">${escapeHtml(poll.description)}</p>` : ''}

    <div class="admin-status-row">
      <label class="title-label">Title
        <input type="text" class="title-input" data-poll="${poll.id}" value="${escapeHtml(poll.title || '')}" required>
      </label>
      <label>Type
        ${pollTypeSelectHtml('type-select', ` data-poll="${poll.id}"`, poll.poll_type)}
      </label>
      <label>Status
        <select class="status-select" data-poll="${poll.id}">
          <option value="open" ${poll.status === 'open' ? 'selected' : ''}>Not Yet Booked</option>
          <option value="booked" ${poll.status === 'booked' ? 'selected' : ''}>Booked</option>
          <option value="cancelled" ${poll.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </label>
      <label>Location
        <span class="location-field">${locationSelectHtml(poll.id, poll.location || 'Any')}</span>
      </label>
      <label>Time
        <input type="time" class="time-input" data-poll="${poll.id}" value="${timeVal}">
      </label>
      <label>Booked info
        <input type="text" class="booked-info" data-poll="${poll.id}" value="${escapeHtml(poll.booked_info || '')}" placeholder="e.g. Court 2">
      </label>
      <label class="title-label">Description
        <textarea class="desc-input" data-poll="${poll.id}" rows="4" placeholder="Anything players should know">${escapeHtml(poll.description || '')}</textarea>
      </label>
      <button type="button" class="btn btn-small save-status" data-poll="${poll.id}">Save</button>
      <button type="button" class="link-button delete-poll" data-poll="${poll.id}"
        data-title="${escapeHtml(poll.title || '')}" data-votes="${pollVotes.length}">Delete Poll</button>
      <p class="save-msg" id="save-msg-${poll.id}"></p>
    </div>

    <div class="vote-breakdown">
      <p><strong>Going:</strong> ${goingCount} &nbsp;&middot;&nbsp;
         <strong>Maybe:</strong> ${maybeCount} &nbsp;&middot;&nbsp;
         <strong>Not going:</strong> ${notGoingCount} &nbsp;&middot;&nbsp;
         <strong>Haven't voted:</strong> ${notVotedCount}${guestNote}</p>
    </div>
  `;
  wireLocationToggle(card);
  return card;
}

async function loadAdminPolls() {
  const list = document.getElementById('admin-polls-list');
  if (!list) return;

  const [{ data: polls, error: pollsError }, { data: profiles }, { data: votes }, guestsRes] = await Promise.all([
    window.sb.from('polls').select('*'),
    window.sb.from('profiles').select('id, real_name'),
    window.sb.from('poll_votes').select('poll_id, user_id, vote'),
    window.sb.from('poll_guests').select('id, poll_id, vote'),
  ]);
  const guests = guestsRes.error ? [] : (guestsRes.data || []);

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

  const { upcoming, past } = splitUpcomingPast(polls);

  list.innerHTML = '';

  const upcomingHeading = document.createElement('h3');
  upcomingHeading.className = 'polls-section-heading';
  upcomingHeading.textContent = 'Upcoming Polls';
  list.appendChild(upcomingHeading);

  if (!upcoming.length) {
    const p = document.createElement('p');
    p.textContent = 'No upcoming polls.';
    list.appendChild(p);
  } else {
    upcoming.forEach(poll => list.appendChild(renderAdminPollCard(poll, profiles || [], votes || [], profileMap, guests)));
  }

  if (past.length) {
    const pastHeading = document.createElement('h3');
    pastHeading.className = 'polls-section-heading polls-section-past';
    pastHeading.textContent = 'Past Polls';
    list.appendChild(pastHeading);
    past.forEach(poll => list.appendChild(renderAdminPollCard(poll, profiles || [], votes || [], profileMap, guests)));
  }

  list.querySelectorAll('.save-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pollId = btn.dataset.poll;
      const title = list.querySelector(`.title-input[data-poll="${pollId}"]`).value.trim();
      const status = list.querySelector(`.status-select[data-poll="${pollId}"]`).value;
      const description = list.querySelector(`.desc-input[data-poll="${pollId}"]`).value.trim() || null;
      const pollType = list.querySelector(`.type-select[data-poll="${pollId}"]`).value;
      const bookedInfo = list.querySelector(`.booked-info[data-poll="${pollId}"]`).value.trim() || null;
      const location = resolveLocationValue(list, pollId);
      const timeVal = list.querySelector(`.time-input[data-poll="${pollId}"]`).value || null;
      const msgEl = document.getElementById(`save-msg-${pollId}`);

      if (!title) {
        msgEl.textContent = 'Title cannot be blank.';
        msgEl.style.color = 'var(--red)';
        return;
      }

      const { error } = await window.sb.from('polls').update({
        title: title,
        status: status,
        poll_type: pollType,
        description: description,
        booked_info: bookedInfo,
        location: location,
        practice_time: timeVal,
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

  list.querySelectorAll('.delete-poll').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pollId = btn.dataset.poll;
      const title = btn.dataset.title;
      const voteCount = Number(btn.dataset.votes) || 0;
      const msg = `Delete "${title}"?\n\nThis poll has ${voteCount} vote${voteCount === 1 ? '' : 's'}, which will also be removed. This cannot be undone.`;
      if (!confirm(msg)) return;
      const { error } = await window.sb.from('polls').delete().eq('id', pollId);
      if (error) {
        alert('Could not delete poll: ' + error.message);
      } else {
        loadAdminPolls();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', initAdmin);
