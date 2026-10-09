function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function formatPollDate(d) {
  if (!d) return 'Date TBD';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${m} ${suffix}`;
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
  return p ? p.real_name : 'Unknown';
}

// Sort players by Division (A-D, blanks last), then Team (blanks last), then name.
function cmpBlankLast(a, b) {
  a = (a || '').trim(); b = (b || '').trim();
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function sortPeople(people) {
  return people.slice().sort((a, b) =>
    cmpBlankLast(a.division, b.division) ||
    cmpBlankLast(a.team_name, b.team_name) ||
    cmpBlankLast(a.real_name, b.real_name)
  );
}

// Label for the separator above each Division/Team group
function groupLabel(p) {
  const div = (p.division || '').trim();
  const team = (p.team_name || '').trim();
  if (div && team) return `Division ${div} \u00b7 ${team}`;
  if (div) return `Division ${div}`;
  if (team) return team;
  return 'No division';
}

function personFor(id, profileMap) {
  return profileMap[id] || { real_name: 'Unknown' };
}

// UI state that survives re-renders (loadPolls re-runs after every vote)
const openResults = new Set();
let showPast = false;

function renderNameColumn(label, cls, people) {
  // Only show separators if anyone in this list has a division or team
  const grouped = people.some(p => (p.division || '').trim() || (p.team_name || '').trim());
  let lastGroup = null;
  const items = people.length
    ? people.map(p => {
        let cls = '';
        if (grouped) {
          const g = groupLabel(p);
          if (lastGroup !== null && g !== lastGroup) cls = ' class="group-start"';
          lastGroup = g;
        }
        return `<li${cls}>${escapeHtml(p.real_name || 'Unknown')}</li>`;
      }).join('')
    : '<li class="results-empty">&mdash;</li>';
  return `
    <div class="results-col ${cls}">
      <h3>${label} <span>(${people.length})</span></h3>
      <ul>${items}</ul>
    </div>`;
}

function renderPollCard(poll, myVoteMap, votes, profiles, profileMap) {
  let statusHtml;
  if (poll.status === 'booked') {
    const timeStr = formatTime(poll.practice_time);
    statusHtml = `<span class="poll-status booked">Booked${timeStr ? ' &middot; ' + timeStr : ''}${poll.booked_info ? ' &mdash; ' + escapeHtml(poll.booked_info) : ''}</span>`;
  } else if (poll.status === 'cancelled') {
    statusHtml = `<span class="poll-status cancelled">Cancelled</span>`;
  } else {
    statusHtml = `<span class="poll-status open">Not Yet Booked</span>`;
  }

  const current = myVoteMap[poll.id];
  const locationLabel = poll.location || 'Any';

  const pollVotes = votes.filter(v => v.poll_id === poll.id);
  const votedIds = new Set(pollVotes.map(v => v.user_id));
  const notVoted = profiles.filter(p => !votedIds.has(p.id));

  const goingList = sortPeople(pollVotes.filter(v => v.vote === 'going').map(v => personFor(v.user_id, profileMap)));
  const maybeList = sortPeople(pollVotes.filter(v => v.vote === 'maybe').map(v => personFor(v.user_id, profileMap)));
  const notGoingList = sortPeople(pollVotes.filter(v => v.vote === 'not_going').map(v => personFor(v.user_id, profileMap)));
  const notVotedList = sortPeople(notVoted);

  const isOpen = openResults.has(String(poll.id));

  const card = document.createElement('section');
  card.className = 'card poll-card';
  card.innerHTML = `
    <div class="poll-head">
      <h2 class="poll-heading"><span class="poll-when">${formatPollDate(poll.practice_date)} &middot; <span class="poll-location">${escapeHtml(locationLabel)}</span><span class="poll-sep"> &middot;</span></span> <span class="poll-title">${escapeHtml(poll.title)}</span></h2>
      ${statusHtml}
    </div>
    ${poll.description ? `<p class="poll-desc">${escapeHtml(poll.description)}</p>` : ''}
    <div class="vote-buttons" data-poll="${poll.id}">
      <button type="button" class="vote-btn vote-going ${current === 'going' ? 'selected' : ''}" data-vote="going">Going <span class="vote-count">${goingList.length}</span></button>
      <button type="button" class="vote-btn vote-maybe ${current === 'maybe' ? 'selected' : ''}" data-vote="maybe">Maybe <span class="vote-count">${maybeList.length}</span></button>
      <button type="button" class="vote-btn vote-not-going ${current === 'not_going' ? 'selected' : ''}" data-vote="not_going">Not Going <span class="vote-count">${notGoingList.length}</span></button>
      <button type="button" class="vote-btn vote-no-vote ${!current ? 'selected' : ''}" data-vote="none">Not Voted <span class="vote-count">${notVotedList.length}</span></button>
    </div>
    <button type="button" class="link-toggle results-toggle" aria-expanded="${isOpen}" data-poll="${poll.id}">${isOpen ? 'Hide results' : 'View results'}</button>
    <div class="vote-results"${isOpen ? '' : ' hidden'}>
      ${renderNameColumn('Going', 'col-going', goingList)}
      ${renderNameColumn('Maybe', 'col-maybe', maybeList)}
      ${renderNameColumn('Not Going', 'col-not-going', notGoingList)}
      ${renderNameColumn("Haven't Voted", 'col-no-vote', notVotedList)}
    </div>
    <button type="button" class="link-toggle results-hide-bottom" aria-expanded="true" data-poll="${poll.id}"${isOpen ? '' : ' hidden'}>Hide results</button>
  `;
  return card;
}

async function loadPolls() {
  const main = document.getElementById('polls-content');

  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) {
    window.location.href = 'auth.html';
    return;
  }

  const [{ data: polls, error }, { data: profiles }, { data: votes }] = await Promise.all([
    window.sb.from('polls').select('*'),
    window.sb.from('profiles').select('id, real_name, division, team_name'),
    window.sb.from('poll_votes').select('poll_id, user_id, vote'),
  ]);

  if (error) {
    main.innerHTML = '<p>Could not load polls right now. Please try again later.</p>';
    console.error(error);
    return;
  }

  if (!polls || !polls.length) {
    main.innerHTML = '<p>No polls yet &mdash; check back soon.</p>';
    return;
  }

  const myVoteMap = {};
  (votes || []).filter(v => v.user_id === session.user.id).forEach(v => { myVoteMap[v.poll_id] = v.vote; });

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  const { upcoming, past } = splitUpcomingPast(polls);

  main.innerHTML = '';

  const upcomingHeading = document.createElement('h2');
  upcomingHeading.className = 'polls-section-heading';
  upcomingHeading.textContent = 'Upcoming Practices';
  main.appendChild(upcomingHeading);

  if (!upcoming.length) {
    const p = document.createElement('p');
    p.textContent = 'No upcoming practices posted yet.';
    main.appendChild(p);
  } else {
    upcoming.forEach(poll => main.appendChild(renderPollCard(poll, myVoteMap, votes || [], profiles || [], profileMap)));
  }

  if (past.length) {
    const pastToggle = document.createElement('button');
    pastToggle.type = 'button';
    pastToggle.className = 'link-toggle past-toggle';
    pastToggle.setAttribute('aria-expanded', String(showPast));
    pastToggle.textContent = showPast ? 'Hide past practices' : `Show past practices (${past.length})`;
    main.appendChild(pastToggle);

    const pastWrap = document.createElement('div');
    pastWrap.className = 'past-polls';
    pastWrap.hidden = !showPast;

    const pastHeading = document.createElement('h2');
    pastHeading.className = 'polls-section-heading polls-section-past';
    pastHeading.textContent = 'Past Practices';
    pastWrap.appendChild(pastHeading);
    past.forEach(poll => pastWrap.appendChild(renderPollCard(poll, myVoteMap, votes || [], profiles || [], profileMap)));
    main.appendChild(pastWrap);

    pastToggle.addEventListener('click', () => {
      showPast = !showPast;
      pastWrap.hidden = !showPast;
      pastToggle.setAttribute('aria-expanded', String(showPast));
      pastToggle.textContent = showPast ? 'Hide past practices' : `Show past practices (${past.length})`;
    });
  }

  function setResultsOpen(card, open) {
    const topBtn = card.querySelector('.results-toggle');
    const panel = card.querySelector('.vote-results');
    const bottomBtn = card.querySelector('.results-hide-bottom');
    panel.hidden = !open;
    bottomBtn.hidden = !open;
    topBtn.setAttribute('aria-expanded', String(open));
    topBtn.textContent = open ? 'Hide results' : 'View results';
    if (open) openResults.add(topBtn.dataset.poll); else openResults.delete(topBtn.dataset.poll);
  }

  main.querySelectorAll('.results-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.poll-card');
      setResultsOpen(card, card.querySelector('.vote-results').hidden);
    });
  });

  main.querySelectorAll('.results-hide-bottom').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.poll-card');
      setResultsOpen(card, false);
      // Keep the collapsed card in view instead of leaving the user further down the page
      if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });

  main.querySelectorAll('.vote-buttons').forEach(group => {
    group.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = group.dataset.poll;
        const vote = btn.dataset.vote;

        group.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        const { error } = vote === 'none'
          ? await window.sb.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', session.user.id)
          : await window.sb.from('poll_votes').upsert(
              { poll_id: pollId, user_id: session.user.id, vote: vote },
              { onConflict: 'poll_id,user_id' }
            );
        if (error) {
          alert('Could not save your vote: ' + error.message);
          console.error(error);
        } else {
          loadPolls();
        }
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', loadPolls);
