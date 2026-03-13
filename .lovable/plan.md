

## Add `street-view-proxy` to Edge Function Config

The `street-view-proxy` edge function exists but is not registered in `supabase/config.toml`, so it won't deploy. 

### Change

Add the following entry to `supabase/config.toml`:

```toml
[functions.street-view-proxy]
verify_jwt = false
```

This is a public-facing proxy that fetches Google Street View images and returns them as base64. It doesn't access any user data or database tables, so `verify_jwt = false` is appropriate here (consistent with other lookup functions like `os-places-lookup` and `dno-capacity-lookup`).

