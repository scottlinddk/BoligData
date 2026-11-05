# Coolify deployment

Build the repository root with Dockerfile on port 3000. The container serves the Vite build and all existing API handlers, retaining authentication and RLS in those handlers. /healthz is a process health endpoint.

Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY as build arguments using the self-hosted Kong HTTPS API URL and its anon key. Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY at runtime using the same instance. The service-role key must never be prefixed VITE_. Set FRONTEND_URL to https://boligdata.scottlind.dk. Existing sessions need a new sign-in after switching Supabase instances.

Copy DATAFORDELER_API_KEY, RESEND_API_KEY, CRON_SECRET and GITHUB_DISPATCH_TOKEN from their original secret sources. Vercel sensitive variables cannot be exported. Configure notification scheduling and Supabase Auth site/redirect URLs separately, then verify sign-in, account data, address lookup, emails and admin actions before retiring Vercel.

The adapter tests run during the Docker build. It limits request bodies to 4 MiB, maps dynamic route parameters with precedence over query strings, returns API 404s as JSON and only serves frontend files from dist. Run node --test deploy/http.test.mjs locally.
