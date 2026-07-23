## Change

Apply the uploaded `Admin.tsx` diff. The only functional change vs current is the Estimating tab label/icon:

- Swap `Library` icon import for `Receipt` in `src/pages/Admin.tsx`.
- Update the `estimating` `TabsTrigger` from `<Library …/>Estimating` to `<Receipt …/>Estimating & Quotes`.

No other tabs, routes, components, imports, or logic change. Existing consolidated `EstimatingLibrary` panel and `/admin/rate-cards/:versionId` route remain wired as-is.