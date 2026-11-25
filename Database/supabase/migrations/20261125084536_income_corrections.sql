-- Income corrections are immutable events attached to the original income.
-- Their balance effect and date belong to the period selected for correction.
-- Categories use the allocation set active when the correction is recorded.

create table public.income_corrections (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    income_entry_id uuid not null,
    period_id uuid not null,
    allocation_set_id uuid not null,
    recorded_by_member_id uuid not null,
    amount_delta numeric(19, 4) not null check (amount_delta <> 0),
    reason text not null check (length(btrim(reason)) between 1 and 500),
    occurred_on date not null,
    created_at timestamptz not null default now(),
    unique (budget_id, id),
    foreign key (budget_id, income_entry_id)
        references public.income_entries (budget_id, id) on delete restrict,
    foreign key (budget_id, period_id)
        references public.budget_periods (budget_id, id) on delete restrict,
    foreign key (budget_id, allocation_set_id)
        references public.budget_allocation_sets (budget_id, id) on delete restrict,
    foreign key (budget_id, recorded_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create table public.income_correction_allocation_snapshots (
    budget_id uuid not null,
    income_correction_id uuid not null,
    category_id uuid not null,
    percentage_basis_points integer not null
        check (percentage_basis_points between 0 and 10000),
    allocated_amount numeric(19, 4) not null,
    primary key (income_correction_id, category_id),
    foreign key (budget_id, income_correction_id)
        references public.income_corrections (budget_id, id) on delete cascade,
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict
);

create index income_corrections_period_date_idx
    on public.income_corrections (budget_id, period_id, occurred_on desc);
create index income_corrections_income_idx
    on public.income_corrections (budget_id, income_entry_id, created_at desc);
create index income_corrections_allocation_set_idx
    on public.income_corrections (budget_id, allocation_set_id);
create index income_correction_snapshots_category_idx
    on public.income_correction_allocation_snapshots (budget_id, category_id);

alter table public.income_corrections enable row level security;
alter table public.income_correction_allocation_snapshots enable row level security;
revoke all on table public.income_corrections,
    public.income_correction_allocation_snapshots from anon, authenticated;
grant select, insert on public.income_corrections to authenticated;
grant select, insert on public.income_correction_allocation_snapshots to authenticated;

create policy income_corrections_select_active_member
    on public.income_corrections for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy income_corrections_insert_contributor
    on public.income_corrections for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR')
        and recorded_by_member_id = (select private.current_budget_member_id(budget_id))
    );
create policy income_correction_snapshots_select_active_member
    on public.income_correction_allocation_snapshots for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy income_correction_snapshots_insert_contributor
    on public.income_correction_allocation_snapshots for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR')
        and exists (
            select 1 from public.income_corrections c
             where c.budget_id = income_correction_allocation_snapshots.budget_id
               and c.id = income_correction_allocation_snapshots.income_correction_id
               and c.recorded_by_member_id = (select private.current_budget_member_id(budget_id))
        )
    );

create trigger income_corrections_period_date_check
    before insert or update on public.income_corrections
    for each row execute function private.assert_movement_date_in_period('occurred_on');

create function private.assert_income_correction_consistent()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    correction_id uuid;
    correction_budget_id uuid;
    correction_income_id uuid;
    correction_allocation_id uuid;
    correction_delta numeric(19, 4);
    income_amount numeric(19, 4);
    snapshot_count bigint;
    allocation_item_count bigint;
    total_basis_points bigint;
    total_allocated numeric(19, 4);
    remaining_units integer;
