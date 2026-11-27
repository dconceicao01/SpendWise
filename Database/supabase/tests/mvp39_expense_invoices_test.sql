begin;
select plan(14);

insert into auth.users (id, aud, role, email) values
    ('39000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp39-owner@example.invalid'),
    ('39000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp39-viewer@example.invalid');

select ok((select not p.prosecdef from pg_proc p
    where p.oid = 'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)'::regprocedure),
    'Invoice recording remains SECURITY INVOKER');
select ok(not has_function_privilege('anon',
    'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)', 'execute'),
    'Anonymous users cannot record expenses');
select ok(has_function_privilege('authenticated',
    'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)', 'execute'),
    'Authenticated users can record expenses');

set local role authenticated;
select set_config('request.jwt.claim.sub', '39000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.create_budget('MVP-39 invoice test', 'SHARED', 'EUR')$$,
    'Owner can create a shared budget');
select lives_ok($$select public.create_budget_category(
    (select id from public.budgets where name = 'MVP-39 invoice test'), 'Geral')$$,
    'Owner can create the category');
select lives_ok($$insert into public.budget_periods (budget_id, starts_on, ends_on)
    select id, date '2026-01-01', date '2026-12-31'
      from public.budgets where name = 'MVP-39 invoice test'$$,
    'Owner can create the test period');
select lives_ok($$select public.create_expense_label(
    (select id from public.budgets where name = 'MVP-39 invoice test'),
    (select id from public.budget_categories where name = 'Geral'), 'Alimentação')$$,
    'Owner can create an expense label');
select lives_ok($$select public.record_expense(
    (select id from public.budgets where name = 'MVP-39 invoice test'),
    (select id from public.budget_periods where budget_id =
        (select id from public.budgets where name = 'MVP-39 invoice test')),
    (select id from public.budget_categories where name = 'Geral'),
    (select id from public.expense_labels where name = 'Alimentação' and budget_id =
        (select id from public.budgets where name = 'MVP-39 invoice test')),
    12.50, date '2026-11-27', 'Almoço', 'REQUESTED', '509123456')$$,
    'Owner can record a requested invoice with a NIPC');
select is((select invoice_status from public.expense_entries e
    join public.budgets b on b.id = e.budget_id where b.name = 'MVP-39 invoice test'),
    'REQUESTED', 'The requested invoice status is stored');
select is((select supplier_nipc from public.expense_entries e
    join public.budgets b on b.id = e.budget_id
    where b.name = 'MVP-39 invoice test' and e.invoice_status = 'REQUESTED'),
    '509123456', 'The supplier NIPC is stored as text');
select lives_ok($$select public.record_expense(
    (select id from public.budgets where name = 'MVP-39 invoice test'),
    (select id from public.budget_periods where budget_id =
        (select id from public.budgets where name = 'MVP-39 invoice test')),
    (select id from public.budget_categories where name = 'Geral'),
    (select id from public.expense_labels where name = 'Alimentação' and budget_id =
        (select id from public.budgets where name = 'MVP-39 invoice test')),
    4.00, date '2026-11-27', 'Sem fatura')$$,
    'Invoice not requested remains the default state');
select is((select count(*)::integer from public.expense_entries e
    join public.budgets b on b.id = e.budget_id
    where b.name = 'MVP-39 invoice test' and e.invoice_status = 'NOT_REQUESTED'
      and e.supplier_nipc is null),
    1, 'Expenses without a requested invoice do not retain a NIPC');
select throws_ok($$select public.record_expense(
    (select id from public.budgets where name = 'MVP-39 invoice test'),
    (select id from public.budget_periods where budget_id =
        (select id from public.budgets where name = 'MVP-39 invoice test')),
    (select id from public.budget_categories where name = 'Geral'),
    (select id from public.expense_labels where name = 'Alimentação' and budget_id =
        (select id from public.budgets where name = 'MVP-39 invoice test')),
    8.00, date '2026-11-27', 'Sem NIPC', 'REQUESTED', null)$$,
    '22023', null, 'A requested invoice must include a NIPC');

reset role;
insert into public.budget_members (budget_id, user_id, role)
select id, '39000000-0000-0000-0000-000000000002', 'VIEWER'
  from public.budgets where name = 'MVP-39 invoice test';
set local role authenticated;
select set_config('request.jwt.claim.sub', '39000000-0000-0000-0000-000000000002', true);
select is((select supplier_nipc from public.expense_entries e
    join public.budgets b on b.id = e.budget_id
    where b.name = 'MVP-39 invoice test' and e.invoice_status = 'REQUESTED'),
    '509123456', 'An active shared-budget member can see invoice metadata under expense RLS');

reset role;
select * from finish();
rollback;
