begin;
select plan(23);

insert into auth.users (id, aud, role, email) values
    ('17000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp17-owner@example.invalid'),
    ('17000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp17-contributor@example.invalid'),
    ('17000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'mvp17-viewer@example.invalid');

select is(
    (select count(*)::integer from pg_proc p
      where p.oid in (
          'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)'::regprocedure,
          'public.record_budget_adjustment(uuid,uuid,uuid,numeric,text,date,uuid)'::regprocedure
      ) and not p.prosecdef),
    2,
    'Expense and adjustment RPCs run as the authenticated caller'
);
select ok(not has_function_privilege('anon', 'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)', 'execute'),
    'Anonymous users cannot record expenses');
select ok(not has_function_privilege('anon', 'public.record_budget_adjustment(uuid,uuid,uuid,numeric,text,date,uuid)', 'execute'),
    'Anonymous users cannot record adjustments');
select ok(has_function_privilege('authenticated', 'public.record_expense(uuid,uuid,uuid,uuid,numeric,date,text,text,text)', 'execute'),
    'Authenticated users can execute the expense RPC');
select ok(has_function_privilege('authenticated', 'public.record_budget_adjustment(uuid,uuid,uuid,numeric,text,date,uuid)', 'execute'),
    'Authenticated users can execute the adjustment RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$select public.create_budget('MVP-17 movement test', 'SHARED', 'EUR')$$,
    'Owner can create a shared budget'
);
select lives_ok(
    $$select public.create_budget_category(
        (select id from public.budgets where name = 'MVP-17 movement test'), 'General')$$,
    'Owner can create the category'
);
select lives_ok(
    $$select public.create_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        jsonb_build_array(jsonb_build_object(
            'category_id', (select id from public.budget_categories where name = 'General'),
            'percentage_basis_points', 10000
        ))
    )$$,
    'Owner can create the initial allocation'
);
select lives_ok(
    $$select public.activate_budget_allocation_set(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_allocation_sets where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test'))
    )$$,
    'Owner can activate the allocation'
);
select lives_ok(
    $$insert into public.budget_periods (budget_id, starts_on, ends_on)
      select id, current_date - 30, current_date + 30 from public.budgets
       where name = 'MVP-17 movement test'$$,
    'Owner can create the test period'
);

reset role;
insert into public.budget_members (budget_id, user_id, role)
select b.id, '17000000-0000-0000-0000-000000000002', 'CONTRIBUTOR'
  from public.budgets b where b.name = 'MVP-17 movement test';
insert into public.budget_members (budget_id, user_id, role)
select b.id, '17000000-0000-0000-0000-000000000003', 'VIEWER'
  from public.budgets b where b.name = 'MVP-17 movement test';

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000002', true);
select lives_ok(
    $$select public.record_income(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test')),
        900.00, current_date
    )$$,
    'Contributor can record an income for a period'
);
select is(
    (select sum(allocated_amount) from public.income_allocation_snapshots s
      join public.income_entries i on i.id = s.income_entry_id and i.budget_id = s.budget_id
      join public.budgets b on b.id = i.budget_id
     where b.name = 'MVP-17 movement test'),
    900.0000::numeric,
    'Income allocation snapshots reconcile to the income'
);
select is(
    (select count(*)::integer from public.income_allocation_snapshots s
      join public.income_entries i on i.id = s.income_entry_id and i.budget_id = s.budget_id
      join public.budgets b on b.id = i.budget_id
     where b.name = 'MVP-17 movement test' and s.percentage_basis_points = 10000),
    1,
    'Income records the allocation active when it is registered'
);
select lives_ok(
    $$select public.create_expense_label(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_categories where name = 'General'), 'Lunch')$$,
    'Contributor can create an expense label'
);
select lives_ok(
    $$select public.record_expense(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test')),
        (select id from public.budget_categories where name = 'General'),
        (select id from public.expense_labels where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test') and name = 'Lunch'),
        12.50, current_date, 'Lunch'
    )$$,
    'Contributor can record a labeled expense'
);
select is(
    (select recorded_by_member_id
       from public.expense_entries e
       join public.budgets b on b.id = e.budget_id
      where b.name = 'MVP-17 movement test'),
    (select id from public.budget_members where budget_id =
        (select id from public.budgets where name = 'MVP-17 movement test')
        and user_id = auth.uid() and removed_at is null),
    'Expense attribution is derived from the authenticated member'
);
select lives_ok(
    $$select public.record_budget_adjustment(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test')),
        (select id from public.budget_categories where name = 'General'),
        2.50, 'Expense correction', current_date,
        (select e.id from public.expense_entries e
          join public.budgets b on b.id = e.budget_id
         where b.name = 'MVP-17 movement test')
    )$$,
    'Contributor can record an adjustment linked to the original expense'
);
select is(
    (select amount_delta from public.budget_adjustments a
      join public.budgets b on b.id = a.budget_id
     where b.name = 'MVP-17 movement test'),
    2.5000::numeric,
    'Adjustment keeps its signed balance delta'
);
select is(
    (select corrected_expense_entry_id is not null from public.budget_adjustments a
      join public.budgets b on b.id = a.budget_id
     where b.name = 'MVP-17 movement test'),
    true,
    'Adjustment retains a reference to the original expense'
);
select throws_ok(
    $$select public.record_budget_adjustment(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test')),
        (select id from public.budget_categories where name = 'General'),
        -1, 'Invalid date correction', current_date - 1,
        (select e.id from public.expense_entries e
          join public.budgets b on b.id = e.budget_id
         where b.name = 'MVP-17 movement test')
    )$$,
    '23514', null,
    'A correction cannot move the expense to another effective date'
);
select throws_ok(
    $$select public.record_expense(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test')),
        (select id from public.budget_categories where name = 'General'),
        (select id from public.expense_labels where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test') and name = 'Lunch'),
        10, current_date + 31, null
    )$$,
    '23514', null,
    'A movement outside the period is rejected'
);

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000003', true);
select throws_ok(
    $$select public.record_expense(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test')),
        (select id from public.budget_categories where name = 'General'),
        (select id from public.expense_labels where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test') and name = 'Lunch'),
        10, current_date, null
    )$$,
    '42501', null,
    'Viewer cannot record an expense'
);
select throws_ok(
    $$select public.record_budget_adjustment(
        (select id from public.budgets where name = 'MVP-17 movement test'),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-17 movement test')),
        (select id from public.budget_categories where name = 'General'),
        1, 'Unauthorized', current_date, null
    )$$,
    '42501', null,
    'Viewer cannot record an adjustment'
);

reset role;
select * from finish();
rollback;
