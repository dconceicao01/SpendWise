begin;
select plan(10);

insert into auth.users (id, aud, role, email) values
    ('11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp13-owner@example.invalid'),
    ('11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp13-contributor@example.invalid');

select ok(
    (select p.prosecdef from pg_proc p
      where p.oid = 'public.create_budget(text,text,text)'::regprocedure),
    'Budget creation RPC uses the reviewed SECURITY DEFINER boundary'
);
select ok(
    not has_function_privilege('anon', 'public.create_budget(text,text,text)', 'execute'),
    'Anonymous users cannot execute budget creation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$select public.create_budget('MVP-13 archived test', 'SHARED', 'EUR')$$,
    'Authenticated user can atomically create a shared budget'
);
select is(
    (select private.current_budget_member_role(id) from public.budgets where name = 'MVP-13 archived test'),
    'OWNER',
    'Creator receives the initial OWNER membership'
);
select is(
    (select currency_code from public.budgets where name = 'MVP-13 archived test'),
    'EUR',
    'Budget stores the selected currency'
);
select throws_ok(
    $$select public.create_budget('Invalid type', 'GROUP', 'EUR')$$,
    '22023', null, 'Invalid budget types are rejected'
);
select throws_ok(
    $$select public.create_budget('Invalid currency', 'PERSONAL', 'euro')$$,
    '22023', null, 'Invalid currency codes are rejected'
);

reset role;
insert into public.budget_members (budget_id, user_id, role)
select b.id, '11000000-0000-0000-0000-000000000002', 'CONTRIBUTOR'
  from public.budgets b
 where b.name = 'MVP-13 archived test';
insert into public.budget_periods (budget_id, starts_on, ends_on)
select b.id, current_date - 1, current_date + 1
  from public.budgets b
 where b.name = 'MVP-13 archived test';
select throws_ok(
    $$insert into public.budget_periods (budget_id, starts_on, ends_on)
      select b.id, current_date, current_date + 3
        from public.budgets b where b.name = 'MVP-13 archived test'$$,
    '23P01', null, 'Overlapping budget periods are rejected'
);
insert into public.budget_categories (budget_id, name, created_by_member_id)
select b.id, 'General', m.id
  from public.budgets b
  join public.budget_members m on m.budget_id = b.id and m.role = 'OWNER'
 where b.name = 'MVP-13 archived test';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$update public.budgets set archived_at = now() where name = 'MVP-13 archived test'$$,
    'Owner can archive a budget'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select lives_ok(
    $$insert into public.expense_entries (budget_id, period_id, category_id, recorded_by_member_id, amount, spent_on)
      select b.id, p.id, c.id, m.id, 5, current_date
        from public.budgets b
        join public.budget_periods p on p.budget_id = b.id
        join public.budget_categories c on c.budget_id = b.id
        join public.budget_members m on m.budget_id = b.id and m.user_id = auth.uid() and m.removed_at is null
       where b.name = 'MVP-13 archived test'$$,
    'Active contributor can still record a movement after archive'
);

reset role;
select * from finish();
rollback;
