begin;
select plan(13);

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    ('15000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp15-owner@example.invalid', '{}'),
    ('15000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp15-member@example.invalid', '{"full_name":"Shared Name"}'),
    ('15000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'mvp15-outsider@example.invalid', '{"full_name":"Outside Name"}');
insert into public.profiles (user_id, full_name, phone_e164) values
    ('15000000-0000-0000-0000-000000000001', 'Owner Name', '+351912345678'),
    ('15000000-0000-0000-0000-000000000003', 'Outside Name', '+351912345670');

select ok(
    (select p.prosecdef from pg_proc p
      where p.oid = 'public.list_budget_members(uuid)'::regprocedure),
    'Member listing is a narrow SECURITY DEFINER function'
);
select ok(
    (select p.proconfig @> array['search_path=pg_catalog'] from pg_proc p
      where p.oid = 'public.list_budget_members(uuid)'::regprocedure),
    'Member listing fixes its search_path'
);
select ok(
    not has_function_privilege('anon', 'public.list_budget_members(uuid)', 'execute'),
    'Anonymous users cannot list member names'
);
select is(
    (select count(*)::integer from pg_proc p, unnest(p.proargmodes) as mode
      where p.oid = 'public.list_budget_members(uuid)'::regprocedure and mode = 't'),
    5,
    'Member listing returns only its five declared fields'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$select public.create_budget('MVP-15 member access', 'SHARED', 'EUR')$$,
    'Owner can create the shared test budget'
);
reset role;
insert into public.budget_members (budget_id, user_id, role)
select id, '15000000-0000-0000-0000-000000000002', 'CONTRIBUTOR'
  from public.budgets where name = 'MVP-15 member access';

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select is(
    (select count(*)::integer from public.list_budget_members(
        (select id from public.budgets where name = 'MVP-15 member access'))),
    2,
    'An active member sees only active memberships in their budget'
);
select is(
    (select display_name from public.list_budget_members(
        (select id from public.budgets where name = 'MVP-15 member access'))
      where member_id = (select id from public.budget_members
        where user_id = '15000000-0000-0000-0000-000000000002')),
    'Shared Name',
    'An active member sees another member profile name'
);
select is(
    (select count(*)::integer from public.profiles
      where user_id = '15000000-0000-0000-0000-000000000002'),
    0,
    'Profile PII remains private through direct table reads'
);
select lives_ok(
    $$update public.budget_members set role = 'VIEWER'
      where user_id = '15000000-0000-0000-0000-000000000002'$$,
    'Owner can change an active member role'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select is(
    (select role from public.list_budget_members(
        (select id from public.budgets where name = 'MVP-15 member access'))
      where member_id = (select id from public.budget_members
        where user_id = '15000000-0000-0000-0000-000000000002')),
    'VIEWER',
    'A role change is visible to the next authenticated request'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000003', true);
select throws_ok(
    $$select * from public.list_budget_members(
        (select id from public.budgets where name = 'MVP-15 member access'))$$,
    '42501', null, 'An outsider cannot list shared member names'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$update public.budget_members set removed_at = now()
      where user_id = '15000000-0000-0000-0000-000000000002' and removed_at is null$$,
    'Owner can remove a membership while preserving its history'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select throws_ok(
    $$select * from public.list_budget_members(
        (select id from public.budgets where name = 'MVP-15 member access'))$$,
    '42501', null, 'A removed member immediately loses access to member names'
);

reset role;
select * from finish();
rollback;
