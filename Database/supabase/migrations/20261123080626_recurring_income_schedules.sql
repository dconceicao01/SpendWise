-- MVP-20: recurring virtual income schedules.
-- Scheduled entries are still ordinary virtual income rows; nothing is
-- transferred or connected to a bank. The scheduler only invokes a private,
-- narrowly scoped database function.

alter table public.income_schedules
    add column monthly_short_month_behavior text not null default 'LAST_DAY'
        check (monthly_short_month_behavior in ('LAST_DAY', 'SKIP'));

grant insert (
    budget_id,
    income_member_id,
    created_by_member_id,
    amount,
    frequency,
    monthly_short_month_behavior,
    start_date,
    end_date,
    next_occurrence_on,
    status
) on public.income_schedules to authenticated;
grant update (status) on public.income_schedules to authenticated;

create policy income_schedules_insert_contributor
    on public.income_schedules for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR')
        and income_member_id = (select private.current_budget_member_id(budget_id))
        and created_by_member_id = (select private.current_budget_member_id(budget_id))
        and status = 'ACTIVE'
        and next_occurrence_on = start_date
        and exists (
            select 1 from public.budget_allocation_sets a
             where a.budget_id = income_schedules.budget_id
               and a.status = 'ACTIVE'
        )
    );

create policy income_schedules_update_owner_or_creator
    on public.income_schedules for update to authenticated
    using (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        or (
            (select private.current_budget_member_role(budget_id)) = 'CONTRIBUTOR'
            and created_by_member_id = (select private.current_budget_member_id(budget_id))
        )
    )
    with check (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        or (
            (select private.current_budget_member_role(budget_id)) = 'CONTRIBUTOR'
            and created_by_member_id = (select private.current_budget_member_id(budget_id))
        )
    );

create function private.validate_income_schedule_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
    if auth.uid() is not null then
        if not (
            (old.status = 'ACTIVE' and new.status in ('PAUSED', 'CANCELLED'))
            or (old.status = 'PAUSED' and new.status in ('ACTIVE', 'CANCELLED'))
            or (old.status = new.status)
        ) then
            raise exception using errcode = '42501', message = 'Invalid income schedule status transition';
        end if;
        if old.status = 'PAUSED' and new.status = 'ACTIVE'
           and not exists (
               select 1 from public.budget_members m
                where m.budget_id = old.budget_id
                  and m.id = old.created_by_member_id
                  and m.removed_at is null
                  and m.role in ('OWNER', 'CONTRIBUTOR')
           ) then
            raise exception using errcode = '42501', message = 'The schedule creator must be an active contributor or owner';
        end if;
    end if;
    new.updated_at := clock_timestamp();
    return new;
end;
$function$;

revoke all on function private.validate_income_schedule_update()
    from public, anon, authenticated, service_role;

create trigger income_schedules_validate_update
    before update on public.income_schedules
    for each row execute function private.validate_income_schedule_update();

create function private.pause_ineligible_member_income_schedules()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    if (new.removed_at is not null or new.role = 'VIEWER')
       and (old.removed_at is null and old.role in ('OWNER', 'CONTRIBUTOR')) then
        update public.income_schedules
           set status = 'PAUSED'
         where budget_id = new.budget_id
           and created_by_member_id = new.id
           and status = 'ACTIVE';
    end if;
    return new;
end;
$function$;

revoke all on function private.pause_ineligible_member_income_schedules()
    from public, anon, authenticated, service_role;

create trigger budget_member_pause_income_schedules
    after update of role, removed_at on public.budget_members
    for each row execute function private.pause_ineligible_member_income_schedules();

create function public.create_income_schedule(
    p_budget_id uuid,
    p_amount numeric,
    p_frequency text,
    p_start_date date,
    p_end_date date default null,
    p_monthly_short_month_behavior text default 'LAST_DAY'
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    member_id uuid;
    member_role text;
    schedule_id uuid;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount, 4) then
        raise exception using errcode = '22023', message = 'Schedule amount must be positive with at most four decimal places';
    end if;
    if p_frequency not in ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY') then
        raise exception using errcode = '22023', message = 'Schedule frequency is invalid';
    end if;
    if p_monthly_short_month_behavior not in ('LAST_DAY', 'SKIP') then
        raise exception using errcode = '22023', message = 'Monthly short-month behavior is invalid';
    end if;
    if p_start_date is null or (p_end_date is not null and p_end_date < p_start_date) then
        raise exception using errcode = '22023', message = 'Schedule date range is invalid';
    end if;

    select id, role into member_id, member_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;
    if not found or member_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot create an income schedule';
    end if;

    perform 1 from public.budget_allocation_sets
     where budget_id = p_budget_id and status = 'ACTIVE';
    if not found then
        raise exception using errcode = '23514', message = 'The budget has no active allocation set';
    end if;

    insert into public.income_schedules (
        budget_id, income_member_id, created_by_member_id, amount,
        frequency, monthly_short_month_behavior, start_date, end_date, next_occurrence_on, status
    ) values (
        p_budget_id, member_id, member_id, p_amount,
        p_frequency,
        case when p_frequency = 'MONTHLY' then p_monthly_short_month_behavior else 'LAST_DAY' end,
        p_start_date, p_end_date, p_start_date, 'ACTIVE'
    ) returning id into schedule_id;

    return schedule_id;
