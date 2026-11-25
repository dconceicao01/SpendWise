alter table public.income_entries
    add column description text
    check (description is null or char_length(description) <= 500);

alter table public.income_schedules
    add column description text
    check (description is null or char_length(description) <= 500);

create function private.apply_income_entry_description()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    requested_description text;
begin
    requested_description := nullif(
        btrim(current_setting('spendwise.income_description', true)),
        ''
    );
    if requested_description is not null then
        new.description := requested_description;
    elsif current_setting('spendwise.income_description', true) is not null then
        new.description := null;
    end if;
    return new;
end;
$function$;

revoke all on function private.apply_income_entry_description()
    from public, anon, authenticated, service_role;

create trigger income_entries_apply_description
    before insert on public.income_entries
    for each row execute function private.apply_income_entry_description();

create function private.apply_income_schedule_description()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
    requested_description text;
begin
    requested_description := nullif(
        btrim(current_setting('spendwise.income_schedule_description', true)),
        ''
    );
    if requested_description is not null then
        new.description := requested_description;
    elsif current_setting('spendwise.income_schedule_description', true) is not null then
        new.description := null;
    end if;
    return new;
end;
$function$;

revoke all on function private.apply_income_schedule_description()
    from public, anon, authenticated, service_role;

create trigger income_schedules_apply_description
    before insert on public.income_schedules
    for each row execute function private.apply_income_schedule_description();

create function public.create_income_schedule_with_description(
    p_budget_id uuid,
    p_amount numeric,
    p_frequency text,
    p_start_date date,
    p_end_date date,
    p_monthly_short_month_behavior text,
    p_description text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    if p_description is not null and char_length(btrim(p_description)) > 500 then
        raise exception using errcode = '22023', message = 'Income description must not exceed 500 characters';
    end if;

    perform set_config(
        'spendwise.income_schedule_description',
        coalesce(nullif(btrim(p_description), ''), ''),
        true
    );
    return public.create_income_schedule(
        p_budget_id,
        p_amount,
        p_frequency,
        p_start_date,
        p_end_date,
        p_monthly_short_month_behavior
    );
end;
$function$;

revoke all on function public.create_income_schedule_with_description(
    uuid, numeric, text, date, date, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_income_schedule_with_description(
    uuid, numeric, text, date, date, text, text
) to authenticated;

create function public.record_income_with_description(
    p_budget_id uuid,
    p_period_id uuid,
    p_amount numeric,
    p_occurred_on date,
    p_description text,
    p_schedule_id uuid,
    p_scheduled_for date,
    p_recorder_member_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    if p_description is not null and char_length(btrim(p_description)) > 500 then
        raise exception using errcode = '22023', message = 'Income description must not exceed 500 characters';
    end if;

    perform set_config(
        'spendwise.income_description',
        coalesce(nullif(btrim(p_description), ''), ''),
        true
    );
    return public.record_income(
        p_budget_id,
        p_period_id,
        p_amount,
        p_occurred_on,
        p_schedule_id,
        p_scheduled_for,
        p_recorder_member_id
    );
end;
$function$;

revoke all on function public.record_income_with_description(
    uuid, uuid, numeric, date, text, uuid, date, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.record_income_with_description(
    uuid, uuid, numeric, date, text, uuid, date, uuid
) to authenticated;

create or replace function private.process_due_income_schedules()
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
                perform set_config(
                    'spendwise.income_description',
                    coalesce(nullif(btrim(schedule.description), ''), ''),
                    true
                );
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