begin
    if tg_table_name = 'income_corrections' then
        if tg_op = 'DELETE' then
            return null;
        end if;
        correction_id := new.id;
        correction_budget_id := new.budget_id;
    elsif tg_op = 'DELETE' then
        correction_id := old.income_correction_id;
        correction_budget_id := old.budget_id;
    else
        correction_id := new.income_correction_id;
        correction_budget_id := new.budget_id;
    end if;

    select c.income_entry_id, c.allocation_set_id, c.amount_delta
      into correction_income_id, correction_allocation_id, correction_delta
      from public.income_corrections c
     where c.budget_id = correction_budget_id and c.id = correction_id;
    if not found then
        return null;
    end if;

    select i.amount into income_amount
      from public.income_entries i
     where i.budget_id = correction_budget_id and i.id = correction_income_id;
    if not found then
        raise exception using errcode = '23514',
            message = 'An income correction must reference an income in the same budget';
    end if;
    if not exists (
        select 1 from public.budget_allocation_sets a
         where a.budget_id = correction_budget_id
           and a.id = correction_allocation_id
           and a.status = 'ACTIVE'
    ) then
        raise exception using errcode = '23514',
            message = 'An income correction must use the active allocation set';
    end if;

    if exists (
        select 1
          from public.income_corrections c
         where c.budget_id = correction_budget_id
           and c.income_entry_id = correction_income_id
         group by c.income_entry_id
        having income_amount + sum(c.amount_delta) < 0
    ) then
        raise exception using errcode = '23514',
            message = 'Income corrections cannot reduce an income below zero';
    end if;

    select count(*), coalesce(sum(s.percentage_basis_points), 0),
           coalesce(sum(s.allocated_amount), 0)
      into snapshot_count, total_basis_points, total_allocated
      from public.income_correction_allocation_snapshots s
     where s.budget_id = correction_budget_id
       and s.income_correction_id = correction_id;
    select count(*), coalesce(sum(i.percentage_basis_points), 0)
      into allocation_item_count, total_basis_points
      from public.budget_allocation_items i
      join public.budget_categories c
        on c.budget_id = i.budget_id and c.id = i.category_id
     where i.budget_id = correction_budget_id
       and i.allocation_set_id = correction_allocation_id
       and c.archived_at is null;
    if snapshot_count = 0 or snapshot_count <> allocation_item_count
       or total_basis_points <> 10000 or total_allocated <> correction_delta then
        raise exception using errcode = '23514',
            message = 'Income correction category allocations must reconcile to the correction amount';
    end if;

    select ((correction_delta - coalesce(sum(trunc(correction_delta * s.percentage_basis_points / 10000, 4)), 0)) * 10000)::integer
      into remaining_units
      from public.budget_allocation_items s
      join public.budget_categories c
        on c.budget_id = s.budget_id and c.id = s.category_id
     where s.budget_id = correction_budget_id
       and s.allocation_set_id = correction_allocation_id
       and c.archived_at is null;

    if exists (
        with shares as (
            select s.category_id,
                   s.percentage_basis_points,
                   trunc(correction_delta * s.percentage_basis_points / 10000, 4) as base_amount,
                   correction_delta * s.percentage_basis_points / 10000
                     - trunc(correction_delta * s.percentage_basis_points / 10000, 4) as fractional_remainder
              from public.budget_allocation_items s
              join public.budget_categories c
                on c.budget_id = s.budget_id and c.id = s.category_id
             where s.budget_id = correction_budget_id
               and s.allocation_set_id = correction_allocation_id
               and c.archived_at is null
        ), ranked as (
            select shares.*,
                   row_number() over (order by abs(fractional_remainder) desc, category_id) as remainder_rank
              from shares
        )
        select 1
          from ranked r
          left join public.income_correction_allocation_snapshots s
            on s.budget_id = correction_budget_id
           and s.income_correction_id = correction_id
           and s.category_id = r.category_id
         where s.income_correction_id is null
            or s.percentage_basis_points <> r.percentage_basis_points
            or s.allocated_amount <> r.base_amount
                 + case
                     when remaining_units > 0 and r.remainder_rank <= remaining_units then 0.0001
                     when remaining_units < 0 and r.remainder_rank <= abs(remaining_units) then -0.0001
                     else 0
                   end
    ) then
        raise exception using errcode = '23514',
            message = 'Income correction allocations must match the original income allocation';
    end if;

    return null;
end;
$function$;

revoke all on function private.assert_income_correction_consistent()
    from public, anon, authenticated, service_role;
create constraint trigger income_corrections_consistent
    after insert or update on public.income_corrections
    deferrable initially deferred
    for each row execute function private.assert_income_correction_consistent();
create constraint trigger income_correction_snapshots_consistent
    after insert or update or delete on public.income_correction_allocation_snapshots
    deferrable initially deferred
    for each row execute function private.assert_income_correction_consistent();

