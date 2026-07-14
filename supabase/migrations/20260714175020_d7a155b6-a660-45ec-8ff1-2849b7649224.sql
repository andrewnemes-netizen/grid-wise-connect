
DO $$
DECLARE
  wp uuid := '68b5250f-8da7-4621-8120-5133d3ca6093';
  creator uuid := 'fb6b2d44-212e-41ed-b83d-d8ed598a80ea';
  org uuid;
  new_site uuid;
  i int;
  names text[] := ARRAY[
    'Kingsway Depot','Riverside Retail Park','Hillcrest Business Centre','Meadowfield Industrial',
    'Oakwood Logistics Hub','Central Park & Ride','Northgate Fleet Yard','Southbank Bus Depot',
    'Elmtree Superstore','Harbourview Warehouse','Beacon Hill Interchange','Willow Lane Distribution',
    'Cathedral Square Car Park','Foxglove Trading Estate','Ironworks Regeneration Site'
  ];
  postcodes text[] := ARRAY[
    'SW1A 1AA','E14 5AB','N1 9GU','SE1 7TP','W1D 3QF','EC2R 8AH','NW1 6XE','SE10 0ER',
    'E1 6AN','SW11 7BW','N7 8AA','E20 1EJ','SW15 2NU','BR1 1LR','CR0 2NF'
  ];
  kws numeric[] := ARRAY[350,600,180,850,420,275,1100,500,220,780,340,950,160,610,400];
  stages text[] := ARRAY[
    'done','done','done','done','done',
    'in_progress','in_progress','in_progress',
    'review','review',
    'blocked',
    'not_started','not_started','not_started','not_started'
  ];
  progress int;
BEGIN
  IF EXISTS (SELECT 1 FROM sites WHERE site_name = 'Kingsway Depot' AND created_by = creator) THEN
    RETURN;
  END IF;

  SELECT org_id INTO org FROM org_members WHERE user_id = creator LIMIT 1;

  FOR i IN 1..15 LOOP
    INSERT INTO sites (site_name, postcode, proposed_kw, site_type, status, created_by, org_id, client_org, viability_index, grid_readiness, deployment_class, cost_band)
    VALUES (
      names[i], postcodes[i], kws[i], 'ev_hub', 'active', creator, org, 'EcoPower UK',
      50 + (i*3) % 45,
      (ARRAY['Strong','Moderate','Constrained'])[1 + i % 3],
      (ARRAY['Fast Deploy','Needs Reinforcement','Complex'])[1 + i % 3],
      (ARRAY['Low','Medium','High'])[1 + i % 3]
    )
    RETURNING id INTO new_site;

    INSERT INTO wp_sites (work_package_id, site_id, sequence, local_ref)
    VALUES (wp, new_site, i + 100, 'D' || lpad(i::text, 2, '0'));

    progress := CASE stages[i]
      WHEN 'done' THEN 8
      WHEN 'review' THEN 7
      WHEN 'in_progress' THEN 4 + (i % 3)
      WHEN 'blocked' THEN 3
      ELSE 0
    END;

    UPDATE site_stage_status SET
      survey     = CASE WHEN progress >= 1 THEN 'done' ELSE 'not_started' END::site_stage_state,
      design     = CASE WHEN progress >= 2 THEN 'done' WHEN progress = 1 THEN 'in_progress' ELSE 'not_started' END::site_stage_state,
      dno        = CASE WHEN progress >= 3 THEN 'done' WHEN progress = 2 THEN 'in_progress' ELSE 'not_started' END::site_stage_state,
      permit     = CASE WHEN progress >= 4 THEN 'done'
                        WHEN progress = 3 THEN (CASE WHEN stages[i] = 'blocked' THEN 'blocked' ELSE 'in_progress' END)
                        ELSE 'not_started' END::site_stage_state,
      civils     = CASE WHEN progress >= 5 THEN 'done' WHEN progress = 4 THEN 'in_progress' ELSE 'not_started' END::site_stage_state,
      electrical = CASE WHEN progress >= 6 THEN 'done' WHEN progress = 5 THEN 'in_progress' ELSE 'not_started' END::site_stage_state,
      meter      = CASE WHEN progress >= 7 THEN 'done' WHEN progress = 6 THEN 'in_progress' ELSE 'not_started' END::site_stage_state,
      handover   = CASE WHEN progress >= 8 THEN 'done' WHEN progress = 7 THEN 'review'    ELSE 'not_started' END::site_stage_state,
      updated_at = now()
    WHERE work_package_id = wp AND site_id = new_site;
  END LOOP;
END $$;
