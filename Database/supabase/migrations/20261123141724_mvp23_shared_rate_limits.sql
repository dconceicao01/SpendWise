-- Retain only minimal request counters for a short window. The transaction ID
-- deduplicates row-level triggers so one API transaction counts once even when
-- it writes several rows or tables (for example, an income and its snapshots).
create table private.authenticated_write_requests (
    user_id uuid not null references auth.users (id) on delete cascade,
    transaction_id bigint not null,
    occurred_at timestamptz not null,
    primary key (user_id, transaction_id)
);

create index authenticated_write_requests_user_time_idx
    on private.authenticated_write_requests (user_id, occurred_at desc);

alter table private.authenticated_write_requests enable row level security;
revoke all on table private.authenticated_write_requests from public, anon, authenticated, service_role;

-- This helper is private and not executable by application roles. It derives
-- identity exclusively from the verified Supabase request context. Each
-- distinct authenticated database transaction gets one event. An advisory
-- transaction lock makes the rolling-window count safe under concurrent writes.
create function private.consume_authenticated_write_limit(
    p_transaction_id bigint,
    p_occurred_at timestamptz default clock_timestamp()
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_id uuid := auth.uid();
    inserted_count integer;
    request_count integer;
begin
    if actor_id is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('spendwise-write-limit:' || actor_id::text, 0));

    insert into private.authenticated_write_requests (user_id, transaction_id, occurred_at)
    values (actor_id, p_transaction_id, p_occurred_at)
    on conflict (user_id, transaction_id) do nothing;
    get diagnostics inserted_count = row_count;

    if inserted_count = 0 then
        return;
    end if;

    select count(*)::integer
      into request_count
      from private.authenticated_write_requests requests
     where requests.user_id = actor_id
       and requests.occurred_at > p_occurred_at - interval '1 minute'
       and requests.occurred_at <= p_occurred_at;

    if request_count > 120 then
        raise exception using errcode = 'P0001', message = 'write_rate_limited';
    end if;
end;
$function$;

revoke all on function private.consume_authenticated_write_limit(bigint, timestamptz)
    from public, anon, authenticated, service_role;

-- Trigger functions execute narrowly as the migration owner solely so they
-- can write the private counter table. auth.uid() remains the request actor.
create function private.enforce_authenticated_write_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
    if auth.uid() is not null then
        perform private.consume_authenticated_write_limit(txid_current(), clock_timestamp());
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$function$;

revoke all on function private.enforce_authenticated_write_limit()
    from public, anon, authenticated, service_role;

create trigger profiles_write_rate_limit
    before insert or update or delete on public.profiles
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budgets_write_rate_limit
    before insert or update or delete on public.budgets
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budget_members_write_rate_limit
    before insert or update or delete on public.budget_members
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budget_periods_write_rate_limit
    before insert or update or delete on public.budget_periods
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budget_invitations_write_rate_limit
    before insert or update or delete on public.budget_invitations
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budget_categories_write_rate_limit
    before insert or update or delete on public.budget_categories
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budget_allocation_sets_write_rate_limit
    before insert or update or delete on public.budget_allocation_sets
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budget_allocation_items_write_rate_limit
    before insert or update or delete on public.budget_allocation_items
    for each row execute function private.enforce_authenticated_write_limit();
create trigger income_schedules_write_rate_limit
    before insert or update or delete on public.income_schedules
    for each row execute function private.enforce_authenticated_write_limit();
create trigger income_entries_write_rate_limit
    before insert or update or delete on public.income_entries
    for each row execute function private.enforce_authenticated_write_limit();
create trigger income_allocation_snapshots_write_rate_limit
    before insert or update or delete on public.income_allocation_snapshots
    for each row execute function private.enforce_authenticated_write_limit();
create trigger expense_entries_write_rate_limit
    before insert or update or delete on public.expense_entries
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budget_adjustments_write_rate_limit
    before insert or update or delete on public.budget_adjustments
    for each row execute function private.enforce_authenticated_write_limit();
create trigger budget_reminder_preferences_write_rate_limit
    before insert or update or delete on public.budget_reminder_preferences
    for each row execute function private.enforce_authenticated_write_limit();

create function private.cleanup_authenticated_write_requests()
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    delete from private.authenticated_write_requests
     where occurred_at < clock_timestamp() - interval '24 hours';
end;
$function$;

revoke all on function private.cleanup_authenticated_write_requests()
    from public, anon, authenticated, service_role;

select cron.schedule(
    'spendwise-write-rate-limit-retention',
    '0 * * * *',
    'select private.cleanup_authenticated_write_requests();'
);
