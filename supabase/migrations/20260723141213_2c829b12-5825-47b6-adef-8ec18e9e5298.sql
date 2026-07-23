set session_replication_role = replica;
do $$
declare
  ck_client_id uuid;
  ck_contract_id uuid;
  junk_contract_ids uuid[];
begin
  select id into ck_client_id from public.clients where name ilike 'Connected Kerb' limit 1;
  if ck_client_id is null then
    insert into public.clients (name) values ('Connected Kerb') returning id into ck_client_id;
  end if;

  select id into ck_contract_id
    from public.contracts
    where client_id = ck_client_id and name = 'Connected Kerb'
    limit 1;
  if ck_contract_id is null then
    insert into public.contracts (name, client_id) values ('Connected Kerb', ck_client_id)
      returning id into ck_contract_id;
  end if;

  select array_agg(id) into junk_contract_ids
    from public.contracts
    where id <> ck_contract_id
      and (name ilike 'ICP SOR%' or name ilike 'CK Site BoQ%');

  if junk_contract_ids is not null then
    update public.rate_cards
      set contract_id = ck_contract_id
      where contract_id = any(junk_contract_ids);

    delete from public.contracts
      where id = any(junk_contract_ids)
        and not exists (select 1 from public.rate_cards rc where rc.contract_id = contracts.id);
  end if;
end $$;
set session_replication_role = origin;