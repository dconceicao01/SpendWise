begin;
select plan(18);

insert into auth.users (id, aud, role, email, email_confirmed_at)
values ('23000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'mvp23-rate-limit@example.invalid', now()),
       ('23000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
        'mvp23-trigger@example.invalid', now());

select ok((select relrowsecurity
             from pg_class
            where oid = 'private.authenticated_write_requests'::regclass),
    'Write request counters have RLS enabled');
select ok(not has_table_privilege('authenticated', 'private.authenticated_write_requests', 'select'),
    'Authenticated users cannot inspect write counters');
select ok(not has_table_privilege('service_role', 'private.authenticated_write_requests', 'select'),
    'Service role cannot inspect write counters');
select ok(not has_function_privilege('anon',
        'private.consume_authenticated_write_limit(bigint,timestamptz)', 'execute'),
    'Anonymous users cannot call the private limiter');
select ok(not has_function_privilege('authenticated',
        'private.consume_authenticated_write_limit(bigint,timestamptz)', 'execute'),
    'Authenticated users cannot call the private limiter directly');
select ok((select prosecdef from pg_proc
            where oid = 'private.enforce_authenticated_write_limit()'::regprocedure),
    'Only the trigger wrapper uses its narrowly scoped definer privileges');
select ok((select proconfig @> array['search_path=pg_catalog'] from pg_proc
            where oid = 'private.enforce_authenticated_write_limit()'::regprocedure),
    'Trigger wrapper pins its search path');
select is((select count(*)::integer from pg_trigger
            where not tgisinternal and tgname like '%_write_rate_limit'), 16,
    'All authenticated write tables have a rate-limit trigger');
select is((select count(*)::integer from cron.job
            where jobname = 'spendwise-write-rate-limit-retention'), 1,
    'Hourly cleanup is scheduled for request counters');

select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000001', true);
select lives_ok($$select private.consume_authenticated_write_limit(1, clock_timestamp())$$,
    'An authenticated transaction is counted');
select lives_ok($$select private.consume_authenticated_write_limit(1, clock_timestamp())$$,
    'Multiple writes in the same transaction are counted once');
select is((select count(*)::integer from private.authenticated_write_requests
            where user_id = '23000000-0000-0000-0000-000000000001'), 1,
    'A repeated transaction ID does not create another counter row');
select lives_ok($$select private.consume_authenticated_write_limit(request_id,
                            clock_timestamp() - interval '5 minutes')
                  from generate_series(2, 121) as request_id$$,
    'Up to 120 distinct writes in a rolling minute are accepted');
select throws_ok($$select private.consume_authenticated_write_limit(122,
                            clock_timestamp() - interval '5 minutes')$$,
    'P0001', 'write_rate_limited', 'The 121st write in a rolling minute is rejected');

set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000002', true);
select lives_ok($$insert into public.profiles (user_id, full_name)
                  values ('23000000-0000-0000-0000-000000000002', 'Synthetic profile')$$,
    'Authenticated profile insert passes through the write trigger');
select lives_ok($$update public.profiles set full_name = 'Synthetic profile one'
                  where user_id = '23000000-0000-0000-0000-000000000002'$$,
    'Authenticated profile update passes through the write trigger');
select lives_ok($$update public.profiles set full_name = 'Synthetic profile two'
                  where user_id = '23000000-0000-0000-0000-000000000002'$$,
    'Another write in the same transaction is accepted');
reset role;
select is((select count(*)::integer from private.authenticated_write_requests
            where user_id = '23000000-0000-0000-0000-000000000002'), 1,
    'Row-level triggers count multiple table writes once per transaction');

select * from finish();
rollback;
