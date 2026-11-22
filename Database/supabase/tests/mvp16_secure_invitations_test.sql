begin;
select plan(30);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
    ('16000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mvp16-owner@example.invalid', now(), '{}'),
    ('16000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mvp16-invitee@example.invalid', now(), '{}'),
    ('16000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'mvp16-unconfirmed@example.invalid', null, '{}'),
    ('16000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'mvp16-other@example.invalid', now(), '{}'),
    ('16000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'mvp16-expired@example.invalid', now(), '{}'),
    ('16000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'mvp16-revoked@example.invalid', now(), '{}');

select ok(
    (select p.prosecdef from pg_proc p where p.oid = 'public.accept_budget_invitation(text)'::regprocedure),
    'Invitation acceptance is a narrow SECURITY DEFINER function'
);
select ok(
    (select p.proconfig @> array['search_path=pg_catalog'] from pg_proc p
      where p.oid = 'public.accept_budget_invitation(text)'::regprocedure),
    'Invitation acceptance fixes its search_path'
);
select ok(not has_function_privilege('anon', 'public.accept_budget_invitation(text)', 'execute'),
    'Anonymous users cannot accept invitations');
select ok(not has_function_privilege('service_role', 'public.accept_budget_invitation(text)', 'execute'),
    'The application service role cannot call the user acceptance endpoint');
select ok(has_function_privilege('authenticated', 'public.accept_budget_invitation(text)', 'execute'),
    'Authenticated users can accept invitations');
select ok(not has_table_privilege('authenticated', 'private.budget_invitation_accept_attempts', 'select'),
    'Users cannot inspect rate-limit attempt records');
select is((select count(*)::integer from cron.job where jobname = 'spendwise-budget-invitation-retention'), 1,
    'Hourly cleanup for invitation retention is scheduled');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select lives_ok(
    $$select public.create_budget('MVP-16 invitations', 'SHARED', 'EUR')$$,
    'Owner can create a shared test budget'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
select budget.id, member.id, 'mvp16-invitee@example.invalid', 'CONTRIBUTOR', repeat('a', 64), now() + interval '7 days'
  from public.budgets budget
  join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
 where budget.name = 'MVP-16 invitations';
insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
select budget.id, member.id, 'mvp16-other@example.invalid', 'VIEWER', repeat('b', 64), now() + interval '7 days'
  from public.budgets budget
  join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
 where budget.name = 'MVP-16 invitations';
insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
select budget.id, member.id, 'mvp16-invitee@example.invalid', 'VIEWER', repeat('f', 64), now() + interval '7 days'
  from public.budgets budget
  join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
 where budget.name = 'MVP-16 invitations';
insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
select budget.id, member.id, 'mvp16-unconfirmed@example.invalid', 'VIEWER', repeat('c', 64), now() + interval '7 days'
  from public.budgets budget
  join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
 where budget.name = 'MVP-16 invitations';
insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
select budget.id, member.id, 'mvp16-expired@example.invalid', 'VIEWER', repeat('d', 64), now() + interval '7 days'
  from public.budgets budget
  join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
 where budget.name = 'MVP-16 invitations';
insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
select budget.id, member.id, 'mvp16-revoked@example.invalid', 'VIEWER', repeat('e', 64), now() + interval '7 days'
  from public.budgets budget
  join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
 where budget.name = 'MVP-16 invitations';
insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
select budget.id, member.id, 'mvp16-owner-revoked@example.invalid', 'VIEWER', repeat('6', 64), now() + interval '7 days'
  from public.budgets budget
  join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
 where budget.name = 'MVP-16 invitations';

reset role;
update public.budget_invitations set expires_at = now() - interval '1 minute'
 where token_hash = repeat('d', 64);
update public.budget_invitations set revoked_at = now()
 where token_hash = repeat('e', 64);
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select throws_ok(
    $$insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
      select budget.id, member.id, 'mvp16-too-long@example.invalid', 'VIEWER', repeat('8', 64), now() + interval '31 days'
        from public.budgets budget
        join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
       where budget.name = 'MVP-16 invitations'$$,
    '22023', 'invitation_expiry_invalid', 'Direct inserts cannot keep invitation email longer than the maximum token lifetime'
);
select throws_ok(
    $$insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
      select budget.id, member.id, null, 'VIEWER', repeat('7', 64), now() + interval '7 days'
        from public.budgets budget
        join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
       where budget.name = 'MVP-16 invitations'$$,
    '22023', 'invitation_email_required', 'Direct inserts cannot create a pending invitation without an email'
);
select lives_ok(
    $$update public.budget_invitations set revoked_at = now()
      where id = (select id from public.budget_invitations
                   where email = 'mvp16-owner-revoked@example.invalid' and revoked_at is null)$$,
    'An owner can revoke a pending invitation through the Data API update policy'
);
select is(
    (select count(*)::integer from public.budget_invitations
      where email is null and role = 'VIEWER' and revoked_at is not null),
    2,
    'Owner revocation immediately redacts the recipient email'
);

select is(
    (select count(*)::integer from private.budget_invitation_create_attempts
      where budget_id = (select id from public.budgets where name = 'MVP-16 invitations')),
    7,
    'The budget tracks each successful invitation creation'
);
select lives_ok(
    $$insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
      select budget.id, member.id, 'mvp16-rate-' || values_to_insert.n || '@example.invalid', 'CONTRIBUTOR',
             lpad(to_hex(values_to_insert.n), 64, '0'), now() + interval '7 days'
        from generate_series(1, 3) as values_to_insert(n)
        cross join public.budgets budget
        join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
       where budget.name = 'MVP-16 invitations'$$,
    'Up to ten invitations per budget per hour can be created'
);
select throws_ok(
    $$insert into public.budget_invitations (budget_id, created_by_member_id, email, role, token_hash, expires_at)
      select budget.id, member.id, 'mvp16-rate-limit@example.invalid', 'CONTRIBUTOR', repeat('9', 64), now() + interval '7 days'
        from public.budgets budget
        join public.budget_members member on member.budget_id = budget.id and member.role = 'OWNER'
       where budget.name = 'MVP-16 invitations'$$,
    'P0001', 'invite_rate_limited', 'The eleventh invitation per budget per hour is rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select is(
    (select accepted from public.accept_budget_invitation(repeat('a', 64))),
    true,
    'A verified account matching the invitation email is accepted'
);
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select is(
    (select count(*)::integer from public.budget_invitations
      where email is null and role = 'VIEWER' and revoked_at is not null),
    3,
    'Accepting a link revokes and redacts parallel pending links for the same address'
);
select is(
    (select email from public.budget_invitations where accepted_at is not null and role = 'CONTRIBUTOR'),
    null::text,
    'Accepted invitation redacts its email address'
);
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select is(
    (select count(*)::integer from public.budget_members
      where budget_id = (select id from public.budgets where name = 'MVP-16 invitations')
        and user_id = '16000000-0000-0000-0000-000000000002' and role = 'CONTRIBUTOR' and removed_at is null),
    1,
    'Acceptance creates exactly one active membership'
);
select is(
    (select accepted from public.accept_budget_invitation(repeat('a', 64))),
    false,
    'A consumed token cannot be reused'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000003', true);
select is(
    (select accepted from public.accept_budget_invitation(repeat('c', 64))),
    false,
    'An unconfirmed email cannot accept an invitation'
);
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select is(
    (select accepted from public.accept_budget_invitation(repeat('b', 64))),
    false,
    'An account with a different email receives the generic rejection'
);
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000005', true);
select is((select accepted from public.accept_budget_invitation(repeat('d', 64))), false,
    'An expired invitation cannot be accepted');
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000006', true);
select is((select accepted from public.accept_budget_invitation(repeat('e', 64))), false,
    'A revoked invitation cannot be accepted');

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select ok(not (select rate_limited from public.accept_budget_invitation(repeat('c', 64))), 'First attempt is allowed');
select ok(not (select rate_limited from public.accept_budget_invitation(repeat('d', 64))), 'Second attempt is allowed');
select ok(not (select rate_limited from public.accept_budget_invitation(repeat('e', 64))), 'Third attempt is allowed');
select ok(not (select rate_limited from public.accept_budget_invitation(repeat('f', 64))), 'Fourth attempt is allowed');
select ok(not (select rate_limited from public.accept_budget_invitation(repeat('0', 64))), 'Fifth attempt is allowed');
select ok((select rate_limited from public.accept_budget_invitation(repeat('1', 64))), 'Sixth attempt is rate limited');

select * from finish();
rollback;
