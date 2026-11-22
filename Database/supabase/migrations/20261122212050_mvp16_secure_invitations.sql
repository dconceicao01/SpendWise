-- Invitation acceptance has to create membership and consume the invitation
-- in one transaction. Keep brute-force attempt state in the unexposed schema.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table private.budget_invitation_accept_attempts (
    user_id uuid not null references auth.users (id) on delete cascade,
    attempted_at timestamptz not null default clock_timestamp()
);

create index budget_invitation_accept_attempts_user_time_idx
    on private.budget_invitation_accept_attempts (user_id, attempted_at desc);

create table private.budget_invitation_create_attempts (
    budget_id uuid not null references public.budgets (id) on delete cascade,
    creator_member_id uuid not null,
    attempted_at timestamptz not null default clock_timestamp(),
    foreign key (budget_id, creator_member_id)
        references public.budget_members (budget_id, id) on delete cascade
);

create index budget_invitation_create_attempts_budget_time_idx
    on private.budget_invitation_create_attempts (budget_id, attempted_at desc);

alter table private.budget_invitation_create_attempts enable row level security;

create policy budget_invitation_create_attempts_select_owner
    on private.budget_invitation_create_attempts for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) = 'OWNER');
create policy budget_invitation_create_attempts_insert_owner
    on private.budget_invitation_create_attempts for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) = 'OWNER'
        and creator_member_id = (select private.current_budget_member_id(budget_id))
    );
create policy budget_invitation_create_attempts_delete_owner
    on private.budget_invitation_create_attempts for delete to authenticated
    using ((select private.current_budget_member_role(budget_id)) = 'OWNER');

grant select, insert, delete on private.budget_invitation_create_attempts to authenticated;
revoke all on table private.budget_invitation_accept_attempts from public, anon, authenticated, service_role;
revoke all on table private.budget_invitation_create_attempts from public, anon, service_role;
revoke update (expires_at) on public.budget_invitations from authenticated;
alter table public.budget_invitations alter column email drop not null;
alter table public.budget_invitations
    add constraint budget_invitations_terminal_email_redaction_check
    check (email is not null or accepted_at is not null or revoked_at is not null) not valid;

-- The trigger enforces creation limits for direct Data API inserts as well as
-- API service calls. It runs as the authenticated owner under RLS.
create function private.enforce_budget_invitation_creation_limit()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid := private.current_budget_member_id(new.budget_id);
    attempt_count integer;
    now_at timestamptz := clock_timestamp();
begin
    if private.current_budget_member_role(new.budget_id) is distinct from 'OWNER'
       or new.created_by_member_id is distinct from actor_member_id then
        raise exception using errcode = '42501', message = 'Budget access denied';
    end if;
    if new.email is null or length(btrim(new.email)) = 0 then
        raise exception using errcode = '22023', message = 'invitation_email_required';
    end if;
    if new.expires_at <= now_at or new.expires_at > now_at + interval '30 days' then
        raise exception using errcode = '22023', message = 'invitation_expiry_invalid';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('budget-invitation-create:' || new.budget_id::text, 0));
    delete from private.budget_invitation_create_attempts attempts
     where attempts.budget_id = new.budget_id
       and attempts.attempted_at < now_at - interval '24 hours';

    select count(*)::integer
      into attempt_count
      from private.budget_invitation_create_attempts attempts
     where attempts.budget_id = new.budget_id
       and attempts.attempted_at >= now_at - interval '1 hour';

    if attempt_count >= 10 then
        raise exception using errcode = 'P0001', message = 'invite_rate_limited';
    end if;

    insert into private.budget_invitation_create_attempts (budget_id, creator_member_id, attempted_at)
    values (new.budget_id, actor_member_id, now_at);
    return new;
end;
$function$;

revoke all on function private.enforce_budget_invitation_creation_limit() from public, anon, authenticated, service_role;
grant execute on function private.enforce_budget_invitation_creation_limit() to authenticated;
create trigger budget_invitations_creation_limit
    before insert on public.budget_invitations
    for each row execute function private.enforce_budget_invitation_creation_limit();

-- Keep email addresses only while the invitation is actionable.
create function private.redact_terminal_budget_invitation_email()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    if new.accepted_at is not null or new.revoked_at is not null then
        new.email := null;
    end if;
    return new;
