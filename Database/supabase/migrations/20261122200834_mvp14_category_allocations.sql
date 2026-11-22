
-- The caller's JWT supplies identity for all writes. These domain functions
-- remain SECURITY INVOKER so grants and RLS are evaluated as authenticated.
create function public.create_budget_category(p_budget_id uuid, p_name text)
returns table (category_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid;
    actor_role text;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_name is null or length(btrim(p_name)) not between 1 and 80 then
        raise exception using errcode = '22023', message = 'Category name must contain between 1 and 80 characters';
    end if;

    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;
    if not found or actor_role <> 'OWNER' then
        raise exception using errcode = '42501', message = 'Only the budget owner can manage categories';
    end if;

    return query
    insert into public.budget_categories (budget_id, name, created_by_member_id)
    values (p_budget_id, btrim(p_name), actor_member_id)
    returning id;
end;
$function$;

revoke all on function public.create_budget_category(uuid, text) from public, anon, authenticated;
grant execute on function public.create_budget_category(uuid, text) to authenticated;

create function public.create_budget_allocation_draft(p_budget_id uuid, p_items jsonb)
returns table (allocation_set_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid;
    actor_role text;
    next_version integer;
    new_allocation_set_id uuid := gen_random_uuid();
    item_count bigint;
    distinct_category_count bigint;
    valid_category_count bigint;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception using errcode = '22023', message = 'Allocation items must be a JSON array';
    end if;
    if jsonb_array_length(p_items) not between 1 and 100 then
        raise exception using errcode = '22023', message = 'An allocation draft needs between 1 and 100 items';
    end if;

    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;
    if not found or actor_role <> 'OWNER' then
        raise exception using errcode = '42501', message = 'Only the budget owner can manage allocations';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(p_budget_id::text || ':allocation-activation', 0)
    );

    select coalesce(max(version), 0) + 1 into next_version
      from public.budget_allocation_sets
     where budget_id = p_budget_id;

    select count(*), count(distinct item.category_id)
      into item_count, distinct_category_count
      from jsonb_to_recordset(p_items) as item(category_id uuid, percentage_basis_points integer);

    if item_count <> jsonb_array_length(p_items)
       or item_count <> distinct_category_count
       or exists (
           select 1
             from jsonb_to_recordset(p_items) as item(category_id uuid, percentage_basis_points integer)
            where item.category_id is null
               or item.percentage_basis_points is null
               or item.percentage_basis_points not between 0 and 10000
       ) then
        raise exception using errcode = '22023', message = 'Allocation items are invalid or duplicated';
    end if;

    select count(*) into valid_category_count
      from jsonb_to_recordset(p_items) as item(category_id uuid, percentage_basis_points integer)
      join public.budget_categories category
        on category.budget_id = p_budget_id
       and category.id = item.category_id
       and category.archived_at is null;
    if valid_category_count <> item_count then
        raise exception using errcode = '22023', message = 'Allocation items must use active categories in this budget';
    end if;

    insert into public.budget_allocation_sets (
        id, budget_id, version, status, created_by_member_id
    ) values (
        new_allocation_set_id, p_budget_id, next_version, 'DRAFT', actor_member_id
    );

    insert into public.budget_allocation_items (
        budget_id, allocation_set_id, category_id, percentage_basis_points
    )
    select p_budget_id, new_allocation_set_id, item.category_id, item.percentage_basis_points
      from jsonb_to_recordset(p_items) as item(category_id uuid, percentage_basis_points integer);

    return query select new_allocation_set_id;
end;
$function$;

revoke all on function public.create_budget_allocation_draft(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_budget_allocation_draft(uuid, jsonb) to authenticated;

create function public.replace_budget_allocation_draft(
    p_budget_id uuid,
    p_allocation_set_id uuid,
    p_items jsonb
)
returns table (allocation_set_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_role text;
    current_status text;
    item_count bigint;
    distinct_category_count bigint;
    valid_category_count bigint;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception using errcode = '22023', message = 'Allocation items must be a JSON array';
    end if;
    if jsonb_array_length(p_items) not between 1 and 100 then
        raise exception using errcode = '22023', message = 'An allocation draft needs between 1 and 100 items';
    end if;

    select role into actor_role
      from public.budget_members
     where budget_id = p_budget_id
       and user_id = auth.uid()
       and removed_at is null;
    if not found or actor_role <> 'OWNER' then
        raise exception using errcode = '42501', message = 'Only the budget owner can manage allocations';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(p_budget_id::text || ':allocation-activation', 0)
    );
    perform pg_advisory_xact_lock(
        hashtextextended(p_budget_id::text || ':allocation:' || p_allocation_set_id::text, 0)
    );

    select status into current_status
      from public.budget_allocation_sets
     where budget_id = p_budget_id and id = p_allocation_set_id
     for update;
    if not found or current_status <> 'DRAFT' then
        raise exception using errcode = '23514', message = 'Only a draft allocation set can be edited';
    end if;

    select count(*), count(distinct item.category_id)
      into item_count, distinct_category_count
      from jsonb_to_recordset(p_items) as item(category_id uuid, percentage_basis_points integer);
    if item_count <> jsonb_array_length(p_items)
       or item_count <> distinct_category_count
       or exists (
           select 1
             from jsonb_to_recordset(p_items) as item(category_id uuid, percentage_basis_points integer)
            where item.category_id is null
               or item.percentage_basis_points is null
               or item.percentage_basis_points not between 0 and 10000
       ) then
        raise exception using errcode = '22023', message = 'Allocation items are invalid or duplicated';
    end if;

    select count(*) into valid_category_count
      from jsonb_to_recordset(p_items) as item(category_id uuid, percentage_basis_points integer)
      join public.budget_categories category
        on category.budget_id = p_budget_id
       and category.id = item.category_id
       and category.archived_at is null;
    if valid_category_count <> item_count then
        raise exception using errcode = '22023', message = 'Allocation items must use active categories in this budget';
    end if;

    delete from public.budget_allocation_items as item
     where item.budget_id = p_budget_id and item.allocation_set_id = p_allocation_set_id;
    insert into public.budget_allocation_items (
        budget_id, allocation_set_id, category_id, percentage_basis_points
    )
    select p_budget_id, p_allocation_set_id, item.category_id, item.percentage_basis_points
      from jsonb_to_recordset(p_items) as item(category_id uuid, percentage_basis_points integer);

    return query select p_allocation_set_id;
end;
$function$;

revoke all on function public.replace_budget_allocation_draft(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_budget_allocation_draft(uuid, uuid, jsonb) to authenticated;
