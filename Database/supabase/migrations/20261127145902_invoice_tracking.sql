-- Invoice metadata is informational and remains attached to the virtual expense.
-- No invoice files are stored and no tax-authority integration is performed.

alter table public.expense_entries
    add column invoice_status text not null default 'NOT_REQUESTED'
        check (invoice_status in ('NOT_REQUESTED', 'REQUESTED')),
    add column supplier_nipc text,
    add constraint expense_entries_invoice_details_check check (
        (invoice_status = 'REQUESTED' and supplier_nipc ~ '^[0-9]{9}$')
        or (invoice_status = 'NOT_REQUESTED' and supplier_nipc is null)
    );

create index expense_entries_requested_invoice_month_idx
    on public.expense_entries (budget_id, spent_on desc)
    where invoice_status = 'REQUESTED';

revoke all on function public.record_expense(uuid, uuid, uuid, uuid, numeric, date, text)
    from public, anon, authenticated;
drop function public.record_expense(uuid, uuid, uuid, uuid, numeric, date, text);

create function public.record_expense(
    p_budget_id uuid,
    p_period_id uuid,
    p_category_id uuid,
    p_label_id uuid,
    p_amount numeric,
    p_spent_on date,
    p_description text default null,
    p_invoice_status text default 'NOT_REQUESTED',
    p_supplier_nipc text default null
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
    if p_label_id is null or not exists (
        select 1 from public.expense_labels l
         where l.id = p_label_id and l.budget_id = p_budget_id
           and l.category_id = p_category_id and not l.is_system
    ) then
        raise exception using errcode = '22023', message = 'A valid expense label is required';
    end if;
    if p_description is not null and length(btrim(p_description)) > 500 then
        raise exception using errcode = '22023', message = 'Expense description cannot exceed 500 characters';
    end if;
    if p_invoice_status is null or p_invoice_status not in ('NOT_REQUESTED', 'REQUESTED') then
        raise exception using errcode = '22023', message = 'Expense invoice status is invalid';
    end if;
    if p_invoice_status = 'REQUESTED' and (p_supplier_nipc is null or p_supplier_nipc !~ '^[0-9]{9}$') then
        raise exception using errcode = '22023', message = 'A valid supplier NIPC is required for a requested invoice';
    end if;
    if p_invoice_status = 'NOT_REQUESTED' and p_supplier_nipc is not null then
        raise exception using errcode = '22023', message = 'Supplier NIPC is only allowed for a requested invoice';
    end if;

    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id and user_id = auth.uid() and removed_at is null;
    if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot record expenses';
    end if;

    insert into public.expense_entries (
        budget_id, period_id, category_id, label_id, recorded_by_member_id,
        amount, spent_on, description, invoice_status, supplier_nipc
    ) values (
        p_budget_id, p_period_id, p_category_id, p_label_id, actor_member_id,
        p_amount, p_spent_on, nullif(btrim(p_description), ''), p_invoice_status,
        p_supplier_nipc
    ) returning id into expense_id;
    return expense_id;
end;
$function$;

revoke all on function public.record_expense(uuid, uuid, uuid, uuid, numeric, date, text, text, text)
    from public, anon, authenticated;
grant execute on function public.record_expense(uuid, uuid, uuid, uuid, numeric, date, text, text, text)
    to authenticated;
