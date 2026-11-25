begin;
select plan(15);

insert into auth.users (id, aud, role, email) values
    ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp30-owner@example.invalid');

select ok(not (select p.prosecdef from pg_proc p
    where p.oid = 'public.record_income_with_description(uuid,uuid,numeric,date,text,uuid,date,uuid)'::regprocedure),
    'Income description wrapper runs with caller permissions');
select ok(not (select p.prosecdef from pg_proc p
    where p.oid = 'public.create_income_schedule_with_description(uuid,numeric,text,date,date,text,text)'::regprocedure),
    'Schedule description wrapper runs with caller permissions');
select ok(not has_function_privilege('anon',
    'public.record_income_with_description(uuid,uuid,numeric,date,text,uuid,date,uuid)', 'execute'),
    'Anonymous users cannot record incomes with descriptions');
select ok(not has_function_privilege('authenticated', 'private.process_due_income_schedules()', 'execute'),
    'Authenticated users cannot run the recurring-income processor');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.create_budget('MVP-30 income description test', 'PERSONAL', 'EUR')$$,
    'Owner can create a budget for income-description checks');
select lives_ok($$select public.create_budget_category(
    (select id from public.budgets where name = 'MVP-30 income description test'), 'General')$$,
    'Owner can create an income category');
select lives_ok($$select public.create_budget_allocation_draft(
    (select id from public.budgets where name = 'MVP-30 income description test'),
    jsonb_build_array(jsonb_build_object(
        'category_id', (select id from public.budget_categories where name = 'General'),
        'percentage_basis_points', 10000
    )))$$, 'Owner can create an allocation for the income');
select lives_ok($$select public.activate_budget_allocation_set(
    (select id from public.budgets where name = 'MVP-30 income description test'),
    (select id from public.budget_allocation_sets where budget_id =
        (select id from public.budgets where name = 'MVP-30 income description test')))$$,
    'Owner can activate the allocation');
select lives_ok($$insert into public.budget_periods (budget_id, starts_on, ends_on)
    select id, current_date - 1, current_date + 40 from public.budgets
    where name = 'MVP-30 income description test'$$,
    'Owner can create a matching period');
select lives_ok($$select public.record_income_with_description(
    (select id from public.budgets where name = 'MVP-30 income description test'),
    (select id from public.budget_periods p join public.budgets b on b.id = p.budget_id
      where b.name = 'MVP-30 income description test'),
    900, current_date, ' Salary ', null, null, null)$$,
    'Owner can record a one-off income with a description');
select is((select i.description from public.income_entries i
    join public.budgets b on b.id = i.budget_id
    where b.name = 'MVP-30 income description test'), 'Salary',
    'One-off income descriptions are trimmed and stored');
select lives_ok($$select public.create_income_schedule_with_description(
    (select id from public.budgets where name = 'MVP-30 income description test'),
    500, 'MONTHLY', current_date, null, 'LAST_DAY', 'Monthly salary')$$,
    'Owner can create a recurring income with a description');
select is((select s.description from public.income_schedules s
    join public.budgets b on b.id = s.budget_id
    where b.name = 'MVP-30 income description test'), 'Monthly salary',
    'Recurring schedule description is stored');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select lives_ok($$select private.process_due_income_schedules()$$,
    'Cron processor can create the due described income');
select is((select i.description from public.income_entries i
    join public.budgets b on b.id = i.budget_id
    where b.name = 'MVP-30 income description test' and i.schedule_id is not null),
    'Monthly salary', 'Each recurring occurrence copies its schedule description');

select * from finish();
rollback;