create or replace function public.record_income_correction(
    p_budget_id uuid,
    p_income_entry_id uuid,
    p_period_id uuid,
    p_amount_delta numeric,
    p_occurred_on date,
    p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid;
    actor_role text;
    income_row public.income_entries%rowtype;
    allocation_id uuid;
    item_count bigint;
    total_basis_points bigint;
    correction_id uuid;
    base_total numeric(19, 4);
    remaining_units integer;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_amount_delta is null or p_amount_delta = 0 or p_amount_delta <> trunc(p_amount_delta, 4) then
        raise exception using errcode = '22023', message = 'Correction must be non-zero with at most four decimal places';
    end if;
    if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
        raise exception using errcode = '22023', message = 'Correction reason is required and cannot exceed 500 characters';
    end if;
    if p_occurred_on is null then
        raise exception using errcode = '22023', message = 'Correction date is required';
    end if;

    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;
    if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot correct income';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(p_budget_id::text || ':income-correction:' || p_income_entry_id::text, 0)
    );
    select * into income_row
      from public.income_entries i
     where i.budget_id = p_budget_id and i.id = p_income_entry_id;
    if not found then
        raise exception using errcode = '23503', message = 'Income entry does not exist in this budget';
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
    if income_row.amount + coalesce((
        select sum(c.amount_delta)
          from public.income_corrections c
         where c.budget_id = p_budget_id and c.income_entry_id = p_income_entry_id
    ), 0) + p_amount_delta < 0 then
        raise exception using errcode = '22023', message = 'Corrections cannot reduce income below zero';
    end if;

    insert into public.income_corrections (
        budget_id, income_entry_id, period_id, allocation_set_id, recorded_by_member_id,
        amount_delta, reason, occurred_on
    ) values (
        p_budget_id, p_income_entry_id, p_period_id, allocation_id, actor_member_id,
        p_amount_delta, btrim(p_reason), p_occurred_on
    ) returning id into correction_id;

    select coalesce(sum(trunc(p_amount_delta * s.percentage_basis_points / 10000, 4)), 0)
      into base_total
      from public.budget_allocation_items s
      join public.budget_categories c
        on c.budget_id = s.budget_id and c.id = s.category_id
     where s.budget_id = p_budget_id and s.allocation_set_id = allocation_id
       and c.archived_at is null;
    remaining_units := ((p_amount_delta - base_total) * 10000)::integer;

    with shares as (
        select s.category_id,
               s.percentage_basis_points,
               trunc(p_amount_delta * s.percentage_basis_points / 10000, 4) as base_amount,
               p_amount_delta * s.percentage_basis_points / 10000
                 - trunc(p_amount_delta * s.percentage_basis_points / 10000, 4) as fractional_remainder
          from public.budget_allocation_items s
          join public.budget_categories c
            on c.budget_id = s.budget_id and c.id = s.category_id
         where s.budget_id = p_budget_id and s.allocation_set_id = allocation_id
           and c.archived_at is null
    ), ranked as (
        select shares.*,
               row_number() over (order by abs(fractional_remainder) desc, category_id) as remainder_rank
          from shares
    )
    insert into public.income_correction_allocation_snapshots (
        budget_id, income_correction_id, category_id,
        percentage_basis_points, allocated_amount
    )
    select p_budget_id, correction_id, category_id, percentage_basis_points,
           base_amount
             + case
                 when remaining_units > 0 and remainder_rank <= remaining_units then 0.0001
                 when remaining_units < 0 and remainder_rank <= abs(remaining_units) then -0.0001
                 else 0
               end
      from ranked;

    return correction_id;
end;
$function$;

revoke all on function public.record_income_correction(uuid, uuid, uuid, numeric, date, text)
    from public, anon, authenticated, service_role;
grant execute on function public.record_income_correction(uuid, uuid, uuid, numeric, date, text)
    to authenticated;

create trigger income_corrections_write_rate_limit
    before insert or update or delete on public.income_corrections
    for each row execute function private.enforce_authenticated_write_limit();
create trigger income_correction_snapshots_write_rate_limit
    before insert or update or delete on public.income_correction_allocation_snapshots
    for each row execute function private.enforce_authenticated_write_limit();
