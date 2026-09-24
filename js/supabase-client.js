// ============================================================
// Fill these in from your Supabase project:
// Project Settings → API → Project URL, and Project API keys → anon/public
// ============================================================
const SUPABASE_URL = "https://yogawssthkejblvczyqa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvZ2F3c3N0aGtlamJsdmN6eXFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MjI0OTgsImV4cCI6MjEwNDQ5ODQ5OH0.E59qOrLfzXf3Ih-ct1l2RsqrHv_SbRE99jUUNGf7PRg";

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Supabase's password-reset email links create a session as soon as the
// client loads on ANY page (that's just how the recovery token works).
// Without this, landing on the wrong page just looks like "I got signed
// in" with no way to actually set a new password. This catches that
// specific event and sends the person to the right page no matter where
// the link actually opened.
window.sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    const path = window.location.pathname;
    if (!path.endsWith('reset-password.html')) {
      window.location.href = 'reset-password.html';
    }
  }
});
