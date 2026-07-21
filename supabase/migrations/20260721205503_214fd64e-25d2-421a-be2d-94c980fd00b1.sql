
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'intake';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'poc_application';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'poc_offer_awaiting';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'poc_quote_review';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'poc_quote_sent';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'client_site_selection';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'survey_po_gate';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'survey_allocation';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'survey_completed';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'build_design_po_gate';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'build_quote_design';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'build_quote_sent';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'build_handover_gate';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'icp_po';
ALTER TYPE site_stage_key ADD VALUE IF NOT EXISTS 'connections_handover_gate';

ALTER TABLE public.site_stage_status
  ADD COLUMN IF NOT EXISTS recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipient_contact_ids uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.enforce_stage_done_recipient()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.workflow_status = 'done'
     AND NEW.owner_id IS NULL
     AND COALESCE(array_length(NEW.recipient_user_ids, 1), 0) = 0
     AND COALESCE(array_length(NEW.recipient_contact_ids, 1), 0) = 0
  THEN
    RAISE EXCEPTION 'A stage cannot be marked Done without at least one recipient.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_stage_done_recipient ON public.site_stage_status;
CREATE TRIGGER trg_enforce_stage_done_recipient
  BEFORE INSERT OR UPDATE ON public.site_stage_status
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_done_recipient();

CREATE OR REPLACE FUNCTION public.notify_stage_owner_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_stage_label text; v_site_name text; v_wp_name text;
BEGIN
  SELECT COALESCE(label, NEW.stage::text) INTO v_stage_label
    FROM public.stage_definitions WHERE key = NEW.stage::text LIMIT 1;
  IF v_stage_label IS NULL THEN v_stage_label := NEW.stage::text; END IF;
  SELECT site_name INTO v_site_name FROM public.sites WHERE id = NEW.site_id;
  SELECT name INTO v_wp_name FROM public.work_packages WHERE id = NEW.work_package_id;

  IF NEW.owner_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link, entity_type, entity_id)
    VALUES (NEW.owner_id,'stage_assigned','Assigned: '||v_stage_label,
      COALESCE(v_wp_name,'Work package')||' · '||COALESCE(v_site_name,'Site'),
      '/wp/'||NEW.work_package_id||'/sites/matrix?site='||NEW.site_id,
      'site_stage_status', NEW.id);
  END IF;

  IF TG_OP='UPDATE' AND OLD.owner_id IS NOT NULL AND (NEW.owner_id IS NULL OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link, entity_type, entity_id)
    VALUES (OLD.owner_id,'stage_unassigned','Unassigned: '||v_stage_label,
      COALESCE(v_wp_name,'Work package')||' · '||COALESCE(v_site_name,'Site'),
      '/wp/'||NEW.work_package_id||'/sites/matrix?site='||NEW.site_id,
      'site_stage_status', NEW.id);
  END IF;

  IF COALESCE(array_length(NEW.recipient_user_ids,1),0) > 0 THEN
    FOR v_uid IN
      SELECT DISTINCT u FROM unnest(NEW.recipient_user_ids) u
      WHERE TG_OP='INSERT' OR NOT (u = ANY (COALESCE(OLD.recipient_user_ids,'{}'::uuid[])))
    LOOP
      INSERT INTO public.notifications (user_id, kind, title, body, link, entity_type, entity_id)
      VALUES (v_uid,'stage_assigned','Next up: '||v_stage_label,
        COALESCE(v_wp_name,'Work package')||' · '||COALESCE(v_site_name,'Site'),
        '/wp/'||NEW.work_package_id||'/sites/matrix?site='||NEW.site_id,
        'site_stage_status', NEW.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.stage_definitions (org_id, key, label, category, order_index, is_terminal, requires_owner, allowed_owner_roles)
VALUES
  (NULL,'intake','Site/WP Intake','pre-con',100,false,true,ARRAY['admin','engineer']),
  (NULL,'poc_application','PoC Application','pre-con',110,false,true,ARRAY['admin','engineer']),
  (NULL,'poc_offer_awaiting','Awaiting PoC Offer','pre-con',120,false,true,ARRAY['admin','engineer']),
  (NULL,'poc_quote_review','PoC Quote Review','pre-con',130,false,true,ARRAY['admin','engineer']),
  (NULL,'poc_quote_sent','PoC Quote Sent to Client','pre-con',140,false,true,ARRAY['admin','engineer']),
  (NULL,'client_site_selection','Client Site Selection','pre-con',150,false,true,ARRAY['admin','engineer','client']),
  (NULL,'survey_po_gate','Survey PO Gate','pre-con',160,false,true,ARRAY['admin','engineer']),
  (NULL,'survey_allocation','Survey Allocation','pre-con',170,false,true,ARRAY['admin','engineer']),
  (NULL,'survey_completed','Survey Completed','pre-con',180,false,true,ARRAY['admin','engineer']),
  (NULL,'build_design_po_gate','EV Build Design PO Gate','design',200,false,true,ARRAY['admin','engineer']),
  (NULL,'build_quote_design','EV Build Quote & Design Production','design',210,false,true,ARRAY['admin','engineer']),
  (NULL,'build_quote_sent','EV Build Quote Sent to Client','design',220,false,true,ARRAY['admin','engineer']),
  (NULL,'build_handover_gate','Build Handover Gate','handover',230,true,true,ARRAY['admin','engineer']),
  (NULL,'icp_po','ICP PO Awaited/Received','delivery',300,false,true,ARRAY['admin','engineer']),
  (NULL,'connections_handover_gate','Connections Handover Gate','handover',310,true,true,ARRAY['admin','engineer'])
ON CONFLICT (org_id, key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  order_index = EXCLUDED.order_index,
  is_terminal = EXCLUDED.is_terminal,
  requires_owner = EXCLUDED.requires_owner,
  allowed_owner_roles = EXCLUDED.allowed_owner_roles;
