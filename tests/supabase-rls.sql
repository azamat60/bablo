begin;
select set_config('bablo.test_a', gen_random_uuid()::text, true), set_config('bablo.test_b', gen_random_uuid()::text, true);
insert into auth.users(id) values(current_setting('bablo.test_a')::uuid),(current_setting('bablo.test_b')::uuid);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('bablo.test_a'),'role','authenticated')::text,true);
insert into public.budget_ledgers(user_id,state,revision) values(current_setting('bablo.test_a')::uuid,'{"wallets":[],"categories":[],"transactions":[]}',1);
do $$ declare n integer; begin
  if (select count(*) from public.budget_ledgers) <> 1 then raise exception 'owner read failed'; end if;
  update public.budget_ledgers set revision=2 where user_id=current_setting('bablo.test_a')::uuid and revision=1;
  get diagnostics n = row_count; if n <> 1 then raise exception 'CAS failed'; end if;
  update public.budget_ledgers set revision=2 where user_id=current_setting('bablo.test_a')::uuid and revision=1;
  get diagnostics n = row_count; if n <> 0 then raise exception 'stale CAS accepted'; end if;
  begin
    insert into public.budget_ledgers(user_id,state,revision) values(current_setting('bablo.test_b')::uuid,'{}',1);
    raise exception 'cross-owner insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.budget_ledgers set user_id=current_setting('bablo.test_b')::uuid;
    raise exception 'owner reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.acquire_ai_attempt(current_setting('bablo.test_a')::uuid,gen_random_uuid());
    raise exception 'quota bypass allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('bablo.test_b'),'role','authenticated')::text,true);
do $$ declare n integer; begin
  if (select count(*) from public.budget_ledgers) <> 0 then raise exception 'cross-owner read allowed'; end if;
  update public.budget_ledgers set state='{}',revision=3 where user_id=current_setting('bablo.test_a')::uuid;
  get diagnostics n = row_count; if n <> 0 then raise exception 'cross-owner update allowed'; end if;
end $$;
insert into public.budget_ledgers(user_id,state,revision) values(current_setting('bablo.test_b')::uuid,'{}',1);
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  begin perform * from public.budget_ledgers; raise exception 'anonymous read allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.budget_ledgers(user_id,state,revision) values(gen_random_uuid(),'{}',1); raise exception 'anonymous write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare result jsonb; lease uuid := gen_random_uuid(); i integer; uid uuid := current_setting('bablo.test_a')::uuid; begin
  result := public.acquire_ai_attempt(uid,lease);
  if (result->>'allowed')::boolean <> true then raise exception 'initial quota refused'; end if;
  result := public.acquire_ai_attempt(uid,gen_random_uuid());
  if (result->>'allowed')::boolean <> false then raise exception 'parallel quota allowed'; end if;
  perform public.release_ai_attempt(uid,gen_random_uuid());
  if not exists(select 1 from private.ai_active where user_id=uid) then raise exception 'wrong lease released'; end if;
  perform public.release_ai_attempt(uid,lease);
  for i in 2..10 loop
    lease := gen_random_uuid(); result := public.acquire_ai_attempt(uid,lease);
    if (result->>'allowed')::boolean <> true then raise exception 'quota before 10 refused'; end if;
    perform public.release_ai_attempt(uid,lease);
  end loop;
  result := public.acquire_ai_attempt(uid,gen_random_uuid());
  if (result->>'allowed')::boolean <> false or (result->>'retry_after')::integer < 1 then raise exception 'hourly quota not enforced'; end if;
  update private.ai_usage set attempts=30 where scope='day:' || uid;
  update private.ai_usage set attempts=0 where scope='hour:' || uid;
  result := public.acquire_ai_attempt(uid,gen_random_uuid());
  if (result->>'allowed')::boolean <> false then raise exception 'daily quota not enforced'; end if;
  update private.ai_usage set attempts=100 where scope='app';
  result := public.acquire_ai_attempt(current_setting('bablo.test_b')::uuid,gen_random_uuid());
  if (result->>'allowed')::boolean <> false then raise exception 'app quota not enforced'; end if;
end $$;
rollback;
select 'RLS, ownership, anonymous access, CAS and AI limits passed; test data rolled back' as result;