end;
$function$;

revoke all on function private.redact_terminal_budget_invitation_email() from public, anon, authenticated, service_role;
grant execute on function private.redact_terminal_budget_invitation_email() to authenticated;
create trigger budget_invitations_redact_terminal_email
    before insert or update on public.budget_invitations
    for each row execute function private.redact_terminal_budget_invitation_email();

update public.budget_invitations
   set email = null
 where accepted_at is not null or revoked_at is not null;

create function public.accept_budget_invitation(p_token_hash text)
returns table (accepted boolean, budget_id uuid, role text, rate_limited boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
    actor_id uuid := auth.uid();
    actor_email text;
    invitation public.budget_invitations%rowtype;
    attempt_count integer;
    now_at timestamptz := clock_timestamp();
    new_member_id uuid;
begin
    if actor_id is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;

    if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
        return query select false, null::uuid, null::text, false;
        return;
    end if;

    -- Serialize attempts for this account so concurrent requests cannot bypass
    -- the per-user rate limit. Hash collisions only serialize unrelated users.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text, 0));
    delete from private.budget_invitation_accept_attempts attempts
     where attempts.user_id = actor_id
       and attempts.attempted_at < now_at - interval '24 hours';

    select count(*)::integer
      into attempt_count
      from private.budget_invitation_accept_attempts attempts
     where attempts.user_id = actor_id
       and attempts.attempted_at >= now_at - interval '15 minutes';

    if attempt_count >= 5 then
        return query select false, null::uuid, null::text, true;
        return;
    end if;

    insert into private.budget_invitation_accept_attempts (user_id, attempted_at)
    values (actor_id, now_at);

    select lower(btrim(account.email))
      into actor_email
      from auth.users account
     where account.id = actor_id
       and account.email_confirmed_at is not null;

    if actor_email is null then
        return query select false, null::uuid, null::text, false;
        return;
    end if;

    select candidate.*
      into invitation
      from public.budget_invitations candidate
     where candidate.token_hash = p_token_hash
       and candidate.accepted_at is null
       and candidate.revoked_at is null
       and candidate.expires_at > now_at
       and candidate.email = actor_email
     for update;

    if not found then
        return query select false, null::uuid, null::text, false;
        return;
    end if;

    begin
        insert into public.budget_members (budget_id, user_id, role)
        values (invitation.budget_id, actor_id, invitation.role)
        returning id into new_member_id;
    exception
        when unique_violation then
            return query select false, null::uuid, null::text, false;
            return;
    end;

    if new_member_id is null then
        return query select false, null::uuid, null::text, false;
        return;
    end if;

    update public.budget_invitations current_invitation
       set accepted_at = now_at
     where current_invitation.id = invitation.id;

    -- A successful acceptance invalidates any other outstanding link for the
    -- same budget and address, preventing duplicate memberships via old links.
    update public.budget_invitations other_invitation
       set revoked_at = now_at
     where other_invitation.budget_id = invitation.budget_id
       and other_invitation.email = invitation.email
       and other_invitation.id <> invitation.id
       and other_invitation.accepted_at is null
       and other_invitation.revoked_at is null;

    return query select true, invitation.budget_id, invitation.role, false;
end;
$function$;

revoke all on function public.accept_budget_invitation(text) from public, anon, authenticated, service_role;
grant execute on function public.accept_budget_invitation(text) to authenticated;

-- Purge expired invitation records 30 days after expiry and rate-limit audit
-- records after their rolling windows are no longer relevant.
create function private.cleanup_budget_invitation_data()
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
    delete from public.budget_invitations
     where expires_at <= clock_timestamp() - interval '30 days';
    delete from private.budget_invitation_accept_attempts
     where attempted_at < clock_timestamp() - interval '24 hours';
    delete from private.budget_invitation_create_attempts
     where attempted_at < clock_timestamp() - interval '24 hours';
end;
$function$;

revoke all on function private.cleanup_budget_invitation_data() from public, anon, authenticated, service_role;
select cron.schedule(
    'spendwise-budget-invitation-retention',
    '0 * * * *',
    'select private.cleanup_budget_invitation_data();'
);
