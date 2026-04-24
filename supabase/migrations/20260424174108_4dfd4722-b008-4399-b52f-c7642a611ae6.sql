-- Resolve PostgREST function-overload conflict for find_nearest_compatible_lv_main.
-- Two overloads exist (p_search_m as integer vs double precision) which causes
-- PGRST203 "Could not choose the best candidate function" errors from the client.
-- Drop the integer-arg overload; the double-precision one accepts integers fine.
DROP FUNCTION IF EXISTS public.find_nearest_compatible_lv_main(double precision, double precision, integer);