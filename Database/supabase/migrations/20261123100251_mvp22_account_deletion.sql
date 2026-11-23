-- MVP-22: profile corrections and ordered account deletion.
-- The authenticated RPC atomically removes personal data and pseudonymizes
-- memberships in shared budgets. Supabase Auth Admin deletion happens only
-- after this transaction commits, from the trusted backend.

create table private.account_deletion_requests (
    user_id uuid primary key references auth.users (id) on delete cascade,
    requested_at timestamptz not null default clock_timestamp()
);
revoke all on table private.account_deletion_requests from public, anon, authenticated, service_role;

create function private.account_deletion_pending()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
    select exists (
        select 1 from private.account_deletion_requests d where d.user_id = (select auth.uid())
    )
$function$;
revoke all on function private.account_deletion_pending() from public, anon, authenticated, service_role;
grant execute on function private.account_deletion_pending() to authenticated;

create or replace function private.current_budget_member_id(p_budget_id uuid)
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
       and not private.account_deletion_pending()
$function$;

create or replace function private.current_budget_member_role(p_budget_id uuid)
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
       and not private.account_deletion_pending()
$function$;

create or replace function private.reject_pending_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
    if exists (
        select 1 from private.account_deletion_requests d where d.user_id = new.user_id
    ) then
        raise exception using errcode = '42501', message = 'Account deletion is pending';
    end if;
    return new;
end;
$function$;
revoke all on function private.reject_pending_account_deletion() from public, anon, authenticated, service_role;

create trigger profiles_reject_pending_deletion
    before insert or update on public.profiles
    for each row execute function private.reject_pending_account_deletion();
create trigger budget_members_reject_pending_deletion
    before insert on public.budget_members
    for each row execute function private.reject_pending_account_deletion();

drop policy profiles_select_self on public.profiles;
create policy profiles_select_self
    on public.profiles for select to authenticated
    using (
        user_id = (select auth.uid())
        and not private.account_deletion_pending()
    );

create or replace function public.request_account_deletion(p_owner_transfers jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
    actor_id uuid := auth.uid();
    membership record;
    transfer_target uuid;
    transfer_count integer;
    supplied_count integer;
begin
    if actor_id is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    -- A previous request may have committed its cleanup before Auth Admin was
    -- unavailable. Keep retries idempotent so the server can finish Auth deletion.
    if exists (
        select 1 from private.account_deletion_requests d where d.user_id = actor_id
    ) then
        return;
    end if;
    -- The Auth delete may have succeeded even if its HTTP response was lost.
    -- With the active memberships already removed and the profile gone, allow
    -- the backend to repeat the Auth Admin delete (which treats 404 as complete).
    if not exists (select 1 from auth.users u where u.id = actor_id)
       and not exists (
           select 1 from public.budget_members m
            where m.user_id = actor_id and m.removed_at is null
       )
       and not exists (select 1 from public.profiles p where p.user_id = actor_id) then
        return;
    end if;
    if p_owner_transfers is null or jsonb_typeof(p_owner_transfers) <> 'array' then
        raise exception using errcode = '22023', message = 'Owner transfers must be an array';
    end if;
    if exists (
        select 1
          from jsonb_array_elements(p_owner_transfers) item
         where jsonb_typeof(item) <> 'object'
            or not (item ? 'budget_id')
            or not (item ? 'target_member_id')
            or (item->>'budget_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or (item->>'target_member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
        raise exception using errcode = '22023', message = 'Owner transfer entry is invalid';
    end if;
    select count(*), count(distinct item->>'budget_id')
      into transfer_count, supplied_count
      from jsonb_array_elements(p_owner_transfers) item;
    if transfer_count <> supplied_count then
        raise exception using errcode = '22023', message = 'Owner transfer budgets must be unique';
    end if;

    -- Lock each active membership/budget while validating and applying changes.
    for membership in
        select m.id as member_id, m.budget_id, m.role, b.budget_type
          from public.budget_members m
          join public.budgets b on b.id = m.budget_id
         where m.user_id = actor_id and m.removed_at is null
         order by m.budget_id
         for update of m, b
    loop
        if membership.budget_type = 'SHARED' and membership.role = 'OWNER' then
            select (item->>'target_member_id')::uuid into transfer_target
              from jsonb_array_elements(p_owner_transfers) item
             where (item->>'budget_id')::uuid = membership.budget_id;
            if transfer_target is null then
                raise exception using errcode = '22023', message = 'Owner transfer is required for each shared budget';
            end if;
            if not exists (
                select 1 from public.budget_members target
                 where target.budget_id = membership.budget_id
                   and target.id = transfer_target
                   and target.user_id <> actor_id
                   and target.removed_at is null
                   and target.role in ('CONTRIBUTOR', 'VIEWER')
            ) then
                raise exception using errcode = '22023', message = 'Owner transfer target must be another active member';
            end if;
        end if;
    end loop;

    if supplied_count <> (
        select count(*)::integer
          from public.budget_members m
          join public.budgets b on b.id = m.budget_id
         where m.user_id = actor_id and m.removed_at is null
           and m.role = 'OWNER' and b.budget_type = 'SHARED'
    ) then
        raise exception using errcode = '22023', message = 'Owner transfers contain an unrelated budget';
    end if;

    insert into private.account_deletion_requests (user_id)
    values (actor_id)
    on conflict (user_id) do nothing;

    -- Transfer ownership before removing the current owner's membership.
    for membership in
        select m.id as member_id, m.budget_id
          from public.budget_members m
          join public.budgets b on b.id = m.budget_id
         where m.user_id = actor_id and m.removed_at is null
           and m.role = 'OWNER' and b.budget_type = 'SHARED'
         order by m.budget_id
    loop
        select (item->>'target_member_id')::uuid into transfer_target
          from jsonb_array_elements(p_owner_transfers) item
         where (item->>'budget_id')::uuid = membership.budget_id;

        update public.budget_members set role = 'CONTRIBUTOR'
         where budget_id = membership.budget_id and id = membership.member_id;
        update public.budget_members set role = 'OWNER'
         where budget_id = membership.budget_id and id = transfer_target;
        update public.budgets set owner_member_id = transfer_target
         where id = membership.budget_id;
    end loop;

    -- Cancel pending invitations authored by the departing members. The
    -- existing terminal-invitation trigger redacts invitee email addresses.
    update public.budget_invitations invitation
       set revoked_at = clock_timestamp()
     where invitation.revoked_at is null
       and invitation.accepted_at is null
       and exists (
           select 1 from public.budget_members m
            where m.budget_id = invitation.budget_id
              and m.id = invitation.created_by_member_id
              and m.user_id = actor_id and m.removed_at is null
       );

    delete from public.budget_reminder_preferences preference
     where exists (
         select 1 from public.budget_members m
          where m.budget_id = preference.budget_id
            and m.id = preference.member_id
            and m.user_id = actor_id and m.removed_at is null
     );

    delete from public.budgets b
     where b.budget_type = 'PERSONAL'
       and exists (
           select 1 from public.budget_members m
            where m.budget_id = b.id and m.user_id = actor_id
              and m.removed_at is null and m.role = 'OWNER'
       );

    update public.budget_members
       set role = case when role = 'OWNER' then 'CONTRIBUTOR' else role end,
           removed_at = coalesce(removed_at, clock_timestamp()),
           user_id = null
     where user_id = actor_id and removed_at is null;

    delete from public.profiles where user_id = actor_id;
end;
$function$;

revoke all on function public.request_account_deletion(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.request_account_deletion(jsonb) to authenticated;
