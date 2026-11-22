-- Active budget members may see profile names for people in that same budget.
-- Keep this as a narrow definer function so profiles remain private through the
-- general Data API: no user_id, email, phone, or other profile field is returned.
create function public.list_budget_members(p_budget_id uuid)
returns table (
    member_id uuid,
    role text,
    joined_at timestamptz,
    removed_at timestamptz,
    display_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;

    if not exists (
        select 1
          from public.budget_members actor
         where actor.budget_id = p_budget_id
           and actor.user_id = auth.uid()
           and actor.removed_at is null
    ) then
        raise exception using errcode = '42501', message = 'An active budget membership is required';
    end if;

    return query
    select member.id, member.role, member.joined_at, member.removed_at,
           coalesce(profile.full_name,
                    nullif(left(btrim(user_account.raw_user_meta_data ->> 'full_name'), 120), ''))
      from public.budget_members member
      left join public.profiles profile on profile.user_id = member.user_id
      left join auth.users user_account on user_account.id = member.user_id
     where member.budget_id = p_budget_id
       and member.removed_at is null
     order by member.joined_at, member.id;
end;
$function$;

revoke all on function public.list_budget_members(uuid) from public, anon, authenticated;
grant execute on function public.list_budget_members(uuid) to authenticated;
