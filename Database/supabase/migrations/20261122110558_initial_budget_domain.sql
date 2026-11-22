-- Initial SpendWise budget domain.
-- All amounts are records for planning and reporting. They do not move real money.

create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    full_name text not null
        check (length(btrim(full_name)) between 1 and 120),
    phone_e164 text
        check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    default_currency text not null default 'EUR'
        check (default_currency ~ '^[A-Z]{3}$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.budgets (
    id uuid primary key default gen_random_uuid(),
    name text not null
        check (length(btrim(name)) between 1 and 120),
    budget_type text not null
        check (budget_type in ('PERSONAL', 'SHARED')),
    currency_code text not null
        check (currency_code ~ '^[A-Z]{3}$'),
    owner_member_id uuid not null,
    owner_role text not null default 'OWNER'
        check (owner_role = 'OWNER'),
    created_at timestamptz not null default now(),
    archived_at timestamptz,
    unique (id, owner_member_id, owner_role)
);

create table public.budget_periods (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    starts_on date not null,
    ends_on date not null,
    created_at timestamptz not null default now(),
    unique (budget_id, id),
    unique (budget_id, starts_on, ends_on),
    check (ends_on >= starts_on)
);

alter table public.budget_periods
    add constraint budget_periods_no_overlap
    exclude using gist (
        budget_id with =,
        daterange(starts_on, ends_on, '[]') with &&
    );

create function private.assert_period_update_preserves_movement_dates()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    perform pg_advisory_xact_lock(
        hashtextextended(new.budget_id::text || ':' || new.id::text, 0)
    );

    if exists (
        select 1 from public.income_entries i
         where i.budget_id = new.budget_id and i.period_id = new.id
           and i.occurred_on not between new.starts_on and new.ends_on
    ) or exists (
        select 1 from public.expense_entries e
         where e.budget_id = new.budget_id and e.period_id = new.id
           and e.spent_on not between new.starts_on and new.ends_on
    ) or exists (
        select 1 from public.budget_adjustments a
         where a.budget_id = new.budget_id and a.period_id = new.id
           and a.occurred_on not between new.starts_on and new.ends_on
    ) then
        raise exception using
            errcode = '23514',
            message = 'A budget period cannot exclude dates of existing movements';
    end if;

    return new;
end;
$function$;

create trigger budget_periods_preserve_movement_dates
    before update of starts_on, ends_on on public.budget_periods
    for each row execute function private.assert_period_update_preserves_movement_dates();

create index budget_periods_budget_dates_idx
    on public.budget_periods (budget_id, starts_on, ends_on);

create table public.budget_members (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    user_id uuid references auth.users (id) on delete set null,
    role text not null
        check (role in ('OWNER', 'CONTRIBUTOR', 'VIEWER')),
    joined_at timestamptz not null default now(),
    removed_at timestamptz,
    unique (budget_id, id),
    unique (budget_id, id, role),
    check (removed_at is null or role <> 'OWNER'),
    check (removed_at is not null or user_id is not null)
);

create unique index budget_members_one_active_membership_idx
    on public.budget_members (budget_id, user_id)
    where removed_at is null and user_id is not null;

-- The deferred circular foreign key allows the budget and its initial owner
-- membership to be created in the same transaction while guaranteeing an owner.
alter table public.budgets
    add constraint budgets_owner_member_fkey
    foreign key (id, owner_member_id, owner_role)
    references public.budget_members (budget_id, id, role)
    deferrable initially deferred;

create unique index budget_members_one_owner_per_budget_idx
    on public.budget_members (budget_id)
    where role = 'OWNER' and removed_at is null;

create index budget_members_active_user_idx
    on public.budget_members (user_id, budget_id)
    where removed_at is null;

create table public.budget_invitations (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    created_by_member_id uuid not null,
    email text not null check (email = lower(btrim(email))),
    role text not null check (role in ('CONTRIBUTOR', 'VIEWER')),
    token_hash text not null unique,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    check (accepted_at is null or revoked_at is null)
);

create index budget_invitations_budget_expiry_idx
    on public.budget_invitations (budget_id, expires_at);

create index budget_invitations_creator_idx
    on public.budget_invitations (budget_id, created_by_member_id);

