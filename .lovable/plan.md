
## Goal

Grant platform admin to both internal accounts so they can create organisations.

## Change

One data update on `public.profiles`:

- Set `is_platform_admin = true` for the profile rows whose `user_id` matches the auth users with emails:
  - `andrew.nemes@ecopoweruk.com`
  - `liam.french@ecopoweruk.com`

After this, both accounts will see the **New Organisation** button on `/admin → Organisations` and can create orgs. No code or schema changes.

Approve to apply.
