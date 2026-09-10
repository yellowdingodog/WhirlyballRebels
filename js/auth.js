function switchAuthTab(which) {
  document.getElementById('signin-form').style.display = which === 'signin' ? 'block' : 'none';
  document.getElementById('signup-form').style.display = which === 'signup' ? 'block' : 'none';
  document.getElementById('tab-signin').classList.toggle('active', which === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', which === 'signup');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tab-signin').addEventListener('click', () => switchAuthTab('signin'));
  document.getElementById('tab-signup').addEventListener('click', () => switchAuthTab('signup'));

  document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('signin-error');
    errorEl.textContent = '';

    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;

    const { error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = error.message;
      return;
    }
    window.location.href = 'polls.html';
  });

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('signup-error');
    errorEl.textContent = '';

    const realName = document.getElementById('signup-realname').value.trim();
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!realName || !username) {
      errorEl.textContent = 'Please fill in your name and a username.';
      return;
    }

    const { data, error } = await window.sb.auth.signUp({ email, password });
    if (error) {
      errorEl.textContent = error.message;
      return;
    }

    if (data.user) {
      const { error: profileError } = await window.sb.from('profiles').insert({
        id: data.user.id,
        real_name: realName,
        username: username,
      });
      if (profileError) {
        errorEl.textContent = 'Account created, but we could not save your profile: ' + profileError.message;
        return;
      }
    }

    if (data.session) {
      window.location.href = 'polls.html';
    } else {
      errorEl.style.color = 'var(--ink-soft)';
      errorEl.textContent = 'Check your email to confirm your account, then sign in.';
    }
  });
});
