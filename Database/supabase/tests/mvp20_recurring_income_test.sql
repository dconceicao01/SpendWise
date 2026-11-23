begin;
select plan(35);

insert into auth.users (id, aud, role, email) values
    ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp20-owner@example.invalid'),
    ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp20-contributor@example.invalid');

select ok((select p.prosecdef from pg_proc p
    where p.oid = 'private.process_due_income_schedules()'::regprocedure),
    'The scheduled processor is SECURITY DEFINER');
select ok((select p.proconfig @> array['search_path=pg_catalog'] from pg_proc p
    where p.oid = 'private.process_due_income_schedules()'::regprocedure),
    'The scheduled processor fixes its search_path');
select ok(not has_function_privilege('anon', 'private.process_due_income_schedules()', 'execute'),
    'Anonymous users cannot execute the scheduled processor');
select ok(not has_function_privilege('authenticated', 'private.process_due_income_schedules()', 'execute'),
    'Authenticated users cannot execute the scheduled processor');
select ok(not has_function_privilege('service_role', 'private.process_due_income_schedules()', 'execute'),
    'The API service role cannot execute the scheduled processor');
select is((select count(*)::integer from cron.job where jobname = 'spendwise-process-recurring-income'), 1,
    'One daily recurring-income job is scheduled');
select ok(not (select p.prosecdef from pg_proc p
    where p.oid = 'public.create_income_schedule(uuid,numeric,text,date,date,text)'::regprocedure),
    'Schedule creation runs with the authenticated caller permissions');
select is(private.next_income_occurrence(date '2027-01-31', date '2027-01-31', 'MONTHLY', 'LAST_DAY'),
    date '2027-02-28', 'Monthly schedules can use the last day in shorter months');
select is(private.next_income_occurrence(date '2027-01-31', date '2027-01-31', 'MONTHLY', 'SKIP'),
    date '2027-03-31', 'Monthly schedules can skip months without the selected day');
select is(private.next_income_occurrence(date '2028-01-31', date '2028-01-31', 'MONTHLY', 'LAST_DAY'),
    date '2028-02-29', 'Last-day behavior accounts for leap years');
select is(private.next_income_occurrence(date '2028-01-31', date '2028-01-31', 'MONTHLY', 'SKIP'),
    date '2028-03-31', 'Skip behavior preserves the day anchor after February');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.create_budget('MVP-20 recurring test', 'PERSONAL', 'EUR')$$,
    'Owner can create a recurring-income test budget');
select lives_ok($$select public.create_budget_category(
    (select id from public.budgets where name = 'MVP-20 recurring test'), 'General')$$,
    'Owner can create the budget category');
select lives_ok($$select public.create_budget_allocation_draft(
    (select id from public.budgets where name = 'MVP-20 recurring test'),
    jsonb_build_array(jsonb_build_object(
        'category_id', (select id from public.budget_categories where name = 'General'),
        'percentage_basis_points', 10000
    )))$$, 'Owner can create the allocation set');
select lives_ok($$select public.activate_budget_allocation_set(
    (select id from public.budgets where name = 'MVP-20 recurring test'),
    (select id from public.budget_allocation_sets where budget_id =
        (select id from public.budgets where name = 'MVP-20 recurring test')))$$,
    'Owner can activate the allocation set');
select lives_ok($$insert into public.budget_periods (budget_id, starts_on, ends_on)
    select id, current_date - 30, current_date + 30 from public.budgets
    where name = 'MVP-20 recurring test'$$, 'Owner can create the matching period');
select lives_ok($$select public.create_income_schedule(
    (select id from public.budgets where name = 'MVP-20 recurring test'),
    900, 'MONTHLY', current_date, null)$$,
    'Owner can create a virtual recurring-income schedule');
select is((select count(*)::integer from public.income_schedules s
    join public.budgets b on b.id = s.budget_id where b.name = 'MVP-20 recurring test'), 1,
    'The schedule is visible to the owner');
