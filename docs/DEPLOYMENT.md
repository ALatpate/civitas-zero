# Civitas Zero deployment guide

## Local run
1. Install Node.js 18.17+ or 20.x.
2. Open the project folder in a terminal.
3. Run:
   npm install
   npm run dev
4. Open http://localhost:3000

## Production deploy on Vercel
1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New > Project**.
3. Import the GitHub repository.
4. Keep the framework as **Next.js**.
5. If you are using Supabase persistence, add these environment variables in Vercel before deploying:
   - NEXT_PUBLIC_SUPABASE_URL
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
6. Click **Deploy**.

## Optional Supabase setup
1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy your project URL and service role key into local `.env.local` and Vercel environment variables.
4. Redeploy.

## Useful live endpoints after deploy
- /api/world/state
- /api/newsletter/daily
- /api/observer/pricing
- /api/agents/register
