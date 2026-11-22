-- Initial SpendWise budget domain.
-- All amounts are records for planning and reporting. They do not move real money.

create table public.profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    full_name text not null
        check (length(btrim(full_name)) between 1 and 120),
    phone_e164 text
        check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    default_currency text not null default 'EUR'
        check (default_currency ~ '^[A-Z]{3}$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.budgets (
    id uuid primary key default gen_random_uuid(),
    name text not null
        check (length(btrim(name)) between 1 and 120),
    budget_type text not null
        check (budget_type in ('PERSONAL', 'SHARED')),
    currency_code text not null
        check (currency_code ~ '^[A-Z]{3}$'),
    owner_member_id uuid not null,
    owner_role text not null default 'OWNER'
        check (owner_role = 'OWNER'),
    created_at timestamptz not null default now(),
    archived_at timestamptz,
    unique (id, owner_member_id, owner_role)
);

create table public.budget_members (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    user_id uuid references auth.users (id) on delete set null,
    role text not null
        check (role in ('OWNER', 'CONTRIBUTOR', 'VIEWER')),
    joined_at timestamptz not null default now(),
    removed_at timestamptz,
    unique (budget_id, id),
    unique (budget_id, id, role),
    check (removed_at is null or role <> 'OWNER'),
    check (removed_at is not null or user_id is not null)
);

create unique index budget_members_one_active_membership_idx
    on public.budget_members (budget_id, user_id)
    where removed_at is null and user_id is not null;

-- The deferred circular foreign key allows the budget and its initial owner
-- membership to be created in the same transaction while guaranteeing an owner.
alter table public.budgets
    add constraint budgets_owner_member_fkey
    foreign key (id, owner_member_id, owner_role)
    references public.budget_members (budget_id, id, role)
    deferrable initially deferred;

create unique index budget_members_one_owner_per_budget_idx
    on public.budget_members (budget_id)
    where role = 'OWNER' and removed_at is null;

create index budget_members_active_user_idx
    on public.budget_members (user_id, budget_id)
    where removed_at is null;

create table public.budget_invitations (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    created_by_member_id uuid not null,
    email text not null check (email = lower(btrim(email))),
    role text not null check (role in ('CONTRIBUTOR', 'VIEWER')),
    token_hash text not null unique,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    check (accepted_at is null or revoked_at is null)
);

create index budget_invitations_budget_expiry_idx
    on public.budget_invitations (budget_id, expires_at);

create index budget_invitations_creator_idx
    on public.budget_invitations (budget_id, created_by_member_id);

create table public.budget_categories (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 80),
    created_by_member_id uuid not null,
    created_at timestamptz not null default now(),
    archived_at timestamptz,
    unique (budget_id, id),
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create unique index budget_categories_active_name_idx
    on public.budget_categories (budget_id, lower(name))
    where archived_at is null;

create index budget_categories_creator_idx
    on public.budget_categories (budget_id, created_by_member_id);

