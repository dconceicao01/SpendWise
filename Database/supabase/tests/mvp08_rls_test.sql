BEGIN;
SELECT plan(21);

-- Deterministic synthetic users: owner, contributor, viewer, removed member,
-- and a user whose only membership belongs to a different budget.
insert into auth.users (id, aud, role, email) values
    ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.invalid'),
    ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'contributor@example.invalid'),
    ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'viewer@example.invalid'),
    ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'removed@example.invalid'),
    ('10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'outsider@example.invalid');

insert into public.budgets (id, name, budget_type, currency_code, owner_member_id) values
    ('20000000-0000-0000-0000-000000000001', 'Shared test', 'SHARED', 'EUR', '30000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000002', 'Other test', 'PERSONAL', 'EUR', '30000000-0000-0000-0000-000000000005');
insert into public.budget_members (id, budget_id, user_id, role, removed_at) values
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'OWNER', null),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'CONTRIBUTOR', null),
    ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'VIEWER', null),
    ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'CONTRIBUTOR', now()),
    ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 'OWNER', null);
insert into public.budget_periods (id, budget_id, starts_on, ends_on) values
    ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', current_date - 2, current_date + 2);
insert into public.budget_categories (id, budget_id, name, created_by_member_id) values
    ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'General', '30000000-0000-0000-0000-000000000001');
insert into public.budget_allocation_sets (id, budget_id, version, status, created_by_member_id) values
    ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'DRAFT', '30000000-0000-0000-0000-000000000001');
insert into public.budget_allocation_items (budget_id, allocation_set_id, category_id, percentage_basis_points) values
    ('20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 10000);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$select public.activate_budget_allocation_set('20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001')$$,
    'Owner can activate a valid allocation'
);
select throws_ok(
    $$insert into public.budget_allocation_sets (budget_id, version, status, created_by_member_id)
      values ('20000000-0000-0000-0000-000000000001', 2, 'ACTIVE', '30000000-0000-0000-0000-000000000001')$$,
    '23514', null, 'A new allocation cannot bypass DRAFT state'
);
insert into public.budget_allocation_sets (id, budget_id, version, status, created_by_member_id)
values ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 2, 'DRAFT', '30000000-0000-0000-0000-000000000001');
select throws_ok(
    $$update public.budget_allocation_sets set status = 'ACTIVE' where id = '60000000-0000-0000-0000-000000000002'$$,
    '23514', null, 'An invalid direct allocation activation is rejected'
);
select throws_ok(
    $$delete from public.budget_allocation_sets where id = '60000000-0000-0000-0000-000000000001'$$,
    '42501', null, 'Clients cannot directly delete allocation sets'
);
select lives_ok(
    $$select public.record_income('20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 100, current_date)$$,
    'Owner can record income through the RPC'
);
set constraints all immediate;
select is((select count(*)::integer from public.budgets), 1, 'Owner sees only budgets where they are an active member');
select is((select count(*)::integer from public.budget_members where budget_id = '20000000-0000-0000-0000-000000000001'), 4, 'Owner can see membership history for their budget');
select lives_ok($$update public.budgets set name = 'Renamed test' where id = '20000000-0000-0000-0000-000000000001'$$, 'Owner can update budget settings');
with updated as (
    update public.budgets set name = 'Cross-budget edit'
     where id = '20000000-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::integer from updated), 0, 'Owner cannot update a budget they do not belong to');
select throws_ok($$update public.budgets set owner_member_id = '30000000-0000-0000-0000-000000000003' where id = '20000000-0000-0000-0000-000000000001'$$, '42501', null, 'Owner cannot directly transfer ownership');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select private.current_budget_member_role('20000000-0000-0000-0000-000000000001')), 'CONTRIBUTOR', 'Contributor role is resolved from active membership');
select lives_ok(
    $$insert into public.expense_entries (budget_id, period_id, category_id, recorded_by_member_id, amount, spent_on)
      values ('20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 5, current_date)$$,
    'Contributor can record an expense as themselves'
);
with updated as (
    update public.budget_members set role = 'CONTRIBUTOR'
     where id = '30000000-0000-0000-0000-000000000003' returning 1
)
select is((select count(*)::integer from updated), 0, 'Contributor cannot change membership roles');
select throws_ok(
    $$insert into public.budget_reminder_preferences (budget_id, member_id, reminders_enabled)
      values ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', true)$$,
    '42501', null, 'Contributor cannot write to another budget'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
    $$insert into public.expense_entries (budget_id, period_id, category_id, recorded_by_member_id, amount, spent_on)
      values ('20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 5, current_date)$$,
    '42501', null, 'Viewer cannot record an expense'
);
with updated as (
    update public.budget_allocation_items set percentage_basis_points = 9000
     where budget_id = '20000000-0000-0000-0000-000000000001'
       and allocation_set_id = '60000000-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::integer from updated), 0, 'Viewer cannot modify allocations');
select is((select count(*)::integer from public.budgets), 1, 'Viewer can read the shared budget');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::integer from public.budgets where id = '20000000-0000-0000-0000-000000000001'), 0, 'Another user cannot read a budget they do not belong to');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.budgets), 0, 'Removed member loses access immediately');

reset role;
select ok(not has_table_privilege('anon', 'public.budgets', 'select'), 'Anonymous role has no table access');
select ok(not has_column_privilege('authenticated', 'public.budget_invitations', 'token_hash', 'select'), 'Invitation token hashes are not readable through the Data API');

SELECT * FROM finish();
ROLLBACK;
