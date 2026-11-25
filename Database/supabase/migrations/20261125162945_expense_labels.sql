-- Labels classify virtual expenses inside a budget category. They are separate
-- from the free-form description and are shared by active budget members.

create table public.expense_labels (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null,
    category_id uuid not null,
    created_by_member_id uuid not null,
    name text not null check (length(btrim(name)) between 1 and 80),
    is_system boolean generated always as (lower(btrim(name)) = 'por classificar') stored,
    created_at timestamptz not null default now(),
    unique (budget_id, category_id, id),
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete cascade,
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create unique index expense_labels_category_name_idx
    on public.expense_labels (budget_id, category_id, lower(btrim(name)));
create index expense_labels_category_idx
    on public.expense_labels (budget_id, category_id, created_at);

alter table public.expense_labels enable row level security;

grant select, insert on public.expense_labels to authenticated;

create policy expense_labels_select_active_member
    on public.expense_labels for select to authenticated
    using ((select private.current_budget_member_role(budget_id)) is not null);
create policy expense_labels_insert_movement_member
    on public.expense_labels for insert to authenticated
    with check (
        (select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR')
        and created_by_member_id = (select private.current_budget_member_id(budget_id))
        and exists (
            select 1 from public.budget_categories c
             where c.budget_id = expense_labels.budget_id
               and c.id = expense_labels.category_id
               and c.archived_at is null
        )
    );

-- Existing records are retained and marked with an unselectable review bucket.
insert into public.expense_labels (budget_id, category_id, created_by_member_id, name)
select c.budget_id, c.id, c.created_by_member_id, 'Por classificar'
  from public.budget_categories c;

alter table public.expense_entries add column label_id uuid;
update public.expense_entries e
   set label_id = l.id
  from public.expense_labels l
 where l.budget_id = e.budget_id
   and l.category_id = e.category_id
   and l.is_system;
alter table public.expense_entries alter column label_id set not null;
alter table public.expense_entries
    add constraint expense_entries_budget_category_label_fk
    foreign key (budget_id, category_id, label_id)
    references public.expense_labels (budget_id, category_id, id) on delete restrict;

grant update (label_id) on public.expense_entries to authenticated;
create policy expense_entries_update_label_member
    on public.expense_entries for update to authenticated
    using ((select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR'))
    with check ((select private.current_budget_member_role(budget_id)) in ('OWNER', 'CONTRIBUTOR'));

create function private.create_default_expense_label()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    insert into public.expense_labels (budget_id, category_id, created_by_member_id, name)
    values (new.budget_id, new.id, new.created_by_member_id, 'Por classificar');
    return new;
end;
$function$;

create trigger budget_category_default_expense_label
    after insert on public.budget_categories
    for each row execute function private.create_default_expense_label();

create function private.require_selectable_expense_label()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    if not exists (
        select 1 from public.expense_labels l
         where l.id = new.label_id and l.budget_id = new.budget_id
           and l.category_id = new.category_id and not l.is_system
    ) then
        raise exception using errcode = '22023', message = 'A selectable expense label for this category is required';
    end if;
    return new;
end;
$function$;

create trigger expense_entries_selectable_label_check
    before insert or update of budget_id, category_id, label_id on public.expense_entries
    for each row execute function private.require_selectable_expense_label();

create function public.create_expense_label(
    p_budget_id uuid,
    p_category_id uuid,
    p_name text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_member_id uuid;
    actor_role text;
    label_id uuid;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    if p_name is null or length(btrim(p_name)) not between 1 and 80 then
        raise exception using errcode = '22023', message = 'Expense label must contain between 1 and 80 characters';
    end if;
    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id and user_id = auth.uid() and removed_at is null;
    if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot manage expense labels';
    end if;
    if not exists (
        select 1 from public.budget_categories
         where budget_id = p_budget_id and id = p_category_id and archived_at is null
    ) then
        raise exception using errcode = '23503', message = 'An active category is required';
    end if;
    insert into public.expense_labels (budget_id, category_id, created_by_member_id, name)
    values (p_budget_id, p_category_id, actor_member_id, btrim(p_name))
    returning id into label_id;
    return label_id;
end;
$function$;

create function public.record_expense(
    p_budget_id uuid,
    p_period_id uuid,
    p_category_id uuid,
    p_label_id uuid,
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
    select id, role into actor_member_id, actor_role
      from public.budget_members
     where budget_id = p_budget_id and user_id = auth.uid() and removed_at is null;
    if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot record expenses';
    end if;
    insert into public.expense_entries (
        budget_id, period_id, category_id, label_id, recorded_by_member_id,
        amount, spent_on, description
    ) values (
        p_budget_id, p_period_id, p_category_id, p_label_id, actor_member_id,
        p_amount, p_spent_on, nullif(btrim(p_description), '')
    ) returning id into expense_id;
    return expense_id;
end;
$function$;

create function public.update_expense_label(
    p_budget_id uuid,
    p_expense_id uuid,
    p_label_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_role text;
    expense_category_id uuid;
begin
    if auth.uid() is null then
        raise exception using errcode = '42501', message = 'Authentication is required';
    end if;
    select role into actor_role
      from public.budget_members
     where budget_id = p_budget_id and user_id = auth.uid() and removed_at is null;
    if not found or actor_role not in ('OWNER', 'CONTRIBUTOR') then
        raise exception using errcode = '42501', message = 'The current member cannot update expense labels';
    end if;
    select category_id into expense_category_id
      from public.expense_entries
     where budget_id = p_budget_id and id = p_expense_id;
    if not found then
        raise exception using errcode = 'P0002', message = 'Expense not found';
    end if;
    if not exists (
        select 1 from public.expense_labels l
         where l.id = p_label_id and l.budget_id = p_budget_id
           and l.category_id = expense_category_id and not l.is_system
    ) then
        raise exception using errcode = '22023', message = 'A valid expense label for the expense category is required';
    end if;
    update public.expense_entries set label_id = p_label_id
     where budget_id = p_budget_id and id = p_expense_id;
    return p_label_id;
end;
$function$;

revoke all on function public.create_expense_label(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_expense_label(uuid, uuid, text) to authenticated;
revoke all on function public.record_expense(uuid, uuid, uuid, numeric, date, text) from public, anon, authenticated;
drop function public.record_expense(uuid, uuid, uuid, numeric, date, text);
revoke all on function public.record_expense(uuid, uuid, uuid, uuid, numeric, date, text) from public, anon, authenticated;
grant execute on function public.record_expense(uuid, uuid, uuid, uuid, numeric, date, text) to authenticated;
revoke all on function public.update_expense_label(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.update_expense_label(uuid, uuid, uuid) to authenticated;
