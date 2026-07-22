-- Consolidate poc_quote_review + poc_quote_sent into a single poc_quote stage
ALTER TYPE public.site_stage_key ADD VALUE IF NOT EXISTS 'poc_quote';
