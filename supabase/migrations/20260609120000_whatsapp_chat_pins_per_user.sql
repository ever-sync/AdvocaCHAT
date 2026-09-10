-- Fixar conversa passa a ser preferência por usuário (não global no chat).

CREATE TABLE IF NOT EXISTS public.whatsapp_chat_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_pins_profile
  ON public.whatsapp_chat_pins (tenant_id, profile_id, pinned_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_pins_chat
  ON public.whatsapp_chat_pins (chat_id);

ALTER TABLE public.whatsapp_chat_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_chat_pins_select_own" ON public.whatsapp_chat_pins;
CREATE POLICY "whatsapp_chat_pins_select_own"
ON public.whatsapp_chat_pins
FOR SELECT
USING (
  profile_id = auth.uid()
  AND public.is_same_tenant(tenant_id)
);

-- Criar versão dummy da função para evitar erro de dependência antes da tabela whatsapp_instance_attendants existir
CREATE OR REPLACE FUNCTION public.is_instance_attendant(p_instance_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT false;
$$;

GRANT EXECUTE ON FUNCTION public.is_instance_attendant(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "whatsapp_chat_pins_insert_own" ON public.whatsapp_chat_pins;
CREATE POLICY "whatsapp_chat_pins_insert_own"
ON public.whatsapp_chat_pins
FOR INSERT
WITH CHECK (
  profile_id = auth.uid()
  AND public.is_same_tenant(tenant_id)
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_chats wc
    WHERE wc.id = chat_id
      AND wc.tenant_id = tenant_id
      AND public.is_same_tenant(wc.tenant_id)
      AND (
        public.current_user_role() != 'atendimento'
        OR wc.assignee_id = auth.uid()
        OR (wc.assignee_id IS NULL AND public.is_instance_attendant(wc.instance_id))
      )
  )
);

DROP POLICY IF EXISTS "whatsapp_chat_pins_delete_own" ON public.whatsapp_chat_pins;
CREATE POLICY "whatsapp_chat_pins_delete_own"
ON public.whatsapp_chat_pins
FOR DELETE
USING (
  profile_id = auth.uid()
  AND public.is_same_tenant(tenant_id)
);

-- Coluna global legada: não há como atribuir pins antigos a um usuário.
DROP INDEX IF EXISTS public.idx_whatsapp_chats_is_pinned;
ALTER TABLE public.whatsapp_chats DROP COLUMN IF EXISTS is_pinned;
