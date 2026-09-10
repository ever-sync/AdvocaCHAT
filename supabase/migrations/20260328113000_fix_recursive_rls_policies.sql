create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.is_same_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_tenant_id is not null
    and target_tenant_id = public.current_tenant_id()
$$;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_same_tenant_select" on public.profiles;
create policy "profiles_same_tenant_select"
on public.profiles
for select
using (
  auth.uid() = id
  or public.is_same_tenant(tenant_id)
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "customers_same_tenant_select" on public.customers;
create policy "customers_same_tenant_select"
on public.customers
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "customers_same_tenant_insert" on public.customers;
create policy "customers_same_tenant_insert"
on public.customers
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "customers_same_tenant_update" on public.customers;
create policy "customers_same_tenant_update"
on public.customers
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "collaborator_invites_same_tenant_select" on public.collaborator_invites;
create policy "collaborator_invites_same_tenant_select"
on public.collaborator_invites
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "collaborator_invites_same_tenant_insert" on public.collaborator_invites;
create policy "collaborator_invites_same_tenant_insert"
on public.collaborator_invites
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "collaborator_invites_same_tenant_update" on public.collaborator_invites;
create policy "collaborator_invites_same_tenant_update"
on public.collaborator_invites
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "delivery_routes_same_tenant_select" on public.delivery_routes;
create policy "delivery_routes_same_tenant_select"
on public.delivery_routes
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "delivery_routes_same_tenant_insert" on public.delivery_routes;
create policy "delivery_routes_same_tenant_insert"
on public.delivery_routes
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "delivery_routes_same_tenant_update" on public.delivery_routes;
create policy "delivery_routes_same_tenant_update"
on public.delivery_routes
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "tasks_same_tenant_select" on public.tasks;
create policy "tasks_same_tenant_select"
on public.tasks
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "tasks_same_tenant_insert" on public.tasks;
create policy "tasks_same_tenant_insert"
on public.tasks
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "tasks_same_tenant_update" on public.tasks;
create policy "tasks_same_tenant_update"
on public.tasks
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_instances_same_tenant_select" on public.whatsapp_instances;
create policy "whatsapp_instances_same_tenant_select"
on public.whatsapp_instances
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_instances_same_tenant_insert" on public.whatsapp_instances;
create policy "whatsapp_instances_same_tenant_insert"
on public.whatsapp_instances
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_instances_same_tenant_update" on public.whatsapp_instances;
create policy "whatsapp_instances_same_tenant_update"
on public.whatsapp_instances
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_chats_same_tenant_select" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_select"
on public.whatsapp_chats
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_chats_same_tenant_insert" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_insert"
on public.whatsapp_chats
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_chats_same_tenant_update" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_update"
on public.whatsapp_chats
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_messages_same_tenant_select" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_select"
on public.whatsapp_messages
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_messages_same_tenant_insert" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_insert"
on public.whatsapp_messages
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_messages_same_tenant_update" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_update"
on public.whatsapp_messages
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_webhook_events_same_tenant_select" on public.whatsapp_webhook_events;
create policy "whatsapp_webhook_events_same_tenant_select"
on public.whatsapp_webhook_events
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "whatsapp_webhook_events_same_tenant_insert" on public.whatsapp_webhook_events;
create policy "whatsapp_webhook_events_same_tenant_insert"
on public.whatsapp_webhook_events
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "campaigns_same_tenant_select" on public.campaigns;
create policy "campaigns_same_tenant_select"
on public.campaigns
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "campaigns_same_tenant_insert" on public.campaigns;
create policy "campaigns_same_tenant_insert"
on public.campaigns
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "campaigns_same_tenant_update" on public.campaigns;
create policy "campaigns_same_tenant_update"
on public.campaigns
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "campaign_recipients_same_tenant_select" on public.campaign_recipients;
create policy "campaign_recipients_same_tenant_select"
on public.campaign_recipients
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "campaign_recipients_same_tenant_insert" on public.campaign_recipients;
create policy "campaign_recipients_same_tenant_insert"
on public.campaign_recipients
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "campaign_recipients_same_tenant_update" on public.campaign_recipients;
create policy "campaign_recipients_same_tenant_update"
on public.campaign_recipients
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "followup_rules_same_tenant_select" on public.followup_rules;
create policy "followup_rules_same_tenant_select"
on public.followup_rules
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "followup_rules_same_tenant_insert" on public.followup_rules;
create policy "followup_rules_same_tenant_insert"
on public.followup_rules
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "followup_rules_same_tenant_update" on public.followup_rules;
create policy "followup_rules_same_tenant_update"
on public.followup_rules
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "followup_jobs_same_tenant_select" on public.followup_jobs;
create policy "followup_jobs_same_tenant_select"
on public.followup_jobs
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "followup_jobs_same_tenant_insert" on public.followup_jobs;
create policy "followup_jobs_same_tenant_insert"
on public.followup_jobs
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "followup_jobs_same_tenant_update" on public.followup_jobs;
create policy "followup_jobs_same_tenant_update"
on public.followup_jobs
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));
