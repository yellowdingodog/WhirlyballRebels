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

function renderPollCard(poll, myVoteMap) {
  let statusHtml;
  if (poll.status === 'booked') {
    const timeStr = formatTime(poll.practice_time);
    statusHtml = `<span class="poll-status booked">Booked${timeStr ? ' &middot; ' + timeStr : ''}${poll.booked_info ? ' &mdash; ' + escapeHtml(poll.booked_info) : ''}</span>`;
  } else if (poll.status === 'cancelled') {
    statusHtml = `<span class="poll-status cancelled">Cancelled</span>`;
  } else {
    statusHtml = `<span class="poll-status open">Open</span>`;
  }

  const current = myVoteMap[poll.id];
  const locationLabel = poll.location || 'Any';

  const card = document.createElement('section');
  card.className = 'card poll-card';
  card.innerHTML = `
    <h2>${escapeHtml(poll.title)}</h2>
    <p class="poll-date">${formatPollDate(poll.practice_date)} &middot; <span class="poll-location">${escapeHtml(locationLabel)}</span></p>
    ${statusHtml}
    ${poll.description ? `<p>${escapeHtml(poll.description)}</p>` : ''}
    <div class="vote-buttons" data-poll="${poll.id}">
      <button type="button" class="vote-btn vote-going ${current === 'going' ? 'selected' : ''}" data-vote="going">Going</button>
      <button type="button" class="vote-btn vote-maybe ${current === 'maybe' ? 'selected' : ''}" data-vote="maybe">Maybe</button>
      <button type="button" class="vote-btn vote-not-going ${current === 'not_going' ? 'selected' : ''}" data-vote="not_going">Not Going</button>
    </div>
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

  const { data: polls, error } = await window.sb
    .from('polls')
    .select('*');

  if (error) {
    main.innerHTML = '<p>Could not load polls right now. Please try again later.</p>';
    console.error(error);
    return;
  }

  if (!polls || !polls.length) {
    main.innerHTML = '<p>No polls yet &mdash; check back soon.</p>';
    return;
  }

  const { data: myVotes } = await window.sb
    .from('poll_votes')
    .select('poll_id, vote')
    .eq('user_id', session.user.id);

  const myVoteMap = {};
  (myVotes || []).forEach(v => { myVoteMap[v.poll_id] = v.vote; });

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
    upcoming.forEach(poll => main.appendChild(renderPollCard(poll, myVoteMap)));
  }

  if (past.length) {
    const pastHeading = document.createElement('h2');
    pastHeading.className = 'polls-section-heading polls-section-past';
    pastHeading.textContent = 'Past Practices';
    main.appendChild(pastHeading);
    past.forEach(poll => main.appendChild(renderPollCard(poll, myVoteMap)));
  }

  main.querySelectorAll('.vote-buttons').forEach(group => {
    group.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pollId = group.dataset.poll;
        const vote = btn.dataset.vote;

        group.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        const { error } = await window.sb.from('poll_votes').upsert(
          { poll_id: pollId, user_id: session.user.id, vote: vote },
          { onConflict: 'poll_id,user_id' }
        );
        if (error) {
          alert('Could not save your vote: ' + error.message);
          console.error(error);
        }
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', loadPolls);
