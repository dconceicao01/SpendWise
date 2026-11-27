begin;
select plan(15);

insert into auth.users (id, aud, role, email) values
    ('36000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp36-owner@example.invalid'),
    ('36000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp36-viewer@example.invalid');

select is(
    (select count(*)::integer from pg_proc p where p.oid in (
        'public.create_expense_label(uuid,uuid,text)'::regprocedure,
        'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)'::regprocedure,
        'public.update_expense_label(uuid,uuid,uuid)'::regprocedure
    ) and not p.prosecdef),
    3,
    'Label and expense RPCs run as the authenticated caller'
);
select ok(
    not has_function_privilege('anon', 'public.create_expense_label(uuid,uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.update_expense_label(uuid,uuid,uuid)', 'execute'),
    'Anonymous cannot manage or use expense labels'
);
select ok(
    has_function_privilege('authenticated', 'public.create_expense_label(uuid,uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.update_expense_label(uuid,uuid,uuid)', 'execute'),
    'Authenticated members can use the narrow expense label RPCs'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '36000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.create_budget('MVP-36 label test', 'SHARED', 'EUR')$$, 'Owner creates test budget');
select lives_ok($$select public.create_budget_category(
    (select id from public.budgets where name = 'MVP-36 label test'), 'Geral')$$, 'Owner creates category');
select lives_ok($$insert into public.budget_periods (budget_id, starts_on, ends_on)
    select id, current_date - 5, current_date + 5 from public.budgets where name = 'MVP-36 label test'$$,
    'Owner creates a period');
select is(
    (select count(*)::integer from public.expense_labels l
      join public.budgets b on b.id = l.budget_id
     where b.name = 'MVP-36 label test' and l.name = 'Por classificar' and l.is_system),
    1,
    'New categories receive a reserved unclassified label'
);
select throws_ok($$select public.record_expense(
    (select id from public.budgets where name = 'MVP-36 label test'),
    (select id from public.budget_periods where budget_id = (select id from public.budgets where name = 'MVP-36 label test')),
    (select id from public.budget_categories where name = 'Geral'), null,
    20, current_date, 'Café')$$, '22023', null, 'A new expense cannot omit its label');
select lives_ok($$select public.create_expense_label(
    (select id from public.budgets where name = 'MVP-36 label test'),
    (select id from public.budget_categories where name = 'Geral'), 'Cultura')$$,
    'Owner creates a category-scoped label');
select throws_ok($$select public.create_expense_label(
    (select id from public.budgets where name = 'MVP-36 label test'),
    (select id from public.budget_categories where name = 'Geral'), ' cultura ')$$,
    '23505', null, 'Label names are unique case-insensitively within a category');
select throws_ok($$select public.record_expense(
    (select id from public.budgets where name = 'MVP-36 label test'),
    (select id from public.budget_periods where budget_id = (select id from public.budgets where name = 'MVP-36 label test')),
    (select id from public.budget_categories where name = 'Geral'),
    (select id from public.expense_labels where name = 'Por classificar' and budget_id = (select id from public.budgets where name = 'MVP-36 label test')),
    20, current_date, 'Café')$$, '22023', null, 'Reserved migration labels cannot be used for new expenses');
select throws_ok($$insert into public.expense_entries
    (budget_id, period_id, category_id, label_id, recorded_by_member_id, amount, spent_on)
    select b.id, p.id, c.id, l.id, m.id, 20, current_date
      from public.budgets b
      join public.budget_periods p on p.budget_id = b.id
      join public.budget_categories c on c.budget_id = b.id
      join public.expense_labels l on l.budget_id = b.id and l.category_id = c.id and l.is_system
      join public.budget_members m on m.budget_id = b.id and m.user_id = auth.uid() and m.removed_at is null
     where b.name = 'MVP-36 label test'$$, '22023', null,
    'Direct table writes cannot bypass the label selector with the migration bucket');
select lives_ok($$select public.record_expense(
    (select id from public.budgets where name = 'MVP-36 label test'),
    (select id from public.budget_periods where budget_id = (select id from public.budgets where name = 'MVP-36 label test')),
    (select id from public.budget_categories where name = 'Geral'),
    (select id from public.expense_labels where name = 'Cultura' and budget_id = (select id from public.budgets where name = 'MVP-36 label test')),
    20, current_date, 'Café')$$, 'Owner records a labeled expense');
select lives_ok($$select public.update_expense_label(
    (select id from public.budgets where name = 'MVP-36 label test'),
    (select id from public.expense_entries where budget_id = (select id from public.budgets where name = 'MVP-36 label test')),
    (select id from public.expense_labels where name = 'Cultura' and budget_id = (select id from public.budgets where name = 'MVP-36 label test')))$$,
    'Member can correct an expense classification');

reset role;
insert into public.budget_members (budget_id, user_id, role)
select id, '36000000-0000-0000-0000-000000000002', 'VIEWER'
  from public.budgets where name = 'MVP-36 label test';
set local role authenticated;
select set_config('request.jwt.claim.sub', '36000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.create_expense_label(
    (select id from public.budgets where name = 'MVP-36 label test'),
    (select id from public.budget_categories where name = 'Geral'), 'Viewer label')$$,
    '42501', null, 'Viewer cannot create labels');

reset role;
select * from finish();
rollback;
