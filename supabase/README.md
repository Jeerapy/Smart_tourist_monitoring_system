# Supabase setup (MVP)

## What this contains
- `schema.sql`: Postgres tables + indexes + RLS policies for the MVP.

## How to apply
1. Create a Supabase project.
2. In Supabase dashboard, open **SQL Editor**.
3. Paste contents of `schema.sql` and run.

## Notes / expectations
- Create users via Supabase Auth (email/password or provider).
- After signup, insert a row into `public.profiles` for that `auth.users.id` with `role` = `user` or `authority`.
  - In production you typically automate this via a trigger; for MVP you can do it manually.