create table public.budget_categories (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 80),
    created_by_member_id uuid not null,
    created_at timestamptz not null default now(),
    archived_at timestamptz,
    unique (budget_id, id),
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create unique index budget_categories_active_name_idx
    on public.budget_categories (budget_id, lower(name))
    where archived_at is null;

create index budget_categories_creator_idx
    on public.budget_categories (budget_id, created_by_member_id);

create table public.budget_allocation_sets (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    version integer not null check (version > 0),
    status text not null check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
    effective_from date not null default current_date,
    created_by_member_id uuid not null,
    created_at timestamptz not null default now(),
    unique (budget_id, id),
    unique (budget_id, version),
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create function private.require_new_allocation_set_draft()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    if new.status <> 'DRAFT' then
        raise exception using
            errcode = '23514',
            message = 'An allocation set must be created as a draft';
    end if;
    return new;
end;
$function$;

create trigger budget_allocation_sets_start_as_draft
    before insert on public.budget_allocation_sets
    for each row execute function private.require_new_allocation_set_draft();

create function private.prevent_active_allocation_set_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    if old.status = 'ACTIVE' and pg_trigger_depth() = 1 then
        raise exception using
            errcode = '23514',
            message = 'The active allocation set cannot be deleted directly';
    end if;
    return old;
end;
$function$;

create trigger budget_allocation_sets_protect_active_delete
    before delete on public.budget_allocation_sets
    for each row execute function private.prevent_active_allocation_set_delete();

create unique index budget_allocation_sets_one_active_idx
    on public.budget_allocation_sets (budget_id)
    where status = 'ACTIVE';

create index budget_allocation_sets_creator_idx
    on public.budget_allocation_sets (budget_id, created_by_member_id);

create table public.budget_allocation_items (
    budget_id uuid not null,
    allocation_set_id uuid not null,
    category_id uuid not null,
    percentage_basis_points integer not null
        check (percentage_basis_points between 0 and 10000),
    primary key (budget_id, allocation_set_id, category_id),
    foreign key (budget_id, allocation_set_id)
        references public.budget_allocation_sets (budget_id, id) on delete cascade,
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict
);

create index budget_allocation_items_category_idx
    on public.budget_allocation_items (budget_id, category_id);

create function private.prevent_archiving_allocated_category()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    if old.archived_at is null and new.archived_at is not null then
        perform pg_advisory_xact_lock(
            hashtextextended(new.budget_id::text || ':allocation-activation', 0)
        );

        if exists (
            select 1
              from public.budget_allocation_items i
              join public.budget_allocation_sets s
                on s.budget_id = i.budget_id and s.id = i.allocation_set_id
             where i.budget_id = new.budget_id
               and i.category_id = new.id
               and s.status = 'ACTIVE'
        ) then
            raise exception using
                errcode = '23514',
                message = 'A category in the active allocation must be removed before it can be archived';
        end if;
    end if;

    return new;
end;
$function$;

create trigger budget_categories_active_allocation_archive_guard
    before update of archived_at on public.budget_categories
    for each row execute function private.prevent_archiving_allocated_category();

create function private.guard_draft_allocation_items()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    item_budget_id uuid;
    item_set_id uuid;
    set_status text;
begin
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
        return old;
    end if;

    if tg_op = 'UPDATE'
       and row(new.budget_id, new.allocation_set_id)
           is distinct from row(old.budget_id, old.allocation_set_id) then
        raise exception using
            errcode = '23514',
            message = 'An allocation item cannot be moved to another set';
    end if;

    if tg_op = 'DELETE' then
        item_budget_id := old.budget_id;
        item_set_id := old.allocation_set_id;
    else
        item_budget_id := new.budget_id;
        item_set_id := new.allocation_set_id;
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(item_budget_id::text || ':allocation:' || item_set_id::text, 0)
    );

    select status into set_status
      from public.budget_allocation_sets
     where budget_id = item_budget_id and id = item_set_id;

    if not found and tg_op = 'DELETE' then
        return old;
    end if;
    if not found or set_status <> 'DRAFT' then
        raise exception using
            errcode = '23514',
            message = 'Allocation items can only change while their set is a draft';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$function$;

