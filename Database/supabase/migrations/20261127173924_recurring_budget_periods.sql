-- Recurring budget periods use the owner's selected start date as the anchor.
-- CUSTOM keeps existing one-off budgets unchanged after migration.
alter table public.budgets
    add column period_frequency text not null default 'CUSTOM'
        check (period_frequency in (
            'CUSTOM', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY',
            'EVERY_TWO_MONTHS', 'QUARTERLY', 'EVERY_SIX_MONTHS', 'ANNUAL'
        )),
    add column period_anchor_start date,
    add column period_end_on date,
    add constraint budgets_period_frequency_anchor_check
        check (period_frequency = 'CUSTOM' or period_anchor_start is not null),
    add constraint budgets_period_end_check
        check (period_end_on is null or (period_anchor_start is not null and period_end_on >= period_anchor_start));

grant update (name, archived_at, period_frequency, period_anchor_start, period_end_on)
    on public.budgets to authenticated;

create function private.guard_budget_period_schedule_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    if new.period_frequency is distinct from old.period_frequency
       or new.period_anchor_start is distinct from old.period_anchor_start then
        if old.period_frequency <> 'CUSTOM' then
            raise exception using
                errcode = '23514',
                message = 'Budget period frequency and start date cannot be changed after scheduling';
        end if;
        if new.period_frequency = 'CUSTOM' or new.period_anchor_start is null then
            raise exception using
                errcode = '23514',
                message = 'A recurring budget requires a frequency and start date';
        end if;
        if exists (
            select 1 from public.budget_periods p where p.budget_id = old.id
        ) then
            raise exception using
                errcode = '23514',
                message = 'A budget with existing periods cannot be converted to a recurring schedule';
        end if;
    end if;
    return new;
end;
$function$;

revoke all on function private.guard_budget_period_schedule_change()
    from public, anon, authenticated, service_role;

create trigger budgets_schedule_immutable_after_periods
    before update of period_frequency, period_anchor_start on public.budgets
    for each row execute function private.guard_budget_period_schedule_change();

create function private.prevent_historical_category_rename()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    if new.name is distinct from old.name and (
        exists (
            select 1 from public.expense_entries e
             where e.budget_id = old.budget_id and e.category_id = old.id
        ) or exists (
            select 1 from public.budget_adjustments a
             where a.budget_id = old.budget_id and a.category_id = old.id
        ) or exists (
            select 1 from public.income_allocation_snapshots s
             where s.budget_id = old.budget_id and s.category_id = old.id
        ) or exists (
            select 1 from public.income_correction_allocation_snapshots s
             where s.budget_id = old.budget_id and s.category_id = old.id
        )
    ) then
        raise exception using
            errcode = '23514',
            message = 'A category with historical movements cannot be renamed; create a new category instead';
    end if;
    return new;
end;
$function$;

revoke all on function private.prevent_historical_category_rename()
    from public, anon, authenticated, service_role;

create trigger budget_categories_preserve_historical_name
    before update of name on public.budget_categories
    for each row execute function private.prevent_historical_category_rename();

create function private.budget_period_start(
    p_anchor_start date,
    p_frequency text,
    p_period_index integer
)
returns date
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
    month_count integer;
    target_month date;
    anchor_day integer;
    last_day integer;
begin
    if p_anchor_start is null or p_period_index < 0 then
        raise exception using errcode = '22023', message = 'Budget period anchor is invalid';
    end if;

    case p_frequency
        when 'WEEKLY' then return p_anchor_start + (p_period_index * 7);
        when 'FORTNIGHTLY' then return p_anchor_start + (p_period_index * 14);
        when 'MONTHLY' then month_count := 1;
        when 'EVERY_TWO_MONTHS' then month_count := 2;
        when 'QUARTERLY' then month_count := 3;
        when 'EVERY_SIX_MONTHS' then month_count := 6;
        when 'ANNUAL' then month_count := 12;
        else raise exception using errcode = '22023', message = 'Budget period frequency is invalid';
    end case;

    anchor_day := extract(day from p_anchor_start)::integer;
    target_month := (date_trunc('month', p_anchor_start::timestamp)
        + make_interval(months => month_count * p_period_index))::date;
    last_day := extract(day from (target_month + interval '1 month - 1 day'))::integer;
    return target_month + least(anchor_day, last_day) - 1;