select is((select s.monthly_short_month_behavior from public.income_schedules s
    join public.budgets b on b.id = s.budget_id where b.name = 'MVP-20 recurring test'),
    'LAST_DAY', 'The default monthly short-month behavior is persisted');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select lives_ok($$select private.process_due_income_schedules()$$,
    'The private cron processor records the due occurrence');
select is((select count(*)::integer from public.income_entries i
    join public.budgets b on b.id = i.budget_id where b.name = 'MVP-20 recurring test'), 1,
    'One virtual income entry is created');
select is((select sum(s.allocated_amount) from public.income_allocation_snapshots s
    join public.income_entries i on i.id = s.income_entry_id and i.budget_id = s.budget_id
    join public.budgets b on b.id = i.budget_id where b.name = 'MVP-20 recurring test'),
    900.0000::numeric, 'The generated income uses the active allocation');
select ok((select s.next_occurrence_on > current_date from public.income_schedules s
    join public.budgets b on b.id = s.budget_id where b.name = 'MVP-20 recurring test'),
    'The next occurrence advances after a successful record');
select lives_ok($$select private.process_due_income_schedules()$$,
    'The processor can safely run again');
select is((select count(*)::integer from public.income_entries i
    join public.budgets b on b.id = i.budget_id where b.name = 'MVP-20 recurring test'), 1,
    'Repeated processing does not duplicate an occurrence');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.create_income_schedule(
    (select id from public.budgets where name = 'MVP-20 recurring test'),
    100, 'WEEKLY', current_date - 60, null)$$,
    'Owner can create a schedule whose due date has no matching period');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select lives_ok($$select private.process_due_income_schedules()$$,
    'The processor can inspect an occurrence without a matching period');
select is((select count(*)::integer from public.income_schedules s
    join public.budgets b on b.id = s.budget_id
    where b.name = 'MVP-20 recurring test' and s.amount = 100
      and s.next_occurrence_on = current_date - 60), 1,
    'An occurrence without a period remains pending on its original date');

insert into public.budget_members (budget_id, user_id, role)
select id, '20000000-0000-0000-0000-000000000002', 'CONTRIBUTOR'
  from public.budgets where name = 'MVP-20 recurring test';
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.create_income_schedule(
    (select id from public.budgets where name = 'MVP-20 recurring test'),
    75, 'WEEKLY', current_date, null)$$,
    'Contributor can create a recurring-income schedule');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select lives_ok($$update public.budget_members set role = 'VIEWER'
    where user_id = '20000000-0000-0000-0000-000000000002'$$,
    'Owner can change a contributor to viewer');
select is((select s.status from public.income_schedules s
    join public.budget_members m on m.id = s.created_by_member_id and m.budget_id = s.budget_id
    where m.user_id = '20000000-0000-0000-0000-000000000002'), 'PAUSED',
    'A schedule pauses automatically when its creator becomes a viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.update_income_schedule_status(
    (select id from public.budgets where name = 'MVP-20 recurring test'),
    (select s.id from public.income_schedules s
       join public.budget_members m on m.id = s.created_by_member_id and m.budget_id = s.budget_id
      where m.user_id = '20000000-0000-0000-0000-000000000002'),
    'ACTIVE')$$, '42501', null,
    'Owner cannot resume a schedule while its creator is a viewer');
select lives_ok($$update public.budget_members set role = 'CONTRIBUTOR'
    where user_id = '20000000-0000-0000-0000-000000000002'$$,
    'Owner can restore the creator contribution role');
select lives_ok($$select public.update_income_schedule_status(
    (select id from public.budgets where name = 'MVP-20 recurring test'),
    (select s.id from public.income_schedules s
       join public.budget_members m on m.id = s.created_by_member_id and m.budget_id = s.budget_id
      where m.user_id = '20000000-0000-0000-0000-000000000002'),
    'ACTIVE')$$, 'Owner can resume after the creator becomes an active contributor');
select is((select s.status from public.income_schedules s
    join public.budget_members m on m.id = s.created_by_member_id and m.budget_id = s.budget_id
    where m.user_id = '20000000-0000-0000-0000-000000000002'), 'ACTIVE',
    'The resumed schedule is active after authorization returns');
reset role;

select * from finish();
rollback;
