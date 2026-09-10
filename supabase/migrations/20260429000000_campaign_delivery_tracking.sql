-- Track WhatsApp delivery receipts at the campaign level.
-- delivered_count = messages confirmed received by the device
-- read_count      = messages opened/read by the recipient
--
-- These are updated by refreshCampaignStats(), which is called by the
-- dispatcher after every send and by the webhook on MESSAGES_UPDATE.

alter table public.campaigns
  add column if not exists delivered_count integer not null default 0,
  add column if not exists read_count      integer not null default 0;

-- Index to make the delivery-count query fast
create index if not exists whatsapp_messages_campaign_status_idx
  on public.whatsapp_messages (campaign_id, status)
  where campaign_id is not null;
