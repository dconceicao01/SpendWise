-- Authorization helpers read only the caller's active membership. Their
-- SECURITY DEFINER boundary breaks RLS recursion on budget_members; they are
-- kept in the non-exposed private schema and cannot accept another user ID.
create function private.current_budget_member_id(p_budget_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $function$
    select m.id
      from public.budget_members m
     where m.budget_id = p_budget_id
       and m.user_id = (select auth.uid())
       and m.removed_at is null
$function$;

create function private.current_budget_member_role(p_budget_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
    select m.role
      from public.budget_members m
     where m.budget_id = p_budget_id
       and m.user_id = (select auth.uid())
       and m.removed_at is null
$function$;

revoke all on function private.current_budget_member_id(uuid) from public, anon, authenticated;
revoke all on function private.current_budget_member_role(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_budget_member_id(uuid) to authenticated;
grant execute on function private.current_budget_member_role(uuid) to authenticated;

-- Remove inherited table and sequence access; grant the authenticated API only
-- the operations represented by policies below. service_role remains a
-- privileged server credential and must never be sent to client apps.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.budgets to authenticated;
grant update (name, archived_at) on public.budgets to authenticated;
grant select on public.budget_periods to authenticated;
grant insert (budget_id, starts_on, ends_on) on public.budget_periods to authenticated;
grant update (starts_on, ends_on) on public.budget_periods to authenticated;
grant select on public.budget_members to authenticated;
grant update (role, removed_at) on public.budget_members to authenticated;
grant select (id, budget_id, created_by_member_id, email, role, expires_at, accepted_at, revoked_at, created_at)
    on public.budget_invitations to authenticated;
grant insert (budget_id, created_by_member_id, email, role, token_hash, expires_at)
    on public.budget_invitations to authenticated;
grant update (expires_at, revoked_at) on public.budget_invitations to authenticated;
grant select on public.budget_categories to authenticated;
grant insert (budget_id, name, created_by_member_id) on public.budget_categories to authenticated;
grant update (name, archived_at) on public.budget_categories to authenticated;
grant select on public.budget_allocation_sets to authenticated;
grant insert (id, budget_id, version, status, created_by_member_id)
    on public.budget_allocation_sets to authenticated;
grant update (status) on public.budget_allocation_sets to authenticated;
grant select, insert, update, delete on public.budget_allocation_items to authenticated;
grant select on public.income_schedules to authenticated;
grant select, insert on public.income_entries to authenticated;
grant select, insert on public.income_allocation_snapshots to authenticated;
grant select, insert on public.expense_entries to authenticated;
grant select, insert on public.budget_adjustments to authenticated;
grant select, insert, update, delete on public.budget_reminder_preferences to authenticated;
grant select on public.budget_audit_events to authenticated;

-- A profile is private to its owner.
create policy profiles_select_self
    on public.profiles for select to authenticated
    using (user_id = (select auth.uid()));
create policy profiles_insert_self
    on public.profiles for insert to authenticated
    with check (user_id = (select auth.uid()));
create policy profiles_update_self
    on public.profiles for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- Membership is the sole source of access to a budget and its related rows.
create policy budgets_select_active_member
    on public.budgets for select to authenticated
    using ((select private.current_budget_member_role(id)) is not null);
create policy budgets_update_owner
    on public.budgets for update to authenticated
    using ((select private.current_budget_member_role(id)) = 'OWNER')
    with check ((select private.current_budget_member_role(id)) = 'OWNER');

create policy budget_periods_select_active_member
    on public.budget_periods for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy budget_periods_insert_owner
    on public.budget_periods for insert to authenticated
    with check ((select private.current_budget_member_role(budget_id)) = 'OWNER');
create policy budget_periods_update_owner
    on public.budget_periods for update to authenticated
    using ((select private.current_budget_member_role(budget_id)) = 'OWNER')
    with check ((select private.current_budget_member_role(budget_id)) = 'OWNER');

create policy budget_members_select_active_budget
    on public.budget_members for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy budget_members_update_owner
    on public.budget_members for update to authenticated
    using ((select private.current_budget_member_role(budget_id)) = 'OWNER')
    with check ((select private.current_budget_member_role(budget_id)) = 'OWNER');

-- Invitations are visible and manageable only by the active owner. The invitee
-- acceptance endpoint is added with the secure token workflow in MVP-16.
create policy budget_invitations_select_owner
    on public.budget_invitations for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) = 'OWNER');
create policy budget_invitations_insert_owner
    on public.budget_invitations for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        and created_by_member_id = (select private.current_budget_member_id(budget_id))
    );
create policy budget_invitations_update_owner
    on public.budget_invitations for update to authenticated
    using ((select private.current_budget_member_role(budget_id)) = 'OWNER')
    with check ((select private.current_budget_member_role(budget_id)) = 'OWNER');

