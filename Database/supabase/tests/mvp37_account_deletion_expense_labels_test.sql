begin;
select plan(8);

insert into auth.users (id, aud, role, email) values
    ('37000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp37-owner@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '37000000-0000-0000-0000-000000000001', true);

select lives_ok($$select public.create_budget('MVP-37 personal cleanup', 'PERSONAL', 'EUR')$$,
    'User creates a personal budget');
select lives_ok($$select public.create_budget_category(
    (select id from public.budgets where name = 'MVP-37 personal cleanup'), 'Geral')$$,
    'User creates a category');
select lives_ok($$insert into public.budget_periods (budget_id, starts_on, ends_on)
    select id, current_date - 5, current_date + 5
      from public.budgets where name = 'MVP-37 personal cleanup'$$,
    'User creates a period');
select lives_ok($$select public.create_expense_label(
    (select id from public.budgets where name = 'MVP-37 personal cleanup'),
    (select id from public.budget_categories where name = 'Geral'), 'Comida')$$,
    'User creates a label that references their membership');
select lives_ok($$select public.record_expense(
    (select id from public.budgets where name = 'MVP-37 personal cleanup'),
    (select id from public.budget_periods where budget_id =
        (select id from public.budgets where name = 'MVP-37 personal cleanup')),
    (select id from public.budget_categories where name = 'Geral'),
    (select id from public.expense_labels where name = 'Comida' and budget_id =
        (select id from public.budgets where name = 'MVP-37 personal cleanup')),
    10, current_date, 'Almoço')$$,
    'User records an expense referencing the label');
select lives_ok($$select public.request_account_deletion('[]'::jsonb)$$,
    'Account deletion cleans up personal budgets with labeled expenses');

reset role;
select is((select count(*)::integer from public.budgets where name = 'MVP-37 personal cleanup'), 0,
    'Personal budget and its related data are deleted');
select ok(exists (select 1 from private.account_deletion_requests
    where user_id = '37000000-0000-0000-0000-000000000001'),
    'Pending deletion marker remains until Auth Admin removes the identity');

select * from finish();
rollback;