end;
$function$;

create function public.update_income_schedule_status(
    p_budget_id uuid,
    p_schedule_id uuid,
    p_status text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    member_id uuid;
    member_role text;
    creator_id uuid;
    schedule_status text;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_status not in ('ACTIVE', 'PAUSED', 'CANCELLED') then
        raise exception using errcode = '22023', message = 'Schedule status is invalid';
    end if;

    select id, role into member_id, member_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;
    if not found or member_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot manage income schedules';
    end if;

    select created_by_member_id, status
      into creator_id, schedule_status
      from public.income_schedules
     where budget_id = p_budget_id and id = p_schedule_id
     for update;
    if not found
       or (member_role <> 'OWNER' and creator_id <> member_id)
       or schedule_status = 'COMPLETED' then
        raise exception using errcode = '42501', message = 'The current member cannot manage this income schedule';
    end if;

    update public.income_schedules
       set status = p_status
     where budget_id = p_budget_id and id = p_schedule_id;
    return p_schedule_id;
end;
$function$;

-- Manual income registration remains SECURITY INVOKER. Only the scheduled
-- path called from the private cron function can supply schedule metadata.
drop function public.record_income(uuid, uuid, numeric, date);

create function public.record_income(
    p_budget_id uuid,
    p_period_id uuid,
    p_amount numeric,
    p_occurred_on date,
    p_schedule_id uuid default null,
    p_scheduled_for date default null,
    p_recorder_member_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid;
    actor_role text;
    income_member_id uuid;
    schedule public.income_schedules%rowtype;
    allocation_id uuid;
    income_id uuid;
    total_basis_points bigint;
    item_count bigint;
    base_total numeric(19, 4);
    remaining_units integer;
begin
    if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount, 4) then
        raise exception using errcode = '22023', message = 'Income amount must be positive with at most four decimal places';
    end if;

    if auth.uid() is null then
        if current_user <> 'postgres'
           or p_schedule_id is null
           or p_scheduled_for is null
           or p_recorder_member_id is null
           or p_occurred_on <> p_scheduled_for then
            raise exception using errcode = '42501', message = 'Authentication is required';
        end if;

        select * into schedule
          from public.income_schedules s
         where s.budget_id = p_budget_id
           and s.id = p_schedule_id
           and s.status = 'ACTIVE'
           and s.next_occurrence_on = p_scheduled_for
           and s.amount = p_amount
           and s.created_by_member_id = p_recorder_member_id
           and s.income_member_id = p_recorder_member_id
         for update;
        if not found then
            raise exception using errcode = '42501', message = 'Scheduled income is no longer active';
        end if;
        actor_member_id := schedule.created_by_member_id;
        income_member_id := schedule.income_member_id;
    else
        if p_schedule_id is not null or p_scheduled_for is not null or p_recorder_member_id is not null then
            raise exception using errcode = '42501', message = 'Scheduled income is processed only by the system';
        end if;
        select id, role into actor_member_id, actor_role
          from public.budget_members
         where budget_id = p_budget_id
           and user_id = auth.uid()
           and removed_at is null;
        if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
            raise exception using errcode = '42501', message = 'The current member cannot record income';
        end if;
        income_member_id := actor_member_id;
    end if;

    if p_schedule_id is not null then
        select role into actor_role
          from public.budget_members
         where budget_id = p_budget_id
           and id = actor_member_id
           and removed_at is null;
        if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
            raise exception using errcode = '42501', message = 'The schedule creator cannot record income';
        end if;
        select id into income_id
          from public.income_entries
         where budget_id = p_budget_id
           and schedule_id = p_schedule_id
           and scheduled_for = p_scheduled_for;
        if found then
            return income_id;
        end if;
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
        allocation_set_id, schedule_id, scheduled_for, amount, occurred_on
    ) values (
        p_budget_id, p_period_id, income_member_id, actor_member_id,
        allocation_id, p_schedule_id, p_scheduled_for, p_amount, p_occurred_on
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

revoke all on function public.record_income(uuid, uuid, numeric, date, uuid, date, uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.record_income(uuid, uuid, numeric, date, uuid, date, uuid)
    to authenticated;

revoke all on function public.create_income_schedule(uuid, numeric, text, date, date, text)
    from public, anon, authenticated, service_role;
grant execute on function public.create_income_schedule(uuid, numeric, text, date, date, text)
    to authenticated;
revoke all on function public.update_income_schedule_status(uuid, uuid, text)
    from public, anon, authenticated, service_role;
grant execute on function public.update_income_schedule_status(uuid, uuid, text)
    to authenticated;

create function private.next_income_occurrence(
    p_current_date date,
    p_start_date date,
    p_frequency text,
    p_monthly_short_month_behavior text
)
returns date
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
    target_month date;
    last_day integer;
begin
    case p_frequency
        when 'WEEKLY' then return p_current_date + 7;
        when 'FORTNIGHTLY' then return p_current_date + 14;
        when 'MONTHLY' then
            target_month := (date_trunc('month', p_current_date::timestamp) + interval '1 month')::date;
            last_day := extract(day from (target_month + interval '1 month - 1 day'))::integer;
            if extract(day from p_start_date)::integer > last_day
               and p_monthly_short_month_behavior = 'SKIP' then
                target_month := (target_month + interval '1 month')::date;
                last_day := extract(day from (target_month + interval '1 month - 1 day'))::integer;
            end if;
            return target_month + least(extract(day from p_start_date)::integer, last_day) - 1;
        else
            raise exception using errcode = '22023', message = 'Schedule frequency is invalid';
    end case;
end;
$function$;

revoke all on function private.next_income_occurrence(date, date, text, text)
    from public, anon, authenticated, service_role;

create function private.process_due_income_schedules()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
    schedule public.income_schedules%rowtype;
    target_period_id uuid;
    occurrence_date date;
    following_date date;
    failure_state text;
    failure_message text;
    today_utc date := (clock_timestamp() at time zone 'UTC')::date;
    processed_count integer := 0;
begin
    for schedule in
        select s.*
          from public.income_schedules s
         where s.status = 'ACTIVE'
           and s.next_occurrence_on <= today_utc
           and exists (
               select 1 from public.budget_members m
                where m.budget_id = s.budget_id
                  and m.id = s.created_by_member_id
                  and m.removed_at is null
                  and m.role in ('OWNER', 'CONTRIBUTOR')
           )
         order by s.next_occurrence_on, s.id
         limit 1000
         for update of s skip locked
    loop
        occurrence_date := schedule.next_occurrence_on;

        -- Catch up existing due occurrences, but stop at the first occurrence
        -- that has no matching period. It remains pending at its original date.
        while occurrence_date <= today_utc and processed_count < 1000 loop
            select p.id into target_period_id
              from public.budget_periods p
             where p.budget_id = schedule.budget_id
               and occurrence_date between p.starts_on and p.ends_on
             limit 1;
            if not found then
                exit;
            end if;

            begin
                perform public.record_income(
                    schedule.budget_id,
                    target_period_id,
                    schedule.amount,
                    occurrence_date,
                    schedule.id,
                    occurrence_date,
                    schedule.created_by_member_id
                );
            exception when others then
                get stacked diagnostics
                    failure_state = returned_sqlstate,
                    failure_message = message_text;
                raise warning 'Recurring income schedule % remains pending (%): %',
                    schedule.id, failure_state, failure_message;
                exit;
            end;
            processed_count := processed_count + 1;
            following_date := private.next_income_occurrence(
                occurrence_date, schedule.start_date, schedule.frequency,
                schedule.monthly_short_month_behavior
            );

            if schedule.end_date is not null and following_date > schedule.end_date then
                update public.income_schedules
                   set status = 'COMPLETED', updated_at = clock_timestamp()
                 where id = schedule.id and budget_id = schedule.budget_id;
                exit;
            end if;

            update public.income_schedules
               set next_occurrence_on = following_date,
                   updated_at = clock_timestamp()
             where id = schedule.id and budget_id = schedule.budget_id;
            occurrence_date := following_date;
        end loop;
        if processed_count >= 1000 then
            exit;
        end if;
    end loop;

    return processed_count;
end;
$function$;

revoke all on function private.process_due_income_schedules()
    from public, anon, authenticated, service_role;

select cron.schedule(
    'spendwise-process-recurring-income',
    '15 0 * * *',
    'select private.process_due_income_schedules();'
);
