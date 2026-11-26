-- Account deletion must remove restrictive children before the personal budget
-- cascade reaches their creator memberships. Expense labels reference both
-- categories and memberships, while expenses and adjustments reference labels
-- and entries with RESTRICT constraints.

create function private.cleanup_personal_budget_dependencies()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    if old.budget_type <> 'PERSONAL' then
        return old;
    end if;

    delete from public.budget_adjustments
     where budget_id = old.id;

    delete from public.income_corrections
     where budget_id = old.id;

    delete from public.expense_entries
     where budget_id = old.id;

    delete from public.income_entries
     where budget_id = old.id;

    delete from public.income_schedules
     where budget_id = old.id;

    delete from public.budget_invitations
     where budget_id = old.id;

    delete from public.budget_allocation_items
     where budget_id = old.id;

    delete from public.expense_labels
     where budget_id = old.id;

    delete from public.budget_allocation_sets
     where budget_id = old.id;

    delete from public.budget_categories
     where budget_id = old.id;

    return old;
end;
$function$;

revoke all on function private.cleanup_personal_budget_dependencies() from public, anon, authenticated, service_role;

create trigger cleanup_personal_budget_dependencies_before_delete
    before delete on public.budgets
    for each row execute function private.cleanup_personal_budget_dependencies();

