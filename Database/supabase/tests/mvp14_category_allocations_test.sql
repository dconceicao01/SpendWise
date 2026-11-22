begin;
select plan(24);

insert into auth.users (id, aud, role, email) values
    ('14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp14-owner@example.invalid'),
    ('14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp14-contributor@example.invalid');

select is(
    (select count(*)::integer from pg_proc p
      where p.oid in (
          'public.create_budget_category(uuid,text)'::regprocedure,
          'public.create_budget_allocation_draft(uuid,jsonb)'::regprocedure,
          'public.replace_budget_allocation_draft(uuid,uuid,jsonb)'::regprocedure
      ) and not p.prosecdef),
    3,
    'Category and allocation RPCs remain SECURITY INVOKER'
);
select ok(not has_function_privilege('anon', 'public.create_budget_category(uuid,text)', 'execute'),
    'Anonymous users cannot create categories');
select ok(not has_function_privilege('anon', 'public.create_budget_allocation_draft(uuid,jsonb)', 'execute'),
    'Anonymous users cannot create allocation drafts');
select ok(not has_function_privilege('anon', 'public.replace_budget_allocation_draft(uuid,uuid,jsonb)', 'execute'),
    'Anonymous users cannot replace draft items');

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$select public.create_budget('MVP-14 allocation test', 'SHARED', 'EUR')$$,
    'Owner can create a shared budget'
);
select lives_ok(
    $$select public.create_budget_category((select id from public.budgets where name = 'MVP-14 allocation test'), 'General')$$,
    'Owner can create a category'
);
select lives_ok(
    $$select public.create_budget_category((select id from public.budgets where name = 'MVP-14 allocation test'), 'Travel')$$,
    'Owner can create a second category'
);
select lives_ok(
    $$select public.create_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select jsonb_agg(jsonb_build_object('category_id', c.id, 'percentage_basis_points', v.basis_points))
           from public.budget_categories c
           join (values ('General', 5000), ('Travel', 5000)) v(name, basis_points) on v.name = c.name
          where c.budget_id = (select id from public.budgets where name = 'MVP-14 allocation test'))
    )$$,
    'Owner can create an atomic 50/50 allocation draft'
);
select is(
    (select max(version)::integer from public.budget_allocation_sets
      where budget_id = (select id from public.budgets where name = 'MVP-14 allocation test')),
    1,
    'The first allocation draft gets version one'
);

select lives_ok(
    $$select public.create_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select jsonb_agg(jsonb_build_object('category_id', c.id, 'percentage_basis_points', 10000))
           from public.budget_categories c where c.budget_id =
             (select id from public.budgets where name = 'MVP-14 allocation test') and c.name = 'General')
    )$$,
    'Owner can create a second allocation draft'
);
select is(
    (select max(version)::integer from public.budget_allocation_sets
      where budget_id = (select id from public.budgets where name = 'MVP-14 allocation test')),
    2,
    'Allocation draft versions increase atomically'
);
select lives_ok(
    $$select public.replace_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select id from public.budget_allocation_sets where budget_id =
            (select id from public.budgets where name = 'MVP-14 allocation test') and version = 2),
        (select jsonb_agg(jsonb_build_object('category_id', c.id, 'percentage_basis_points', 5000))
           from public.budget_categories c where c.budget_id =
             (select id from public.budgets where name = 'MVP-14 allocation test') and c.name = 'General')
    )$$,
    'Owner can replace draft items atomically'
);
select throws_ok(
    $$update public.budget_allocation_sets set status = 'ACTIVE'
      where budget_id = (select id from public.budgets where name = 'MVP-14 allocation test') and version = 2$$,
    '23514', null, 'A draft that does not sum to 100 percent cannot be activated'
);
select lives_ok(
    $$select public.replace_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select id from public.budget_allocation_sets where budget_id =
            (select id from public.budgets where name = 'MVP-14 allocation test') and version = 2),
        (select jsonb_agg(jsonb_build_object('category_id', c.id, 'percentage_basis_points', 10000))
           from public.budget_categories c where c.budget_id =
             (select id from public.budgets where name = 'MVP-14 allocation test') and c.name = 'General')
    )$$,
    'Owner can correct draft percentages before activation'
);

reset role;
insert into public.budget_members (budget_id, user_id, role)
select b.id, '14000000-0000-0000-0000-000000000002', 'CONTRIBUTOR'
  from public.budgets b where b.name = 'MVP-14 allocation test';
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$select public.activate_budget_allocation_set(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select id from public.budget_allocation_sets where budget_id =
            (select id from public.budgets where name = 'MVP-14 allocation test') and version = 1)
    )$$,
    'Owner can activate a valid draft and the database sets effective_from'
);
select is(
    (select effective_from from public.budget_allocation_sets
      where budget_id = (select id from public.budgets where name = 'MVP-14 allocation test') and version = 1),
    current_date,
    'Activation records its effective date'
);
select lives_ok(
    $$select public.activate_budget_allocation_set(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select id from public.budget_allocation_sets where budget_id =
            (select id from public.budgets where name = 'MVP-14 allocation test') and version = 2)
    )$$,
    'Activating a replacement retires the prior version atomically'
);
select throws_ok(
    $$update public.budget_categories set archived_at = now() where name = 'General'$$,
    '23514', null, 'A category in the active allocation cannot be archived'
);
select lives_ok(
    $$select public.create_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select jsonb_agg(jsonb_build_object('category_id', c.id, 'percentage_basis_points', 10000))
           from public.budget_categories c where c.budget_id =
             (select id from public.budgets where name = 'MVP-14 allocation test') and c.name = 'Travel')
    )$$,
    'Owner can create a new version without the category to archive'
);
select lives_ok(
    $$select public.activate_budget_allocation_set(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select id from public.budget_allocation_sets where budget_id =
            (select id from public.budgets where name = 'MVP-14 allocation test') and version = 3)
    )$$,
    'Owner can activate a version that removes a category'
);
select lives_ok(
    $$update public.budget_categories set archived_at = now() where name = 'General'$$,
    'Owner can archive a category after the replacement version is active'
);
select is(
    (select count(*)::integer from public.budget_categories where name = 'General' and archived_at is not null),
    1,
    'Archived category history is preserved'
);
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select throws_ok(
    $$select public.create_budget_allocation_draft(
        (select id from public.budgets where name = 'MVP-14 allocation test'),
        (select jsonb_agg(jsonb_build_object('category_id', c.id, 'percentage_basis_points', 3000))
           from public.budget_categories c where c.budget_id =
             (select id from public.budgets where name = 'MVP-14 allocation test') and c.name = 'General')
    )$$,
    '42501', null, 'Contributors cannot create allocation drafts'
);
select throws_ok(
    $$select public.create_budget_category(
        (select id from public.budgets where name = 'MVP-14 allocation test'), 'Hobby'
    )$$,
    '42501', null, 'Contributors cannot create categories'
);

reset role;
select * from finish();
rollback;