end;
$function$;

revoke all on function private.budget_period_start(date, text, integer)
    from public, anon, authenticated, service_role;
grant execute on function private.budget_period_start(date, text, integer) to authenticated;

create function private.sync_budget_period_end()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    period_row record;
    period_index integer;
    next_period_start date;
    expected_end date;
begin
    if new.period_frequency = 'CUSTOM'
       or new.period_end_on is not distinct from old.period_end_on then
        return new;
    end if;

    if new.period_end_on is not null and exists (
        select 1 from public.budget_periods p
         where p.budget_id = new.id
           and p.starts_on > new.period_end_on
    ) then
        raise exception using
            errcode = '23514',
            message = 'Budget end date cannot precede an existing period start';
    end if;

    for period_row in
        select p.id, p.starts_on, p.ends_on
          from public.budget_periods p
         where p.budget_id = new.id
         order by p.starts_on
    loop
        select cycle.period_index
          into period_index
          from generate_series(0, 1200) as cycle(period_index)
         where private.budget_period_start(
             new.period_anchor_start, new.period_frequency, cycle.period_index
         ) = period_row.starts_on
         limit 1;

        if period_index is null then
            continue;
        end if;

        next_period_start := private.budget_period_start(
            new.period_anchor_start, new.period_frequency, period_index + 1
        );
        expected_end := next_period_start - 1;
        if new.period_end_on is not null then
            expected_end := least(expected_end, new.period_end_on);
        end if;

        if expected_end <> period_row.ends_on then
            update public.budget_periods
               set ends_on = expected_end
             where id = period_row.id and budget_id = new.id;
        end if;
    end loop;
    return new;
end;
$function$;

revoke all on function private.sync_budget_period_end()
    from public, anon, authenticated, service_role;

create trigger budgets_sync_recurring_period_end
    after update of period_end_on on public.budgets
    for each row execute function private.sync_budget_period_end();

create function private.process_recurring_budget_periods()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
    budget_row public.budgets%rowtype;
    period_index integer;
    period_start date;
    next_period_start date;
    period_end date;
    created_count integer := 0;
    today_utc date := (clock_timestamp() at time zone 'UTC')::date;
begin
    for budget_row in
        select b.*
          from public.budgets b
         where b.archived_at is null
           and b.period_frequency <> 'CUSTOM'
           and b.period_anchor_start is not null
         order by b.id
    loop
        if not pg_try_advisory_xact_lock(
            hashtextextended(budget_row.id::text || ':recurring-budget-periods', 0)
        ) then
            continue;
        end if;

        period_index := 0;
        loop
            exit when period_index >= 1200;
            period_start := private.budget_period_start(
                budget_row.period_anchor_start,
                budget_row.period_frequency,
                period_index
            );
            exit when period_start > today_utc;
            exit when budget_row.period_end_on is not null
                and period_start > budget_row.period_end_on;

            next_period_start := private.budget_period_start(
                budget_row.period_anchor_start,
                budget_row.period_frequency,
                period_index + 1
            );
            period_end := next_period_start - 1;
            if budget_row.period_end_on is not null then
                period_end := least(period_end, budget_row.period_end_on);
            end if;

            if not exists (
                select 1 from public.budget_periods p
                 where p.budget_id = budget_row.id
                   and p.starts_on = period_start
                   and p.ends_on = period_end
            ) then
                if exists (
                    select 1 from public.budget_periods p
                     where p.budget_id = budget_row.id
                       and daterange(p.starts_on, p.ends_on, '[]')
                           && daterange(period_start, period_end, '[]')
                ) then
                    raise warning 'Recurring budget % has a conflicting period beginning %',
                        budget_row.id, period_start;
                    exit;
                end if;

                insert into public.budget_periods (budget_id, starts_on, ends_on)
                values (budget_row.id, period_start, period_end);
                created_count := created_count + 1;
            end if;
            period_index := period_index + 1;
        end loop;
    end loop;

    return created_count;
end;
$function$;

revoke all on function private.process_recurring_budget_periods()
    from public, anon, authenticated, service_role;

select cron.schedule(
    'spendwise-create-recurring-budget-periods',
    '0 0 * * *',
    'select private.process_recurring_budget_periods();'
);
