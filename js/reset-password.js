document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('reset-password-error');
    errorEl.style.color = 'var(--red)';
    errorEl.textContent = '';

    const newPassword = document.getElementById('reset-new-password').value;
    const confirmPassword = document.getElementById('reset-confirm-password').value;

    if (newPassword !== confirmPassword) {
      errorEl.textContent = 'Passwords do not match.';
      return;
    }

    // Supabase's client automatically picks up the recovery session
    // from the URL fragment in the reset-password email link.
    const { error } = await window.sb.auth.updateUser({ password: newPassword });

    if (error) {
      errorEl.textContent = error.message;
      return;
    }

    // The recovery link creates a temporary session just so this update
    // could happen — sign out of it so the person has to log in fresh
    // with their new password, rather than ending up already "logged in".
    await window.sb.auth.signOut();

    errorEl.style.color = 'var(--ink-soft)';
    errorEl.textContent = 'Password updated! Redirecting to sign in&hellip;';
    setTimeout(() => { window.location.href = 'auth.html'; }, 1800);
  });
});
