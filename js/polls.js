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

async function loadPolls() {
  const main = document.getElementById('polls-content');

  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) {
    window.location.href = 'auth.html';
    return;
  }

  const { data: polls, error } = await window.sb
    .from('polls')
    .select('*')
    .order('practice_date', { ascending: true });

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

  main.innerHTML = '';

  for (const poll of polls) {
    const card = document.createElement('section');
    card.className = 'card poll-card';

    let statusHtml;
    if (poll.status === 'booked') {
      statusHtml = `<span class="poll-status booked">Booked${poll.booked_info ? ': ' + escapeHtml(poll.booked_info) : ''}</span>`;
    } else if (poll.status === 'cancelled') {
      statusHtml = `<span class="poll-status cancelled">Cancelled</span>`;
    } else {
      statusHtml = `<span class="poll-status open">Open</span>`;
    }

    const current = myVoteMap[poll.id];

    card.innerHTML = `
      <h2>${escapeHtml(poll.title)}</h2>
      ${poll.practice_date ? `<p class="poll-date">${formatPollDate(poll.practice_date)}</p>` : ''}
      ${statusHtml}
      ${poll.description ? `<p>${escapeHtml(poll.description)}</p>` : ''}
      <div class="vote-buttons" data-poll="${poll.id}">
        <button type="button" class="vote-btn vote-going ${current === 'going' ? 'selected' : ''}" data-vote="going">Going</button>
        <button type="button" class="vote-btn vote-maybe ${current === 'maybe' ? 'selected' : ''}" data-vote="maybe">Maybe</button>
        <button type="button" class="vote-btn vote-not-going ${current === 'not_going' ? 'selected' : ''}" data-vote="not_going">Not Going</button>
      </div>
    `;
    main.appendChild(card);
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
