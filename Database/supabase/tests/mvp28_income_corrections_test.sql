begin;
select plan(21);

insert into auth.users (id, aud, role, email) values
    ('28000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp28-owner@example.invalid'),
    ('28000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp28-viewer@example.invalid');

select is(
    (select count(*)::integer from pg_proc p
      where p.oid = 'public.record_income_correction(uuid,uuid,uuid,numeric,date,text)'::regprocedure
        and not p.prosecdef),
    1,
    'Income correction RPC runs as the authenticated caller'
);
select ok(not has_function_privilege('anon', 'public.record_income_correction(uuid,uuid,uuid,numeric,date,text)', 'execute'),
    'Anonymous users cannot correct income');
select ok(
    (select relrowsecurity from pg_class where oid = 'public.income_corrections'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.income_correction_allocation_snapshots'::regclass),
    'Income correction tables enforce row-level security'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '28000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$select public.create_budget('MVP-28 income correction test', 'SHARED', 'EUR')$$,
    'Owner can create a shared budget'
);
select lives_ok(
    $$select public.create_budget_category(
        (select id from public.budgets where name = 'MVP-28 income correction test'), 'General')$$,
    'Owner can create the original category'
);
select lives_ok(
    $$select public.create_budget_category(
        (select id from public.budgets where name = 'MVP-28 income correction test'), 'Travel')$$,
    'Owner can create a second category'
);
select lives_ok(
    $$select public.create_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        jsonb_build_array(jsonb_build_object(
            'category_id', (select id from public.budget_categories where name = 'General'),
            'percentage_basis_points', 10000
        ))
    )$$,
    'Owner can create an allocation'
);
select lives_ok(
    $$select public.activate_budget_allocation_set(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        (select id from public.budget_allocation_sets where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test'))
    )$$,
    'Owner can activate the allocation'
);
select lives_ok(
    $$insert into public.budget_periods (budget_id, starts_on, ends_on)
      select id, current_date - 30, current_date from public.budgets
       where name = 'MVP-28 income correction test'$$,
    'Owner can create the original income period'
);
select lives_ok(
    $$insert into public.budget_periods (budget_id, starts_on, ends_on)
      select id, current_date + 1, current_date + 31 from public.budgets
       where name = 'MVP-28 income correction test'$$,
    'Owner can create the period selected for the correction'
);
select lives_ok(
    $$select public.record_income(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')
            and ends_on = current_date),
        1000, current_date
    )$$,
    'Owner can record the original income'
);
select lives_ok(
    $$select public.create_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        jsonb_build_array(
            jsonb_build_object(
                'category_id', (select id from public.budget_categories where name = 'General'),
                'percentage_basis_points', 5000
            ),
            jsonb_build_object(
                'category_id', (select id from public.budget_categories where name = 'Travel'),
                'percentage_basis_points', 5000
            )
        )
    )$$,
    'Owner can create a newer active allocation'
);
select lives_ok(
    $$select public.activate_budget_allocation_set(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        (select id from public.budget_allocation_sets where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')
            and status = 'DRAFT')
    )$$,
    'Owner can activate the newer allocation'
);
select lives_ok(
    $$select public.record_income_correction(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        (select id from public.income_entries where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')
            and starts_on = current_date + 1),
        100, current_date + 1, 'Rendimento recebido depois'
    )$$,
    'Owner can add a correction to an existing income'
);
select is(
    (select sum(s.allocated_amount) from public.income_correction_allocation_snapshots s
      join public.income_corrections c on c.id = s.income_correction_id and c.budget_id = s.budget_id
      join public.budgets b on b.id = c.budget_id
     where b.name = 'MVP-28 income correction test'),
    100.0000::numeric,
    'A correction allocation reconciles to its signed amount'
);
select is(
    (select (c.period_id <> i.period_id and c.occurred_on = current_date + 1)
       from public.income_corrections c
       join public.income_entries i on i.id = c.income_entry_id and i.budget_id = c.budget_id
       join public.budgets b on b.id = c.budget_id
      where b.name = 'MVP-28 income correction test'),
    true,
    'A correction uses the selected period and a date inside it'
);
select ok(
    (select c.allocation_set_id = s.id
            and (select count(*) from public.income_correction_allocation_snapshots a
                  where a.budget_id = c.budget_id and a.income_correction_id = c.id) = 2
            and (select sum(a.allocated_amount) from public.income_correction_allocation_snapshots a
                  join public.budget_categories category
                    on category.budget_id = a.budget_id and category.id = a.category_id
                 where a.budget_id = c.budget_id and a.income_correction_id = c.id
                   and category.name = 'General') = 50.0000::numeric
            and (select sum(a.allocated_amount) from public.income_correction_allocation_snapshots a
                  join public.budget_categories category
                    on category.budget_id = a.budget_id and category.id = a.category_id
                 where a.budget_id = c.budget_id and a.income_correction_id = c.id
                   and category.name = 'Travel') = 50.0000::numeric
       from public.income_corrections c
       join public.budget_allocation_sets s on s.budget_id = c.budget_id and s.status = 'ACTIVE'
       join public.budgets b on b.id = c.budget_id
      where b.name = 'MVP-28 income correction test'),
    'Correction uses the active allocation percentages'
);
select lives_ok(
    $$select public.record_income_correction(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        (select id from public.income_entries where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')
            and starts_on = current_date + 1),
        -200, current_date + 1, 'Valor duplicado removido'
    )$$,
    'Owner can remove an amount from the existing income'
);
select is(
    (select sum(c.amount_delta) from public.income_corrections c
      join public.budgets b on b.id = c.budget_id
     where b.name = 'MVP-28 income correction test'),
    -100.0000::numeric,
    'Positive and negative corrections preserve their signed total'
);
select throws_ok(
    $$select public.record_income_correction(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        (select id from public.income_entries where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')
            and starts_on = current_date + 1),
        -901, current_date + 1, 'Correção que excede o rendimento'
    )$$,
    '22023', null,
    'A correction cannot reduce the effective income below zero'
);
reset role;
insert into public.budget_members (budget_id, user_id, role)
select id, '28000000-0000-0000-0000-000000000002', 'VIEWER'
  from public.budgets where name = 'MVP-28 income correction test';
set local role authenticated;
select set_config('request.jwt.claim.sub', '28000000-0000-0000-0000-000000000002', true);
select throws_ok(
    $$select public.record_income_correction(
        (select id from public.budgets where name = 'MVP-28 income correction test'),
        (select id from public.income_entries where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')),
        (select id from public.budget_periods where budget_id =
            (select id from public.budgets where name = 'MVP-28 income correction test')
            and starts_on = current_date + 1),
        10, current_date + 1, 'Unauthorized correction'
    )$$,
    '42501', null,
    'A viewer cannot correct income'
);

reset role;
select * from finish();
rollback;