create trigger budget_allocation_items_draft_only
    before insert or update or delete on public.budget_allocation_items
    for each row execute function private.guard_draft_allocation_items();

create function private.validate_allocation_set_activation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    item_count bigint;
    total_basis_points bigint;
    active_category_count bigint;
begin
    if new.status = old.status then
        return new;
    end if;

    if old.status = 'RETIRED'
       or (old.status = 'ACTIVE' and new.status <> 'RETIRED')
       or (old.status = 'DRAFT' and new.status not in ('ACTIVE', 'RETIRED')) then
        raise exception using
            errcode = '23514',
            message = 'Invalid allocation set status transition';
    end if;

    if new.status <> 'ACTIVE' then
        return new;
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(new.budget_id::text || ':allocation-activation', 0)
    );
    perform pg_advisory_xact_lock(
        hashtextextended(new.budget_id::text || ':allocation:' || new.id::text, 0)
    );

    select count(*), coalesce(sum(i.percentage_basis_points), 0),
           count(*) filter (where c.archived_at is null)
      into item_count, total_basis_points, active_category_count
      from public.budget_allocation_items i
      join public.budget_categories c
        on c.budget_id = i.budget_id and c.id = i.category_id
     where i.budget_id = new.budget_id
       and i.allocation_set_id = new.id;

    if item_count = 0 or total_basis_points <> 10000
       or active_category_count <> item_count then
        raise exception using
            errcode = '23514',
            message = 'An active allocation set needs active categories totaling 100 percent';
    end if;

    new.effective_from := current_date;

    return new;
end;
$function$;

create trigger budget_allocation_sets_validate_activation
    before update of status on public.budget_allocation_sets
    for each row execute function private.validate_allocation_set_activation();

create function private.assert_active_allocation_replaced()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    if old.status = 'ACTIVE' and new.status <> 'ACTIVE'
       and not exists (
           select 1
             from public.budget_allocation_sets s
            where s.budget_id = new.budget_id
              and s.status = 'ACTIVE'
       ) then
        raise exception using
            errcode = '23514',
            message = 'A budget must retain an active allocation set';
    end if;
    return null;
end;
$function$;

create constraint trigger budget_allocation_sets_keep_active
    after update of status on public.budget_allocation_sets
    deferrable initially deferred
    for each row execute function private.assert_active_allocation_replaced();

create function public.activate_budget_allocation_set(
    p_budget_id uuid,
    p_allocation_set_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_role text;
    target_status text;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;

    select role into actor_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;

    if not found or actor_role <> 'OWNER' then
        raise exception using errcode = '42501', message = 'Only the budget owner can activate allocations';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(p_budget_id::text || ':allocation-activation', 0)
    );

    select status into target_status
      from public.budget_allocation_sets
     where budget_id = p_budget_id and id = p_allocation_set_id
     for update;

    if not found or target_status <> 'DRAFT' then
        raise exception using errcode = '23514', message = 'The allocation set must be a draft in this budget';
    end if;

    update public.budget_allocation_sets
       set status = 'RETIRED'
     where budget_id = p_budget_id and status = 'ACTIVE';

    update public.budget_allocation_sets
       set status = 'ACTIVE'
     where budget_id = p_budget_id and id = p_allocation_set_id;
end;
$function$;

