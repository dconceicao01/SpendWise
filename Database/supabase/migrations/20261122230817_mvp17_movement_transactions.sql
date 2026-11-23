-- Transactional write entry points for virtual income, expenses and adjustments.
-- All values are planning records; no real money is moved.

create function public.record_expense(
    p_budget_id uuid,
    p_period_id uuid,
    p_category_id uuid,
    p_amount numeric,
    p_spent_on date,
    p_description text default null
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid;
    actor_role text;
    expense_id uuid;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount, 4) then
        raise exception using errcode = '22023', message = 'Expense amount must be positive with at most four decimal places';
    end if;
    if p_spent_on is null then
        raise exception using errcode = '22023', message = 'Expense date is required';
    end if;
    if p_description is not null and length(btrim(p_description)) > 500 then
        raise exception using errcode = '22023', message = 'Expense description cannot exceed 500 characters';
    end if;

    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;

    if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot record expenses';
    end if;

    insert into public.expense_entries (
        budget_id, period_id, category_id, recorded_by_member_id,
        amount, spent_on, description
    ) values (
        p_budget_id, p_period_id, p_category_id, actor_member_id,
        p_amount, p_spent_on, nullif(btrim(p_description), '')
    ) returning id into expense_id;

    return expense_id;
end;
$function$;

create function public.record_budget_adjustment(
    p_budget_id uuid,
    p_period_id uuid,
    p_category_id uuid,
    p_amount_delta numeric,
    p_reason text,
    p_occurred_on date,
    p_corrected_expense_entry_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid;
    actor_role text;
    adjustment_id uuid;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_amount_delta is null or p_amount_delta = 0 or p_amount_delta <> trunc(p_amount_delta, 4) then
        raise exception using errcode = '22023', message = 'Adjustment must be non-zero with at most four decimal places';
    end if;
    if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
        raise exception using errcode = '22023', message = 'Adjustment reason is required and cannot exceed 500 characters';
    end if;
    if p_occurred_on is null then
        raise exception using errcode = '22023', message = 'Adjustment date is required';
    end if;

    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;

    if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot record adjustments';
    end if;

    insert into public.budget_adjustments (
        budget_id, period_id, category_id, corrected_expense_entry_id,
        recorded_by_member_id, amount_delta, reason, occurred_on
    ) values (
        p_budget_id, p_period_id, p_category_id, p_corrected_expense_entry_id,
        actor_member_id, p_amount_delta, btrim(p_reason), p_occurred_on
    ) returning id into adjustment_id;

    return adjustment_id;
end;
$function$;

revoke all on function public.record_expense(uuid, uuid, uuid, numeric, date, text)
    from public, anon, authenticated;
grant execute on function public.record_expense(uuid, uuid, uuid, numeric, date, text)
    to authenticated;

revoke all on function public.record_budget_adjustment(uuid, uuid, uuid, numeric, text, date, uuid)
    from public, anon, authenticated;
grant execute on function public.record_budget_adjustment(uuid, uuid, uuid, numeric, text, date, uuid)
    to authenticated;
