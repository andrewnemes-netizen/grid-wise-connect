
REVOKE EXECUTE ON FUNCTION public.is_gridwise_staff(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_wp_team_access(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_wp_access(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_gridwise_staff(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_wp_team_access(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_wp_access(UUID, UUID) TO authenticated, service_role;