revoke all on function public.activate_budget_allocation_set(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_budget_allocation_set(uuid, uuid) to authenticated;

create table public.income_schedules (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    income_member_id uuid not null,
    created_by_member_id uuid not null,
    amount numeric(19, 4) not null check (amount > 0),
    frequency text not null check (frequency in ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY')),
    start_date date not null,
    end_date date,
    next_occurrence_on date not null,
    status text not null default 'ACTIVE'
        check (status in ('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (budget_id, id),
    foreign key (budget_id, income_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    check (end_date is null or end_date >= start_date),
    check (next_occurrence_on >= start_date),
    check (end_date is null or next_occurrence_on <= end_date)
);

create index income_schedules_due_idx
    on public.income_schedules (next_occurrence_on, budget_id)
    where status = 'ACTIVE';

create index income_schedules_creator_idx
    on public.income_schedules (budget_id, created_by_member_id);

create index income_schedules_income_member_idx
    on public.income_schedules (budget_id, income_member_id);

create table public.income_entries (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    period_id uuid not null,
    income_member_id uuid not null,
    recorded_by_member_id uuid not null,
    allocation_set_id uuid not null,
    schedule_id uuid,
    scheduled_for date,
    amount numeric(19, 4) not null check (amount > 0),
    occurred_on date not null,
    created_at timestamptz not null default now(),
    unique (budget_id, id),
    foreign key (budget_id, period_id)
        references public.budget_periods (budget_id, id) on delete restrict,
    foreign key (budget_id, income_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    foreign key (budget_id, recorded_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    foreign key (budget_id, allocation_set_id)
        references public.budget_allocation_sets (budget_id, id) on delete restrict,
    foreign key (budget_id, schedule_id)
        references public.income_schedules (budget_id, id) on delete restrict,
    check ((schedule_id is null) = (scheduled_for is null))
);

create function private.require_active_income_allocation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    allocation_status text;
begin
    perform pg_advisory_xact_lock(
        hashtextextended(new.budget_id::text || ':allocation-activation', 0)
    );

    select status into allocation_status
      from public.budget_allocation_sets
     where budget_id = new.budget_id and id = new.allocation_set_id;

    if not found or allocation_status <> 'ACTIVE' then
        raise exception using
            errcode = '23514',
            message = 'Income must reference the active allocation set';
    end if;

    return new;
end;
$function$;

create trigger income_entries_require_active_allocation
    before insert on public.income_entries
    for each row execute function private.require_active_income_allocation();

create function private.prevent_income_allocation_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    if row(new.budget_id, new.allocation_set_id)
       is distinct from row(old.budget_id, old.allocation_set_id) then
        raise exception using
            errcode = '23514',
            message = 'An income entry cannot be moved to another allocation set or budget';
    end if;
    return new;
end;
$function$;

create trigger income_entries_allocation_immutable
    before update of budget_id, allocation_set_id on public.income_entries
    for each row execute function private.prevent_income_allocation_change();

create function private.assert_movement_date_in_period()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    period_starts_on date;
    period_ends_on date;
    movement_on date;
begin
    if tg_op = 'UPDATE'
       and row(new.budget_id, new.period_id)
           is distinct from row(old.budget_id, old.period_id) then
        raise exception using
            errcode = '23514',
            message = 'A movement cannot be reassigned to another budget period';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(new.budget_id::text || ':' || new.period_id::text, 0)
    );

    movement_on := (to_jsonb(new) ->> tg_argv[0])::date;

    select starts_on, ends_on
      into period_starts_on, period_ends_on
      from public.budget_periods
     where budget_id = new.budget_id
       and id = new.period_id;

    if not found or movement_on not between period_starts_on and period_ends_on then
        raise exception using
            errcode = '23514',
            message = 'Movement date must be within its budget period';
    end if;

    return new;
end;
$function$;

create trigger income_entries_period_date_check
    before insert or update on public.income_entries
    for each row execute function private.assert_movement_date_in_period('occurred_on');

create unique index income_entries_schedule_occurrence_idx
    on public.income_entries (schedule_id, scheduled_for)
    where schedule_id is not null;

create index income_entries_budget_date_idx
    on public.income_entries (budget_id, occurred_on desc);

create index income_entries_period_idx
    on public.income_entries (budget_id, period_id, occurred_on desc);

create index income_entries_member_idx
    on public.income_entries (budget_id, income_member_id, occurred_on desc);

create index income_entries_recorder_idx
    on public.income_entries (budget_id, recorded_by_member_id, occurred_on desc);

create index income_entries_allocation_set_idx
    on public.income_entries (budget_id, allocation_set_id);

create index income_entries_schedule_idx
    on public.income_entries (budget_id, schedule_id)
    where schedule_id is not null;

create table public.income_allocation_snapshots (
    budget_id uuid not null,
    income_entry_id uuid not null,
    category_id uuid not null,
    percentage_basis_points integer not null
        check (percentage_basis_points between 0 and 10000),
    allocated_amount numeric(19, 4) not null check (allocated_amount >= 0),
    primary key (income_entry_id, category_id),
    foreign key (budget_id, income_entry_id)
        references public.income_entries (budget_id, id) on delete cascade,
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict
);

create index income_allocation_snapshots_category_idx
    on public.income_allocation_snapshots (budget_id, category_id);

create function private.assert_income_snapshots_reconcile()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    v_entry_id uuid;
    v_entry_budget_id uuid;
    v_entry_amount numeric(19, 4);
    v_allocation_set_id uuid;
    snapshot_count bigint;
    total_basis_points bigint;
    total_allocated numeric(19, 4);
    item_count bigint;
    v_remaining_units integer;
begin
    if tg_table_name = 'income_entries' then
        if tg_op = 'DELETE' then
            return null;
        end if;
        v_entry_id := new.id;
        v_entry_budget_id := new.budget_id;
    elsif tg_op = 'DELETE' then
        v_entry_id := old.income_entry_id;
        v_entry_budget_id := old.budget_id;
    else
        v_entry_id := new.income_entry_id;
        v_entry_budget_id := new.budget_id;
    end if;

    select ie.amount, ie.allocation_set_id
      into v_entry_amount, v_allocation_set_id
      from public.income_entries
       as ie
     where ie.id = v_entry_id and ie.budget_id = v_entry_budget_id;

    if not found then
        return null;
    end if;

    select count(*), coalesce(sum(percentage_basis_points), 0),
           coalesce(sum(allocated_amount), 0)
      into snapshot_count, total_basis_points, total_allocated
      from public.income_allocation_snapshots
     where income_entry_id = v_entry_id and budget_id = v_entry_budget_id;

    select count(*) into item_count
      from public.budget_allocation_items i
     where i.budget_id = v_entry_budget_id
       and i.allocation_set_id = v_allocation_set_id;

    if snapshot_count = 0 or total_basis_points <> 10000
       or total_allocated <> v_entry_amount or snapshot_count <> item_count then
        raise exception using
            errcode = '23514',
            message = 'Income snapshots must reconcile to the amount and allocation set';
    end if;

    if exists (
        select 1
          from public.budget_allocation_items i
          left join public.income_allocation_snapshots s
            on s.income_entry_id = v_entry_id
           and s.budget_id = i.budget_id
           and s.category_id = i.category_id
         where i.budget_id = v_entry_budget_id
           and i.allocation_set_id = v_allocation_set_id
           and (s.income_entry_id is null
                or s.percentage_basis_points <> i.percentage_basis_points)
    ) then
        raise exception using
            errcode = '23514',
            message = 'Income snapshots must match the selected allocation set';
    end if;

    select ((v_entry_amount - coalesce(sum(trunc(v_entry_amount * i.percentage_basis_points / 10000, 4)), 0)) * 10000)::integer
      into v_remaining_units
      from public.budget_allocation_items i
     where i.budget_id = v_entry_budget_id
       and i.allocation_set_id = v_allocation_set_id;

    if exists (
        with shares as (
            select i.category_id,
                   i.percentage_basis_points,
                   trunc(v_entry_amount * i.percentage_basis_points / 10000, 4) as base_amount,
                   v_entry_amount * i.percentage_basis_points / 10000
                     - trunc(v_entry_amount * i.percentage_basis_points / 10000, 4) as fractional_remainder
              from public.budget_allocation_items i
             where i.budget_id = v_entry_budget_id
               and i.allocation_set_id = v_allocation_set_id
        ), ranked as (
            select shares.*,
                   row_number() over (order by fractional_remainder desc, category_id) as remainder_rank
              from shares
        )
        select 1
          from ranked r
          join public.income_allocation_snapshots s
            on s.income_entry_id = v_entry_id
           and s.budget_id = v_entry_budget_id
           and s.category_id = r.category_id
         where s.allocated_amount <> r.base_amount
                + case when r.remainder_rank <= v_remaining_units then 0.0001 else 0 end
    ) then
        raise exception using
            errcode = '23514',
            message = 'Income snapshots must use deterministic remainder allocation';
    end if;

    return null;
end;
$function$;

create constraint trigger income_entries_snapshots_consistent
    after insert or update on public.income_entries
    deferrable initially deferred
    for each row execute function private.assert_income_snapshots_reconcile();

create constraint trigger income_allocation_snapshots_consistent
    after insert or update or delete on public.income_allocation_snapshots
    deferrable initially deferred
    for each row execute function private.assert_income_snapshots_reconcile();

create function public.record_income(
    p_budget_id uuid,
    p_period_id uuid,
    p_amount numeric,
    p_occurred_on date
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid;
    actor_role text;
    allocation_id uuid;
    income_id uuid;
    total_basis_points bigint;
    item_count bigint;
    base_total numeric(19, 4);
    remaining_units integer;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount, 4) then
        raise exception using errcode = '22023', message = 'Income amount must be positive with at most four decimal places';
    end if;

    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;

    if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot record income';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(p_budget_id::text || ':allocation-activation', 0)
    );

    select id into allocation_id
      from public.budget_allocation_sets
     where budget_id = p_budget_id and status = 'ACTIVE';

    if not found then
        raise exception using errcode = '23514', message = 'The budget has no active allocation set';
    end if;

    select count(*), coalesce(sum(i.percentage_basis_points), 0)
      into item_count, total_basis_points
      from public.budget_allocation_items i
      join public.budget_categories c
        on c.budget_id = i.budget_id and c.id = i.category_id
     where i.budget_id = p_budget_id
       and i.allocation_set_id = allocation_id
       and c.archived_at is null;

    if item_count = 0 or total_basis_points <> 10000 then
        raise exception using errcode = '23514', message = 'The active allocation set must total 100 percent';
    end if;

    select coalesce(sum(trunc(p_amount * percentage_basis_points / 10000, 4)), 0)
      into base_total
      from public.budget_allocation_items
     where budget_id = p_budget_id and allocation_set_id = allocation_id;
    remaining_units := ((p_amount - base_total) * 10000)::integer;

    insert into public.income_entries (
        budget_id, period_id, income_member_id, recorded_by_member_id,
        allocation_set_id, amount, occurred_on
    ) values (
        p_budget_id, p_period_id, actor_member_id, actor_member_id,
        allocation_id, p_amount, p_occurred_on
    ) returning id into income_id;

    with shares as (
        select i.category_id,
               i.percentage_basis_points,
               trunc(p_amount * i.percentage_basis_points / 10000, 4) as base_amount,
               p_amount * i.percentage_basis_points / 10000
                 - trunc(p_amount * i.percentage_basis_points / 10000, 4) as fractional_remainder
          from public.budget_allocation_items i
         where i.budget_id = p_budget_id and i.allocation_set_id = allocation_id
    ), ranked as (
        select shares.*,
               row_number() over (order by fractional_remainder desc, category_id) as remainder_rank
          from shares
    )
    insert into public.income_allocation_snapshots (
        budget_id, income_entry_id, category_id, percentage_basis_points, allocated_amount
    )
    select p_budget_id, income_id, category_id, percentage_basis_points,
           base_amount + case when remainder_rank <= remaining_units then 0.0001 else 0 end
      from ranked;

    return income_id;
end;
$function$;

revoke all on function public.record_income(uuid, uuid, numeric, date) from public, anon, authenticated;
grant execute on function public.record_income(uuid, uuid, numeric, date) to authenticated;

create table public.expense_entries (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    period_id uuid not null,
    category_id uuid not null,
    recorded_by_member_id uuid not null,
    amount numeric(19, 4) not null check (amount > 0),
    spent_on date not null,
    description text check (description is null or length(description) <= 500),
    created_at timestamptz not null default now(),
    unique (budget_id, id),
    unique (budget_id, period_id, id),
    foreign key (budget_id, period_id)
        references public.budget_periods (budget_id, id) on delete restrict,
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict,
    foreign key (budget_id, recorded_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create trigger expense_entries_period_date_check
    before insert or update on public.expense_entries
    for each row execute function private.assert_movement_date_in_period('spent_on');

create index expense_entries_budget_date_idx
    on public.expense_entries (budget_id, spent_on desc);

create index expense_entries_period_idx
    on public.expense_entries (budget_id, period_id, spent_on desc);

create index expense_entries_category_date_idx
    on public.expense_entries (budget_id, category_id, spent_on desc);

create index expense_entries_recorder_idx
    on public.expense_entries (budget_id, recorded_by_member_id, spent_on desc);

create table public.budget_adjustments (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    period_id uuid not null,
    category_id uuid not null,
    corrected_expense_entry_id uuid,
    recorded_by_member_id uuid not null,
    amount_delta numeric(19, 4) not null check (amount_delta <> 0),
    reason text not null check (length(btrim(reason)) between 1 and 500),
    occurred_on date not null,
    created_at timestamptz not null default now(),
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict,
    foreign key (budget_id, period_id)
        references public.budget_periods (budget_id, id) on delete restrict,
    foreign key (budget_id, period_id, corrected_expense_entry_id)
        references public.expense_entries (budget_id, period_id, id) on delete restrict,
    foreign key (budget_id, recorded_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create trigger budget_adjustments_period_date_check
    before insert or update on public.budget_adjustments
    for each row execute function private.assert_movement_date_in_period('occurred_on');

create function private.assert_adjustment_matches_corrected_expense()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    expense_on date;
    expense_category_id uuid;
begin
    if new.corrected_expense_entry_id is null then
        return new;
    end if;

    select spent_on, category_id
      into expense_on, expense_category_id
      from public.expense_entries
     where budget_id = new.budget_id
       and period_id = new.period_id
       and id = new.corrected_expense_entry_id;

    if not found or new.occurred_on <> expense_on or new.category_id <> expense_category_id then
        raise exception using
            errcode = '23514',
            message = 'A correction must use the original expense date, period and category';
    end if;

    return new;
end;
$function$;

create trigger budget_adjustments_match_corrected_expense
    before insert or update on public.budget_adjustments
    for each row execute function private.assert_adjustment_matches_corrected_expense();

create index budget_adjustments_category_date_idx
    on public.budget_adjustments (budget_id, category_id, created_at desc);

create index budget_adjustments_period_idx
    on public.budget_adjustments (budget_id, period_id, occurred_on desc);

create index budget_adjustments_annual_idx
    on public.budget_adjustments (budget_id, occurred_on);

create index budget_adjustments_recorder_idx
    on public.budget_adjustments (budget_id, recorded_by_member_id, created_at desc);

create index budget_adjustments_corrected_expense_idx
    on public.budget_adjustments (budget_id, corrected_expense_entry_id)
    where corrected_expense_entry_id is not null;

create table public.budget_reminder_preferences (
    budget_id uuid not null,
    member_id uuid not null,
    reminders_enabled boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (budget_id, member_id),
    foreign key (budget_id, member_id)
        references public.budget_members (budget_id, id) on delete cascade
);

create index budget_reminder_preferences_member_idx
    on public.budget_reminder_preferences (member_id);

create table public.budget_audit_events (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    actor_member_id uuid,
    event_type text not null check (event_type in (
        'INCOME_RECORDED',
        'EXPENSE_RECORDED',
        'ADJUSTMENT_RECORDED',
        'OWNER_TRANSFERRED',
        'MEMBER_ROLE_CHANGED',
        'INVITATION_CREATED',
        'INVITATION_ACCEPTED',
        'INCOME_SCHEDULE_CREATED',
        'INCOME_SCHEDULE_PAUSED',
        'INCOME_SCHEDULE_RESUMED'
    )),
    entity_id uuid,
    occurred_at timestamptz not null default now(),
    foreign key (budget_id, actor_member_id)
        references public.budget_members (budget_id, id) on delete set null (actor_member_id)
);

create index budget_audit_events_budget_time_idx
    on public.budget_audit_events (budget_id, occurred_at desc);

create index budget_audit_events_actor_idx
    on public.budget_audit_events (budget_id, actor_member_id, occurred_at desc);

-- All public tables are exposed to the Supabase Data API. Keep them closed by
-- default until the dedicated MVP-08 migration adds reviewed membership policies.
alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_periods enable row level security;
alter table public.budget_members enable row level security;
alter table public.budget_invitations enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budget_allocation_sets enable row level security;
alter table public.budget_allocation_items enable row level security;
alter table public.income_schedules enable row level security;
alter table public.income_entries enable row level security;
alter table public.income_allocation_snapshots enable row level security;
alter table public.expense_entries enable row level security;
alter table public.budget_adjustments enable row level security;
alter table public.budget_reminder_preferences enable row level security;
alter table public.budget_audit_events enable row level security;