create policy budget_categories_select_active_member
    on public.budget_categories for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy budget_categories_insert_owner
    on public.budget_categories for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        and created_by_member_id = (select private.current_budget_member_id(budget_id))
    );
create policy budget_categories_update_owner
    on public.budget_categories for update to authenticated
    using ((select private.current_budget_member_role(budget_id)) = 'OWNER')
    with check ((select private.current_budget_member_role(budget_id)) = 'OWNER');

create policy budget_allocation_sets_select_active_member
    on public.budget_allocation_sets for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy budget_allocation_sets_insert_owner_draft
    on public.budget_allocation_sets for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        and created_by_member_id = (select private.current_budget_member_id(budget_id))
        and status = 'DRAFT'
    );
create policy budget_allocation_sets_update_owner
    on public.budget_allocation_sets for update to authenticated
    using ((select private.current_budget_member_role(budget_id)) = 'OWNER')
    with check ((select private.current_budget_member_role(budget_id)) = 'OWNER');

create policy budget_allocation_items_select_active_member
    on public.budget_allocation_items for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy budget_allocation_items_insert_owner_draft
    on public.budget_allocation_items for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        and exists (
            select 1 from public.budget_allocation_sets s
             where s.budget_id = budget_allocation_items.budget_id
               and s.id = budget_allocation_items.allocation_set_id
               and s.status = 'DRAFT'
        )
    );
create policy budget_allocation_items_update_owner_draft
    on public.budget_allocation_items for update to authenticated
    using (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        and exists (
            select 1 from public.budget_allocation_sets s
             where s.budget_id = budget_allocation_items.budget_id
               and s.id = budget_allocation_items.allocation_set_id
               and s.status = 'DRAFT'
        )
    )
    with check (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        and exists (
            select 1 from public.budget_allocation_sets s
             where s.budget_id = budget_allocation_items.budget_id
               and s.id = budget_allocation_items.allocation_set_id
               and s.status = 'DRAFT'
        )
    );
create policy budget_allocation_items_delete_owner_draft
    on public.budget_allocation_items for delete to authenticated
    using (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        and exists (
            select 1 from public.budget_allocation_sets s
             where s.budget_id = budget_allocation_items.budget_id
               and s.id = budget_allocation_items.allocation_set_id
               and s.status = 'DRAFT'
        )
    );

create policy income_schedules_select_active_member
    on public.income_schedules for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy income_entries_select_active_member
    on public.income_entries for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy income_entries_insert_contributor
    on public.income_entries for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR')
        and recorded_by_member_id = (select private.current_budget_member_id(budget_id))
        and income_member_id = (select private.current_budget_member_id(budget_id))
        and schedule_id is null
        and scheduled_for is null
    );
create policy income_allocation_snapshots_select_active_member
    on public.income_allocation_snapshots for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy income_allocation_snapshots_insert_contributor
    on public.income_allocation_snapshots for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR')
        and exists (
            select 1 from public.income_entries i
             where i.budget_id = income_allocation_snapshots.budget_id
               and i.id = income_allocation_snapshots.income_entry_id
               and i.recorded_by_member_id = (select private.current_budget_member_id(budget_id))
        )
    );

create policy expense_entries_select_active_member
    on public.expense_entries for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy expense_entries_insert_contributor
    on public.expense_entries for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR')
        and recorded_by_member_id = (select private.current_budget_member_id(budget_id))
    );
create policy budget_adjustments_select_active_member
    on public.budget_adjustments for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy budget_adjustments_insert_contributor
    on public.budget_adjustments for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR')
        and recorded_by_member_id = (select private.current_budget_member_id(budget_id))
    );

create policy budget_reminder_preferences_select_self
    on public.budget_reminder_preferences for select to authenticated
    using (member_id = (select private.current_budget_member_id(budget_id)));
create policy budget_reminder_preferences_insert_self
    on public.budget_reminder_preferences for insert to authenticated
    with check (member_id = (select private.current_budget_member_id(budget_id)));
create policy budget_reminder_preferences_update_self
    on public.budget_reminder_preferences for update to authenticated
    using (member_id = (select private.current_budget_member_id(budget_id)))
    with check (member_id = (select private.current_budget_member_id(budget_id)));
create policy budget_reminder_preferences_delete_self
    on public.budget_reminder_preferences for delete to authenticated
    using (member_id = (select private.current_budget_member_id(budget_id)));

create policy budget_audit_events_select_active_member
    on public.budget_audit_events for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);

revoke all on function public.activate_budget_allocation_set(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_budget_allocation_set(uuid, uuid) to authenticated;
revoke all on function public.record_income(uuid, uuid, numeric, date) from public, anon, authenticated;
grant execute on function public.record_income(uuid, uuid, numeric, date) to authenticated;
