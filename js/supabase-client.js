// ============================================================
// Fill these in from your Supabase project:
// Project Settings → API → Project URL, and Project API keys → anon/public
// ============================================================
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
