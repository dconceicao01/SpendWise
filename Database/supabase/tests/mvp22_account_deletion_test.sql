begin;
select plan(17);

insert into auth.users (id, aud, role, email) values
    ('22000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp22-owner@example.invalid'),
    ('22000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp22-member@example.invalid');

select ok((select prosecdef from pg_proc where oid =
    'public.request_account_deletion(jsonb)'::regprocedure), 'Deletion RPC is SECURITY DEFINER');
select ok((select proconfig @> array['search_path=pg_catalog'] from pg_proc where oid =
    'public.request_account_deletion(jsonb)'::regprocedure), 'Deletion RPC pins search_path');
select ok(not has_function_privilege('anon', 'public.request_account_deletion(jsonb)', 'execute'),
    'Anonymous users cannot request deletion');
select ok(not has_function_privilege('service_role', 'public.request_account_deletion(jsonb)', 'execute'),
    'The server Admin role cannot call the user-scoped cleanup RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.create_budget('MVP-22 personal', 'PERSONAL', 'EUR')$$,
    'User creates a personal budget before deletion');
select lives_ok($$select public.create_budget('MVP-22 shared', 'SHARED', 'EUR')$$,
    'User creates a shared budget before deletion');
reset role;

insert into public.budget_members (budget_id, user_id, role)
select id, '22000000-0000-0000-0000-000000000002', 'CONTRIBUTOR'
  from public.budgets where name = 'MVP-22 shared';

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.request_account_deletion('[]'::jsonb)$$, '22023', null,
    'Deletion is rejected until every shared ownership is transferred');
select lives_ok($$select public.request_account_deletion(
    (select jsonb_agg(jsonb_build_object('budget_id', b.id, 'target_member_id', m.id))
       from public.budgets b join public.budget_members m on m.budget_id = b.id
      where b.name = 'MVP-22 shared' and m.user_id = '22000000-0000-0000-0000-000000000002')
)$$, 'User transfers ownership and atomically requests deletion');
reset role;

select is((select role from public.budget_members where user_id =
    '22000000-0000-0000-0000-000000000002' and removed_at is null), 'OWNER',
    'Selected active member receives ownership');
select is((select count(*)::integer from public.budget_members where budget_id =
    (select id from public.budgets where name = 'MVP-22 shared') and user_id is null and removed_at is not null), 1,
    'Departing member is pseudonymized while shared history row remains');
select is((select count(*)::integer from public.budgets where name = 'MVP-22 personal'), 0,
    'Personal budget is deleted');
select is((select count(*)::integer from public.budgets), 1,
    'Shared budget and its history remain');
set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
select ok(private.account_deletion_pending(), 'Pending deletion gates current user operations until Auth cleanup');
select lives_ok($$select public.request_account_deletion(
    (select jsonb_agg(jsonb_build_object('budget_id', b.id, 'target_member_id', m.id))
       from public.budgets b join public.budget_members m on m.budget_id = b.id
      where b.name = 'MVP-22 shared' and m.user_id = '22000000-0000-0000-0000-000000000002')
)$$, 'A retry after database commit is idempotent while Auth Admin is pending');
select throws_ok($$select public.create_budget('MVP-22 blocked', 'PERSONAL', 'EUR')$$, '42501', null,
    'Pending deletion cannot create new memberships or budgets');

reset role;
delete from auth.users where id = '22000000-0000-0000-0000-000000000001';
select ok(not exists (select 1 from private.account_deletion_requests
    where user_id = '22000000-0000-0000-0000-000000000001'),
    'Auth identity deletion clears the temporary tombstone');
set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.request_account_deletion('[]'::jsonb)$$,
    'A completed account deletion remains safe when its HTTP response is retried');

select * from finish();
rollback;
