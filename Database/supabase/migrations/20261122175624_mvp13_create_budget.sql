-- Create the budget and its initial owner membership atomically. The circular
-- deferred FK requires both rows to exist at commit; this narrowly scoped
-- SECURITY DEFINER function is the only path that creates that pair.
create function public.create_budget(
    p_name text,
    p_budget_type text,
    p_currency_code text
)
returns table (budget_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
    current_user_id uuid := auth.uid();
    new_budget_id uuid := gen_random_uuid();
    new_owner_member_id uuid := gen_random_uuid();
begin
    if current_user_id is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_name is null or length(btrim(p_name)) not between 1 and 120 then
        raise exception using errcode = '22023', message = 'Budget name must contain between 1 and 120 characters';
    end if;
    if p_budget_type is null or p_budget_type not in ('PERSONAL', 'SHARED') then
        raise exception using errcode = '22023', message = 'Budget type is invalid';
    end if;
    if p_currency_code is null or p_currency_code !~ '^[A-Z]{3}$' then
        raise exception using errcode = '22023', message = 'Currency code must contain three uppercase letters';
    end if;

    insert into public.budgets (
        id, name, budget_type, currency_code, owner_member_id, owner_role
    ) values (
        new_budget_id, btrim(p_name), p_budget_type, p_currency_code,
        new_owner_member_id, 'OWNER'
    );

    insert into public.budget_members (id, budget_id, user_id, role)
    values (new_owner_member_id, new_budget_id, current_user_id, 'OWNER');

    return query select new_budget_id;
end;
$function$;

revoke all on function public.create_budget(text, text, text) from public, anon, authenticated;
grant execute on function public.create_budget(text, text, text) to authenticated;