create table public.budget_allocation_sets (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    version integer not null check (version > 0),
    status text not null check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
    effective_from date not null,
    created_by_member_id uuid not null,
    created_at timestamptz not null default now(),
    unique (budget_id, id),
    unique (budget_id, version),
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create unique index budget_allocation_sets_one_active_idx
    on public.budget_allocation_sets (budget_id)
    where status = 'ACTIVE';

create index budget_allocation_sets_creator_idx
    on public.budget_allocation_sets (budget_id, created_by_member_id);

create table public.budget_allocation_items (
    budget_id uuid not null,
    allocation_set_id uuid not null,
    category_id uuid not null,
    percentage_basis_points integer not null
        check (percentage_basis_points between 0 and 10000),
    primary key (budget_id, allocation_set_id, category_id),
    foreign key (budget_id, allocation_set_id)
        references public.budget_allocation_sets (budget_id, id) on delete cascade,
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict
);

create index budget_allocation_items_category_idx
    on public.budget_allocation_items (budget_id, category_id);

create table public.income_schedules (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    income_member_id uuid not null,
    created_by_member_id uuid not null,
    amount numeric(19, 4) not null check (amount > 0),
    frequency text not null check (frequency in ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY')),
    start_date date not null,
    end_date date,
    next_occurrence_on date not null,
    status text not null default 'ACTIVE'
        check (status in ('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (budget_id, id),
    foreign key (budget_id, income_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    foreign key (budget_id, created_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    check (end_date is null or end_date >= start_date),
    check (next_occurrence_on >= start_date),
    check (end_date is null or next_occurrence_on <= end_date)
);

create index income_schedules_due_idx
    on public.income_schedules (next_occurrence_on, budget_id)
    where status = 'ACTIVE';

create index income_schedules_creator_idx
    on public.income_schedules (budget_id, created_by_member_id);

create index income_schedules_income_member_idx
    on public.income_schedules (budget_id, income_member_id);

create table public.income_entries (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    income_member_id uuid not null,
    recorded_by_member_id uuid not null,
    allocation_set_id uuid not null,
    schedule_id uuid,
    scheduled_for date,
    amount numeric(19, 4) not null check (amount > 0),
    occurred_on date not null,
    created_at timestamptz not null default now(),
    unique (budget_id, id),
    foreign key (budget_id, income_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    foreign key (budget_id, recorded_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict,
    foreign key (budget_id, allocation_set_id)
        references public.budget_allocation_sets (budget_id, id) on delete restrict,
    foreign key (budget_id, schedule_id)
        references public.income_schedules (budget_id, id) on delete restrict,
    check ((schedule_id is null) = (scheduled_for is null))
);

create unique index income_entries_schedule_occurrence_idx
    on public.income_entries (schedule_id, scheduled_for)
    where schedule_id is not null;

create index income_entries_budget_date_idx
    on public.income_entries (budget_id, occurred_on desc);

create index income_entries_member_idx
    on public.income_entries (budget_id, income_member_id, occurred_on desc);

create index income_entries_recorder_idx
    on public.income_entries (budget_id, recorded_by_member_id, occurred_on desc);

create index income_entries_allocation_set_idx
    on public.income_entries (budget_id, allocation_set_id);

create index income_entries_schedule_idx
    on public.income_entries (budget_id, schedule_id)
    where schedule_id is not null;

create table public.income_allocation_snapshots (
    budget_id uuid not null,
    income_entry_id uuid not null,
    category_id uuid not null,
    percentage_basis_points integer not null
        check (percentage_basis_points between 0 and 10000),
    allocated_amount numeric(19, 4) not null check (allocated_amount >= 0),
    primary key (income_entry_id, category_id),
    foreign key (budget_id, income_entry_id)
        references public.income_entries (budget_id, id) on delete cascade,
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict
);

create index income_allocation_snapshots_category_idx
    on public.income_allocation_snapshots (budget_id, category_id);

create table public.expense_entries (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    category_id uuid not null,
    recorded_by_member_id uuid not null,
    amount numeric(19, 4) not null check (amount > 0),
    spent_on date not null,
    description text check (description is null or length(description) <= 500),
    created_at timestamptz not null default now(),
    unique (budget_id, id),
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict,
    foreign key (budget_id, recorded_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create index expense_entries_budget_date_idx
    on public.expense_entries (budget_id, spent_on desc);

create index expense_entries_category_date_idx
    on public.expense_entries (budget_id, category_id, spent_on desc);

create index expense_entries_recorder_idx
    on public.expense_entries (budget_id, recorded_by_member_id, spent_on desc);

create table public.budget_adjustments (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    category_id uuid not null,
    corrected_expense_entry_id uuid,
    recorded_by_member_id uuid not null,
    amount_delta numeric(19, 4) not null check (amount_delta <> 0),
    reason text not null check (length(btrim(reason)) between 1 and 500),
    created_at timestamptz not null default now(),
    foreign key (budget_id, category_id)
        references public.budget_categories (budget_id, id) on delete restrict,
    foreign key (budget_id, corrected_expense_entry_id)
        references public.expense_entries (budget_id, id) on delete restrict,
    foreign key (budget_id, recorded_by_member_id)
        references public.budget_members (budget_id, id) on delete restrict
);

create index budget_adjustments_category_date_idx
    on public.budget_adjustments (budget_id, category_id, created_at desc);

create index budget_adjustments_recorder_idx
    on public.budget_adjustments (budget_id, recorded_by_member_id, created_at desc);

create index budget_adjustments_corrected_expense_idx
    on public.budget_adjustments (budget_id, corrected_expense_entry_id)
    where corrected_expense_entry_id is not null;

create table public.budget_reminder_preferences (
    budget_id uuid not null,
    member_id uuid not null,
    reminders_enabled boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (budget_id, member_id),
    foreign key (budget_id, member_id)
        references public.budget_members (budget_id, id) on delete cascade
);

create index budget_reminder_preferences_member_idx
    on public.budget_reminder_preferences (member_id);

create table public.budget_audit_events (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.budgets (id) on delete cascade,
    actor_member_id uuid,
    event_type text not null check (event_type in (
        'INCOME_RECORDED',
        'EXPENSE_RECORDED',
        'ADJUSTMENT_RECORDED',
        'OWNER_TRANSFERRED',
        'MEMBER_ROLE_CHANGED',
        'INVITATION_CREATED',
        'INVITATION_ACCEPTED',
        'INCOME_SCHEDULE_CREATED',
        'INCOME_SCHEDULE_PAUSED',
        'INCOME_SCHEDULE_RESUMED'
    )),
    entity_id uuid,
    occurred_at timestamptz not null default now(),
    foreign key (budget_id, actor_member_id)
        references public.budget_members (budget_id, id) on delete set null (actor_member_id)
);

create index budget_audit_events_budget_time_idx
    on public.budget_audit_events (budget_id, occurred_at desc);

create index budget_audit_events_actor_idx
    on public.budget_audit_events (budget_id, actor_member_id, occurred_at desc);

-- All public tables are exposed to the Supabase Data API. Keep them closed by
-- default until the dedicated MVP-08 migration adds reviewed membership policies.
alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_members enable row level security;
alter table public.budget_invitations enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budget_allocation_sets enable row level security;
alter table public.budget_allocation_items enable row level security;
alter table public.income_schedules enable row level security;
alter table public.income_entries enable row level security;
alter table public.income_allocation_snapshots enable row level security;
alter table public.expense_entries enable row level security;
alter table public.budget_adjustments enable row level security;
alter table public.budget_reminder_preferences enable row level security;
alter table public.budget_audit_events enable row level security;
