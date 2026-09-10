async function initAuthNav() {
  const signInLink = document.getElementById('nav-signin-link');
  const userBox = document.getElementById('nav-user-box');
  const usernameEl = document.getElementById('nav-username');
  const pollsItem = document.getElementById('nav-polls-item');
  const adminItem = document.getElementById('nav-admin-item');
  const signOutBtn = document.getElementById('nav-signout-btn');

  let session = null;
  try {
    const { data } = await window.sb.auth.getSession();
    session = data.session;
  } catch (err) {
    console.error('Auth check failed', err);
  }

  if (session) {
    if (signInLink) signInLink.style.display = 'none';
    if (userBox) userBox.style.display = 'flex';
    if (pollsItem) pollsItem.style.display = 'list-item';

    try {
      const { data: profile } = await window.sb
        .from('profiles')
        .select('real_name, username, is_admin')
        .eq('id', session.user.id)
        .single();

      if (usernameEl) {
        usernameEl.textContent = profile ? (profile.username || profile.real_name) : session.user.email;
      }
      if (adminItem) {
        adminItem.style.display = (profile && profile.is_admin) ? 'list-item' : 'none';
      }
    } catch (err) {
      console.error('Profile lookup failed', err);
    }
  } else {
    if (signInLink) signInLink.style.display = 'inline';
    if (userBox) userBox.style.display = 'none';
    if (pollsItem) pollsItem.style.display = 'none';
    if (adminItem) adminItem.style.display = 'none';
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await window.sb.auth.signOut();
      window.location.href = 'index.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', initAuthNav);
