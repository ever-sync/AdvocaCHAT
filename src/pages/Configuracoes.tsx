import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CreditCard,
  Loader2,
  Mail,
  MessageSquare,
  Eye,
  Pencil,
  Plus,
  Settings,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useToast } from "@/hooks/use-toast";
import { ApiKeysSettingsCard } from "@/components/settings/ApiKeysSettingsCard";
import {
  useCollaboratorInvites,
  useInviteCollaborator,
  useMyProfile,
  useDeleteCollaboratorInvite,
  useRevokeCollaboratorInvite,
  useTenantCollaborators,
  useUpdateCollaboratorAccess,
  useUpdateMyProfile,
} from "@/lib/api/settings";
import {
  useDeleteTenantCrmFunnelConfig,
  useTenantCrmFunnelConfig,
  useUpsertTenantCrmFunnelConfig,
} from "@/lib/api/crm-funnel-config";
import { PlatformLogSection } from "@/components/settings/PlatformLogSection";
import { AuditLogSection } from "@/components/settings/AuditLogSection";
import { WebhooksSettingsSection } from "@/components/settings/WebhooksSettingsSection";
import { AdsSettings } from "@/components/settings/AdsSettings";
import { TeamsSettingsSection } from "@/components/settings/TeamsSettingsSection";
import { TwoFactorSettingsCard } from "@/components/settings/TwoFactorSettingsCard";
import { BaileysChannelWizardDialog } from "@/components/settings/BaileysChannelWizardDialog";
import { BillingSettingsCard } from "@/components/settings/BillingSettingsCard";
import { usePlatformAdminAccess } from "@/lib/api/platform-admin";
import { useTenantBillingSnapshot } from "@/lib/api/billing";
import {
  usePlatformTenantContext,
  usePlatformTenants,
} from "@/lib/api/platform-tenant-context";
import { getCurrentTenantId } from "@/lib/api/tenant";
import {
  useDeleteWhatsappInstance,
  useSyncWhatsappInstances,
  useWhatsappInstances,
} from "@/lib/api/whatsapp";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { CrmFunnelConfigEditor } from "@/components/crm/CrmFunnelConfigEditor";
import {
  applyPendingFunnelMigrations,
  countCrmNegotiationsByFunnelId,
  countCrmNegotiationsByFunnelStage,
} from "@/lib/api/crm-funnel-migration";
import { validateFunnelsDraft } from "@/lib/crm/funnel-editor-utils";
import type { CrmFunnel } from "@/data/crm-funnels";
import { DEFAULT_CRM_FUNNELS, parseTenantCrmFunnelsJson } from "@/data/crm-funnels";
import {
  buildUnresolvedConfigRemovals,
  type PendingFunnelMigration,
} from "@/lib/crm/funnel-migration";
import {
  useCreateQuickReply,
  useDeleteQuickReply,
  useQuickReplies,
  useUpdateQuickReply,
} from "@/lib/api/quick-replies";
import {
  useTenantIntegrations,
  useTenantSettings,
  useUpsertTenantIntegrations,
  useUpsertTenantSettings,
} from "@/lib/api/integrations";
import { formatCnpj } from "@/lib/brasil-api";
import { RolePermissionsMatrix } from "@/components/settings/RolePermissionsMatrix";
import { ChatBusinessHoursSettingsSection } from "@/components/settings/ChatBusinessHoursSettingsSection";
import { InstanceAttendantsDialog } from "@/components/settings/InstanceAttendantsDialog";
import { InstanceDetailsDialog } from "@/components/settings/InstanceDetailsDialog";
import { InstanceEditDialog } from "@/components/settings/InstanceEditDialog";
import { useInstanceAttendantCounts } from "@/lib/api/instance-attendants";
import { ChatTagsSettingsSection } from "@/components/settings/ChatTagsSettingsSection";
import { ChatTaskTemplatesSettingsSection } from "@/components/settings/ChatTaskTemplatesSettingsSection";
import {
  ChatConfigSectionNav,
  parseChatConfigSectionParam,
  type ChatConfigSettingsSection,
} from "@/components/settings/ChatConfigSectionNav";
import {
  CollaboratorsSectionNav,
  parseCollaboratorsSectionParam,
  type CollaboratorsSettingsSection,
} from "@/components/settings/CollaboratorsSectionNav";
import {
  IntegrationsSectionNav,
  parseIntegrationsSectionParam,
  type IntegrationsSettingsSection,
} from "@/components/settings/IntegrationsSectionNav";
import { ChannelsHubSection } from "@/components/settings/ChannelsHubSection";
import type { ProfileSettings, QuickReply, QuickReplyScope, UserRole, WhatsappInstance } from "@/types/domain";
import { ROLE_LABELS } from "@/lib/permissions/role-permissions";

const statusStyles = {
  connected: "bg-success/20 text-success",
  connecting: "bg-warning/20 text-warning",
  disconnected: "bg-muted text-muted-foreground",
  error: "bg-destructive/20 text-destructive",
};


const SETTINGS_TAB_VALUES = [
  "perfil",
  "plano",
  "integracoes",
  "colaboradores",
  "funis",
  "configuracao-chat",
  "log",
  "auditoria",
] as const;
type SettingsTab = (typeof SETTINGS_TAB_VALUES)[number];

function parseSettingsTabParam(raw: string | null): SettingsTab {
  if (raw && (SETTINGS_TAB_VALUES as readonly string[]).includes(raw)) {
    return raw as SettingsTab;
  }
  return "perfil";
}

export default function Configuracoes() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { can } = useRolePermissions();
  const platformAdminAccess = usePlatformAdminAccess({ enabled: Boolean(profile?.id) });
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => parseSettingsTabParam(searchParams.get("aba")));
  const [collaboratorsSection, setCollaboratorsSection] = useState<CollaboratorsSettingsSection>(() =>
    parseCollaboratorsSectionParam(searchParams.get("secao")),
  );
  const [integrationsSection, setIntegrationsSection] = useState<IntegrationsSettingsSection>(() =>
    parseIntegrationsSectionParam(searchParams.get("secao")),
  );
  const [attendantsInstance, setAttendantsInstance] = useState<{ id: string; displayName: string } | null>(null);
  const [viewInstance, setViewInstance] = useState<WhatsappInstance | null>(null);
  const [editInstance, setEditInstance] = useState<WhatsappInstance | null>(null);
  const [chatConfigSection, setChatConfigSection] = useState<ChatConfigSettingsSection>(() =>
    parseChatConfigSectionParam(searchParams.get("secao")),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileCompany, setProfileCompany] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("operacao");
  const [collaboratorEditOpen, setCollaboratorEditOpen] = useState(false);
  const [collaboratorEditing, setCollaboratorEditing] = useState<ProfileSettings | null>(null);
  const [collaboratorEditName, setCollaboratorEditName] = useState("");
  const [collaboratorEditRole, setCollaboratorEditRole] = useState<UserRole>("operacao");
  const [collaboratorEditStatus, setCollaboratorEditStatus] = useState<"active" | "inactive">("active");
  const [collaboratorEditPassword, setCollaboratorEditPassword] = useState("");
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);
  const [funnelDraft, setFunnelDraft] = useState<CrmFunnel[]>(DEFAULT_CRM_FUNNELS);
  const [funnelJsonDraft, setFunnelJsonDraft] = useState("");
  const [funnelJsonOpen, setFunnelJsonOpen] = useState(false);
  const [pendingFunnelMigrations, setPendingFunnelMigrations] = useState<PendingFunnelMigration[]>(
    [],
  );
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrEditingId, setQrEditingId] = useState<string | null>(null);
  const [qrTitle, setQrTitle] = useState("");
  const [qrShortcut, setQrShortcut] = useState("");
  const [qrBodyText, setQrBodyText] = useState("");
  const [qrScope, setQrScope] = useState<QuickReplyScope>("global");
  const [sessionStatus, setSessionStatus] = useState<"valid" | "invalid" | "missing">("missing");
  const [sessionHint, setSessionHint] = useState("");
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const canUseAuthenticatedActions = !diagnosticsLoading && sessionStatus === "valid";
  const canViewCollaborators = can("colaboradores", "view");
  const isAdmin = profile?.role === "admin";
  const isPlatformAdmin = platformAdminAccess.data?.isPlatformAdmin ?? false;
  const platformTenantContext = usePlatformTenantContext({
    enabled: isPlatformAdmin && canUseAuthenticatedActions,
  });
  const platformTenants = usePlatformTenants({
    enabled: isPlatformAdmin && canUseAuthenticatedActions,
  });
  const billingSnapshot = useTenantBillingSnapshot({
    enabled: tab === "perfil" && canUseAuthenticatedActions,
  });
  const canManageCollaborators = isAdmin || isPlatformAdmin;
  const canEditConfiguracoes = can("configuracoes", "edit");
  const canDeleteConfiguracoes = can("configuracoes", "delete");
  const canEditCollaborators = can("colaboradores", "edit");
  const canDeleteCollaborators = can("colaboradores", "delete");
  const updateCollaboratorAccess = useUpdateCollaboratorAccess();

  const generateCollaboratorPassword = useCallback(() => {
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => charset[byte % charset.length]).join("");
  }, []);

  const openCollaboratorEditor = useCallback((member: ProfileSettings) => {
    setCollaboratorEditing(member);
    setCollaboratorEditName(member.nome || member.email);
    setCollaboratorEditRole(member.role);
    setCollaboratorEditStatus(member.status);
    setCollaboratorEditPassword(generateCollaboratorPassword());
    setCollaboratorEditOpen(true);
  }, [generateCollaboratorPassword]);

  const closeCollaboratorEditor = useCallback(() => {
    setCollaboratorEditOpen(false);
    setCollaboratorEditing(null);
    setCollaboratorEditName("");
    setCollaboratorEditRole("operacao");
    setCollaboratorEditStatus("active");
    setCollaboratorEditPassword("");
  }, []);

  const saveCollaboratorEdit = useCallback(async () => {
    if (!collaboratorEditing) {
      return;
    }

    if (!canManageCollaborators) {
      toast({
        title: "Ação indisponível",
        description: "Somente administradores podem editar colaboradores.",
        variant: "destructive",
      });
      return;
    }

    const name = collaboratorEditName.trim();
    if (!name) {
      toast({
        title: "Nome obrigatório",
        description: "Informe o nome do colaborador.",
        variant: "destructive",
      });
      return;
    }

    if (collaboratorEditPassword.trim().length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A nova senha precisa ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateCollaboratorAccess.mutateAsync({
        profileId: collaboratorEditing.id,
        nome: name,
        role: collaboratorEditRole,
        status: collaboratorEditStatus,
        newPassword: collaboratorEditPassword.trim(),
      });
      toast({
        title: "Colaborador atualizado",
        description: `${name} teve os dados e a senha atualizados.`,
      });
      closeCollaboratorEditor();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Tente novamente em instantes.";
      toast({
        title: "Nao foi possivel atualizar o colaborador",
        description,
        variant: "destructive",
      });
    }
  }, [
    canManageCollaborators,
    closeCollaboratorEditor,
    collaboratorEditName,
    collaboratorEditPassword,
    collaboratorEditRole,
    collaboratorEditStatus,
    collaboratorEditing,
    toast,
    updateCollaboratorAccess,
  ]);

  const abaKey = searchParams.get("aba");
  const secaoKey = searchParams.get("secao");
  useEffect(() => {
    setTab(parseSettingsTabParam(abaKey));
  }, [abaKey]);

  useEffect(() => {
    const currentTab = parseSettingsTabParam(abaKey);
    if (currentTab === "colaboradores") {
      setCollaboratorsSection(parseCollaboratorsSectionParam(secaoKey));
    } else if (currentTab === "integracoes") {
      setIntegrationsSection(parseIntegrationsSectionParam(secaoKey));
    } else if (currentTab === "configuracao-chat") {
      setChatConfigSection(parseChatConfigSectionParam(secaoKey));
    }
  }, [abaKey, secaoKey]);

  const handleIntegrationsSectionChange = useCallback(
    (section: IntegrationsSettingsSection) => {
      setIntegrationsSection(section);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("aba", "integracoes");
          if (section === "whatsapp") {
            p.delete("secao");
          } else {
            p.set("secao", section);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleChatConfigSectionChange = useCallback(
    (section: ChatConfigSettingsSection) => {
      setChatConfigSection(section);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("aba", "configuracao-chat");
          if (section === "respostas") {
            p.delete("secao");
          } else {
            p.set("secao", section);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleCollaboratorsSectionChange = useCallback(
    (section: CollaboratorsSettingsSection) => {
      setCollaboratorsSection(section);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("aba", "colaboradores");
          if (section === "usuarios") {
            p.delete("secao");
          } else {
            p.set("secao", section);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleTabChange = useCallback((value: string) => {
    const next = parseSettingsTabParam(value);
    setTab(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "perfil") {
          p.delete("aba");
          p.delete("secao");
        } else {
          p.set("aba", next);
          const secao = p.get("secao");
          if (next === "colaboradores") {
            if (secao !== "usuarios" && secao !== "permissoes" && secao !== "fila") {
              p.delete("secao");
            }
          } else if (next === "integracoes") {
            if (
              secao !== "whatsapp" &&
              secao !== "automacao" &&
              secao !== "ads" &&
              secao !== "webhooks"
            ) {
              p.delete("secao");
            }
          } else if (next === "configuracao-chat") {
            if (secao !== "respostas" && secao !== "etiquetas" && secao !== "tarefas") {
              p.delete("secao");
            }
          } else if (next === "log") {
            p.delete("secao");
          } else {
            p.delete("secao");
          }
        }
        return p;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  useEffect(() => {
    if (tab === "colaboradores" && !canViewCollaborators) {
      handleTabChange("perfil");
    }
  }, [canViewCollaborators, handleTabChange, tab]);

  const { data: myProfile } = useMyProfile({ enabled: tab !== "integracoes" && canUseAuthenticatedActions });
  const { data: savedCrmFunnels, isLoading: crmFunnelsLoading } = useTenantCrmFunnelConfig({
    enabled: tab === "funis" && canUseAuthenticatedActions,
  });
  const upsertCrmFunnels = useUpsertTenantCrmFunnelConfig();
  const deleteCrmFunnels = useDeleteTenantCrmFunnelConfig();
  const { data: quickRepliesList = [] } = useQuickReplies();
  const createQR = useCreateQuickReply();
  const updateQR = useUpdateQuickReply();
  const deleteQR = useDeleteQuickReply();
  const { data: collaborators = [] } = useTenantCollaborators({ enabled: tab === "colaboradores" && canUseAuthenticatedActions });
  const { data: invites = [] } = useCollaboratorInvites({ enabled: tab === "colaboradores" && canUseAuthenticatedActions });
  const updateProfile = useUpdateMyProfile();
  const inviteCollaborator = useInviteCollaborator();
  const revokeInvite = useRevokeCollaboratorInvite();
  const deleteInvite = useDeleteCollaboratorInvite();
  const { data: instances = [], isLoading, error } = useWhatsappInstances({ enabled: tab === "integracoes" && canUseAuthenticatedActions });
  const { data: attendantCounts } = useInstanceAttendantCounts({ enabled: tab === "integracoes" && canUseAuthenticatedActions });
  const { data: tenantIntegrations } = useTenantIntegrations();
  const { data: tenantSettings } = useTenantSettings();
  const upsertIntegrations = useUpsertTenantIntegrations();
  const upsertSettings = useUpsertTenantSettings();
  const [n8nUrl, setN8nUrl] = useState("");
  const [n8nSecret, setN8nSecret] = useState("");
  const [n8nEnabled, setN8nEnabled] = useState(false);
  const [autoAssignLead, setAutoAssignLead] = useState(false);
  const [autoAssignNewDeals, setAutoAssignNewDeals] = useState(false);
  const [defaultAiMode, setDefaultAiMode] = useState<"off" | "qualifying" | "full" | "handoff">("off");
  const [staleNegotiationDays, setStaleNegotiationDays] = useState(7);

  useEffect(() => {
    if (tenantIntegrations) {
      setN8nUrl(tenantIntegrations.n8nWebhookUrl ?? "");
      setN8nSecret(tenantIntegrations.n8nSecret ?? "");
      setN8nEnabled(tenantIntegrations.n8nEnabled);
    }
  }, [tenantIntegrations]);

  useEffect(() => {
    if (tenantSettings) {
      setAutoAssignLead(tenantSettings.autoAssignOnLead);
      setAutoAssignNewDeals(tenantSettings.autoAssignNewDeals);
      setDefaultAiMode(tenantSettings.defaultAiMode);
      setStaleNegotiationDays(tenantSettings.staleNegotiationDays);
    }
  }, [tenantSettings]);
  const syncInstances = useSyncWhatsappInstances({
    onSuccess: (_data, variables) => {
      const descricao = variables?.instanceId
        ? "Esta instancia foi sincronizada na Baileys."
        : "Todas as instancias foram sincronizadas na Baileys.";
      toast({ title: "Sincronizacao concluida", description: descricao });
      useAppStore.getState().addNotification({
        tipo: "sucesso",
        titulo: "Sincronizacao concluida",
        descricao,
      });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast({ title: "Falha na sincronizacao", description: msg, variant: "destructive" });
      useAppStore.getState().addNotification({
        tipo: "erro",
        titulo: "Falha na sincronizacao",
        descricao: msg,
      });
    },
  });
  const deleteInstance = useDeleteWhatsappInstance();

  const metrics = useMemo(() => ({
    activeInstances: instances.filter((item) => item.status === "connected").length,
    totalInstances: instances.length,
  }), [instances]);

  useEffect(() => {
    if (!myProfile) return;
    setProfileName(myProfile.nome);
    setProfileCompany(myProfile.empresa);
    setProfilePhone(myProfile.callPhone ?? "");
  }, [myProfile]);

  const selectedTenantId = platformTenantContext.data?.selected_tenant_id ?? null;
  const activeTenantId = platformTenantContext.data?.current_tenant_id ?? tenantId;
  const activePlatformTenant = platformTenants.data?.find((item) => item.tenant_id === activeTenantId) ?? null;
  const isViewingAnotherTenant = Boolean(isPlatformAdmin && selectedTenantId);
  const displayedCompany = activePlatformTenant?.nome ?? profileCompany;
  const displayedCnpj = activePlatformTenant?.cnpj ?? myProfile?.cnpj ?? null;
  const displayedPlan = billingSnapshot.data?.subscription?.plan.name ?? myProfile?.plano ?? profile?.plano ?? "starter";

  useEffect(() => {
    if (tab !== "funis") {
      return;
    }
    if (crmFunnelsLoading) {
      return;
    }
    const effective = savedCrmFunnels ?? DEFAULT_CRM_FUNNELS;
    setFunnelDraft(structuredClone(effective));
    setFunnelJsonDraft(JSON.stringify(effective, null, 2));
    setPendingFunnelMigrations([]);
  }, [crmFunnelsLoading, savedCrmFunnels, tab]);

  const syncFunnelDraftToJson = (next: CrmFunnel[]) => {
    setFunnelDraft(next);
    setFunnelJsonDraft(JSON.stringify(next, null, 2));
  };

  const saveFunnelConfig = async (funnels: CrmFunnel[]) => {
    const draftError = validateFunnelsDraft(funnels);
    if (draftError) {
      toast({
        title: "Configuração incompleta",
        description: draftError,
        variant: "destructive",
      });
      return;
    }
    const valid = parseTenantCrmFunnelsJson(funnels);
    if (!valid) {
      toast({
        title: "Formato inválido",
        description: "Cada funil precisa de id, listName e stages não vazios.",
        variant: "destructive",
      });
      return;
    }

    const baseline = savedCrmFunnels ?? DEFAULT_CRM_FUNNELS;
    const autoMigrations: PendingFunnelMigration[] = [];
    const removals = buildUnresolvedConfigRemovals(baseline, valid);

    for (const removal of removals) {
      if (removal.kind === "funnel_rename") {
        autoMigrations.push({
          kind: "funnel_rename",
          fromFunnelId: removal.from,
          toFunnelId: removal.to,
        });
        continue;
      }
      if (removal.kind === "funnel") {
        const covered = pendingFunnelMigrations.some(
          (m) =>
            (m.kind === "funnel" && m.fromFunnelId === removal.funnelId) ||
            (m.kind === "funnel_stage" && m.fromFunnelId === removal.funnelId) ||
            (m.kind === "funnel_clear" && m.fromFunnelId === removal.funnelId),
        );
        if (covered) {
          continue;
        }
        if (isSupabaseConfigured) {
          const count = await countCrmNegotiationsByFunnelId(removal.funnelId);
          if (count > 0) {
            toast({
              title: "Funil com negociações",
              description: `O funil removido ainda tem ${count} negociação(ões). Use "Excluir funil" no editor visual para migrar antes de salvar.`,
              variant: "destructive",
            });
            return;
          }
        }
        continue;
      }
      const covered = pendingFunnelMigrations.some(
        (m) =>
          m.kind === "stage" &&
          m.funnelId === removal.funnelId &&
          m.fromStageId === removal.stageId,
      );
      if (covered) {
        continue;
      }
      if (isSupabaseConfigured) {
        const count = await countCrmNegotiationsByFunnelStage(removal.funnelId, removal.stageId);
        if (count > 0) {
          toast({
            title: "Etapa com negociações",
            description: `A etapa removida ainda tem ${count} negociação(ões). Exclua a etapa pelo editor visual e escolha o destino da migração.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    const allMigrations = [...pendingFunnelMigrations, ...autoMigrations];
    if (allMigrations.length > 0 && isSupabaseConfigured) {
      const { negotiationsUpdated, customersAligned } =
        await applyPendingFunnelMigrations(allMigrations);
      if (negotiationsUpdated > 0 || customersAligned > 0) {
        toast({
          title: "Negociações atualizadas",
          description: `${negotiationsUpdated} negociação(ões) e ${customersAligned} cliente(s) alinhados aos novos funis.`,
        });
      }
    }

    await upsertCrmFunnels.mutateAsync(valid);
    syncFunnelDraftToJson(valid);
    setPendingFunnelMigrations([]);
    toast({
      title: "Funis salvos",
      description: "O quadro CRM vai usar esta definição.",
    });
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDiagnosticsLoading(true);
      try {
        if (!supabase) {
          if (!cancelled) {
            setSessionStatus("missing");
            setSessionHint("Supabase nao esta disponivel.");
          }
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) {
            setSessionStatus("missing");
            setSessionHint("Nenhuma sessao ativa encontrada.");
            setTenantId(null);
          }
          return;
        }
        const userResult = await supabase.auth.getUser(session.access_token);
        if (userResult.error || !userResult.data.user) {
          if (!cancelled) {
            setSessionStatus("invalid");
            setSessionHint("Sessao invalida. Faca logout e login novamente.");
            setTenantId(null);
          }
          return;
        }
        const nextTenantId = await getCurrentTenantId();
        if (!cancelled) {
          setSessionStatus("valid");
          setSessionHint("Sessao pronta para chamar as Edge Functions.");
          setTenantId(nextTenantId);
        }
      } catch (e) {
        if (!cancelled) {
          setSessionStatus("invalid");
          setSessionHint(e instanceof Error ? e.message : "Nao foi possivel validar a sessao.");
          setTenantId(null);
        }
      } finally {
        if (!cancelled) setDiagnosticsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const collaboratorMetrics = {
    active: collaborators.filter((item) => item.status === "active").length,
    admins: collaborators.filter((item) => item.role === "admin").length,
    pending: invites.filter((item) => item.status === "pending").length,
  };

  return (
    <PageShell contentClassName="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuracoes</h1>
          <p className="text-sm text-muted-foreground">Perfil, integracoes, funis do CRM e acessos do tenant.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-secondary text-secondary-foreground">
            {myProfile ? ROLE_LABELS[myProfile.role] : "Conta"}
          </Badge>
          <Badge className="bg-accent/15 text-accent">
            {tenantId ? "Tenant conectado" : "Tenant pendente"}
          </Badge>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start rounded-2xl border border-border/60 bg-card/80 p-1">
          <TabsTrigger value="perfil"><UserCog className="mr-2 h-4 w-4" />Perfil</TabsTrigger>
          <TabsTrigger value="plano"><CreditCard className="mr-2 h-4 w-4" />Plano</TabsTrigger>
          <TabsTrigger value="integracoes"><MessageSquare className="mr-2 h-4 w-4" />Integracoes</TabsTrigger>
          {canViewCollaborators ? (
            <TabsTrigger value="colaboradores">
              <Users className="mr-2 h-4 w-4" />
              Colaboradores
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="funis"><BarChart3 className="mr-2 h-4 w-4" />Funis CRM</TabsTrigger>
          <TabsTrigger value="configuracao-chat"><MessageSquare className="mr-2 h-4 w-4" />Configuracao do chat</TabsTrigger>
          <TabsTrigger value="log"><BookOpen className="mr-2 h-4 w-4" />Log da plataforma</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="auditoria"><ShieldCheck className="mr-2 h-4 w-4" />Auditoria</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="perfil" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">Meu perfil</CardTitle>
              <CardDescription>Edite seus dados pessoais de acesso. A empresa abaixo acompanha o tenant ativo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isViewingAnotherTenant ? (
                <div className="flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Modo SUPERADMIN em {displayedCompany}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Você está operando nesta empresa. Nome, email e telefone continuam sendo os seus dados pessoais.
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={myProfile?.email ?? profile?.email ?? ""} disabled />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Empresa ativa</Label>
                  <Input value={displayedCompany} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Plano da empresa ativa</Label>
                  <Input value={displayedPlan} disabled />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Telefone para ligações</Label>
                  <Input
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="+55 11 99999-9999"
                    inputMode="tel"
                  />
                  <p className="text-xs text-muted-foreground">
                    Usado no click-to-call: ligamos para você primeiro, depois conectamos o lead. Formato E.164 (ex.: +5511999998888).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input
                    value={displayedCnpj ? formatCnpj(displayedCnpj) : ""}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    CNPJ da empresa ativa. Não pode ser alterado nesta tela.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={
                    updateProfile.isPending ||
                    !profileName.trim() ||
                    !canUseAuthenticatedActions ||
                    !canEditConfiguracoes
                  }
                  onClick={async () => {
                    if (!canEditConfiguracoes) {
                      toast({
                        title: "Ação indisponível",
                        description: "Seu papel nao tem permissao para salvar o perfil.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (!canUseAuthenticatedActions) {
                      toast({
                        title: "Sessao indisponivel",
                        description: "Faca login novamente antes de salvar o perfil.",
                        variant: "destructive",
                      });
                      useAppStore.getState().addNotification({
                        tipo: "erro",
                        titulo: "Sessao indisponivel",
                        descricao: "Faca login novamente antes de salvar o perfil.",
                      });
                      return;
                    }

                    try {
                      await updateProfile.mutateAsync({
                        nome: profileName,
                        empresa: myProfile?.empresa ?? profileCompany,
                        callPhone: profilePhone,
                      });
                      toast({ title: "Perfil atualizado", description: "Dados salvos com sucesso." });
                      useAppStore.getState().addNotification({
                        tipo: "sucesso",
                        titulo: "Perfil atualizado",
                        descricao: "Dados salvos com sucesso.",
                      });
                    } catch (e) {
                      const desc = e instanceof Error ? e.message : "Tente novamente.";
                      toast({ title: "Erro ao salvar", description: desc, variant: "destructive" });
                      useAppStore.getState().addNotification({
                        tipo: "erro",
                        titulo: "Erro ao salvar",
                        descricao: desc,
                      });
                    }
                  }}
                >
                  {updateProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Salvar meus dados
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">Resumo da conta</CardTitle>
              <CardDescription>Visao rapida da sessao e do tenant atual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Cargo</p>
                <p className="mt-2 text-sm font-medium text-foreground">{myProfile ? ROLE_LABELS[myProfile.role] : "Carregando..."}</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tenant</p>
                <p className="mt-2 break-all text-sm font-medium text-foreground">{diagnosticsLoading ? "Validando..." : tenantId ?? "Nao encontrado"}</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sessao Supabase</p>
                <div className="mt-2">
                  <Badge className={sessionStatus === "valid" ? "bg-success/20 text-success" : sessionStatus === "missing" ? "bg-warning/20 text-warning" : "bg-destructive/20 text-destructive"}>
                    {diagnosticsLoading ? "Validando" : sessionStatus === "valid" ? "Valida" : sessionStatus === "missing" ? "Ausente" : "Invalida"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{sessionHint}</p>
              </div>
            </CardContent>
          </Card>

          <div className="xl:col-span-2">
            <TwoFactorSettingsCard />
          </div>
        </TabsContent>

        <TabsContent value="plano" className="space-y-6">
          <BillingSettingsCard />
        </TabsContent>

        <TabsContent value="integracoes" className="space-y-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <IntegrationsSectionNav
              value={integrationsSection}
              onChange={handleIntegrationsSectionChange}
            />
            <div className="min-w-0 flex-1 space-y-6">
              {integrationsSection === "canais" ? (
                <ChannelsHubSection
                  instances={instances}
                  isLoading={isLoading}
                  canEdit={canEditConfiguracoes}
                  onOpenWhatsapp={() => handleIntegrationsSectionChange("whatsapp")}
                />
              ) : null}

              {integrationsSection === "whatsapp" ? (
                <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">Integrações operacionais</h2>
              <p className="text-sm text-muted-foreground">Conecte instancias Baileys e acompanhe a operacao.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!canEditConfiguracoes) {
                    toast({
                      title: "Ação indisponível",
                      description: "Seu papel nao tem permissao para sincronizar instancias.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!canUseAuthenticatedActions) {
                    toast({
                      title: "Sessao indisponivel",
                      description: "Faca login novamente antes de sincronizar instancias.",
                      variant: "destructive",
                    });
                    useAppStore.getState().addNotification({
                      tipo: "erro",
                      titulo: "Sessao indisponivel",
                      descricao: "Faca login novamente antes de sincronizar instancias.",
                    });
                    return;
                  }

                  syncInstances.mutate({});
                }}
                disabled={syncInstances.isPending || !canUseAuthenticatedActions || !canEditConfiguracoes}
              >
                {syncInstances.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sincronizar tudo
              </Button>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={!canEditConfiguracoes}
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar novo canal
              </Button>
            </div>
          </div>

          <BaileysChannelWizardDialog
            open={dialogOpen && canEditConfiguracoes}
            onOpenChange={(open) => {
              if (!canEditConfiguracoes) {
                return;
              }
              setDialogOpen(open);
            }}
            canEdit={canEditConfiguracoes}
          />

          <div className="grid gap-4 md:grid-cols-2">
            {[{ label: "Instancias conectadas", value: metrics.activeInstances, icon: MessageSquare }, { label: "Instancias cadastradas", value: metrics.totalInstances, icon: ShieldCheck }].map((metric) => (
              <Card key={metric.label} className="border-border/60 bg-card/80">
                <CardContent className="flex items-center justify-between p-5">
                  <div><p className="text-xs text-muted-foreground">{metric.label}</p><p className="text-2xl font-bold text-foreground">{metric.value}</p></div>
                  <div className="rounded-xl bg-accent/10 p-3 text-accent"><metric.icon className="h-5 w-5" /></div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">Instancias WhatsApp</CardTitle>
              <CardDescription>Estados reais vindos da Baileys e do banco.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? <p className="text-sm text-muted-foreground">Carregando instancias...</p> : error ? <p className="text-sm text-destructive">{error.message}</p> : instances.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma instancia conectada ainda.</div>
              ) : instances.map((instance) => {
                return (
                  <div
                    key={instance.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold text-foreground">{instance.displayName}</h3>
                      <Badge className={statusStyles[instance.status]}>{instance.status === "connected" ? "Conectada" : instance.status === "connecting" ? "Conectando" : instance.status === "error" ? "Erro" : "Desconectada"}</Badge>
                      {instance.isDefault ? <Badge className="bg-accent text-accent-foreground">Padrao</Badge> : null}
                      {attendantCounts && (attendantCounts[instance.id] ?? 0) === 0 ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300"
                          title="Sem atendentes vinculados: os chats desta instância ficam visíveis só para gestores até você vincular atendentes (botão Configurações)."
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Sem atendentes
                        </Badge>
                      ) : null}
                      {instance.lastError ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" aria-label="Com erro">
                          <title>{instance.lastError}</title>
                        </AlertTriangle>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        title="Configurações"
                        aria-label="Configurações"
                        disabled={!canEditConfiguracoes}
                        onClick={() => {
                          if (!canEditConfiguracoes) {
                            toast({ title: "Ação indisponível", description: "Seu papel nao tem permissao para configurar atendentes.", variant: "destructive" });
                            return;
                          }
                          setAttendantsInstance({ id: instance.id, displayName: instance.displayName });
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        title="Sincronizar"
                        aria-label="Sincronizar"
                        disabled={syncInstances.isPending || !canUseAuthenticatedActions || !canEditConfiguracoes}
                        onClick={() => {
                          if (!canUseAuthenticatedActions) {
                            toast({ title: "Sessao indisponivel", description: "Faca login novamente antes de sincronizar esta instancia.", variant: "destructive" });
                            useAppStore.getState().addNotification({ tipo: "erro", titulo: "Sessao indisponivel", descricao: "Faca login novamente antes de sincronizar esta instancia." });
                            return;
                          }
                          if (!canEditConfiguracoes) {
                            toast({ title: "Ação indisponível", description: "Seu papel nao tem permissao para sincronizar instancias.", variant: "destructive" });
                            return;
                          }
                          syncInstances.mutate({ instanceId: instance.id });
                        }}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        title="Visualizar"
                        aria-label="Visualizar"
                        onClick={() => setViewInstance(instance)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        title="Editar"
                        aria-label="Editar"
                        disabled={!canEditConfiguracoes}
                        onClick={() => {
                          if (!canEditConfiguracoes) {
                            toast({ title: "Ação indisponível", description: "Seu papel nao tem permissao para editar instancias.", variant: "destructive" });
                            return;
                          }
                          setEditInstance(instance);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        title="Remover"
                        aria-label="Remover"
                        disabled={deleteInstance.isPending || !canUseAuthenticatedActions || !canEditConfiguracoes}
                        onClick={async () => {
                          if (!canUseAuthenticatedActions) {
                            toast({ title: "Sessao indisponivel", description: "Faca login novamente antes de remover uma instancia.", variant: "destructive" });
                            useAppStore.getState().addNotification({ tipo: "erro", titulo: "Sessao indisponivel", descricao: "Faca login novamente antes de remover uma instancia." });
                            return;
                          }
                          if (!canEditConfiguracoes) {
                            toast({ title: "Ação indisponível", description: "Seu papel nao tem permissao para remover uma instancia.", variant: "destructive" });
                            return;
                          }
                          await deleteInstance.mutateAsync(instance.id);
                          const archived = `${instance.displayName} saiu da operacao e as conversas ficaram arquivadas.`;
                          toast({ title: "Canal arquivado", description: archived });
                          useAppStore.getState().addNotification({ tipo: "aviso", titulo: "Canal arquivado", descricao: archived });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <InstanceAttendantsDialog
            instance={attendantsInstance}
            open={!!attendantsInstance}
            onOpenChange={(o) => {
              if (!o) setAttendantsInstance(null);
            }}
            canEdit={canEditConfiguracoes}
          />
          <InstanceDetailsDialog
            instance={viewInstance}
            open={!!viewInstance}
            onOpenChange={(o) => {
              if (!o) setViewInstance(null);
            }}
          />
          <InstanceEditDialog
            instance={editInstance}
            open={!!editInstance}
            onOpenChange={(o) => {
              if (!o) setEditInstance(null);
            }}
            canEdit={canEditConfiguracoes}
          />
                </>
              ) : null}

              {integrationsSection === "automacao" ? (
          <>
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">IA no n8n</CardTitle>
              <CardDescription className="space-y-2">
                <span className="block">
                  Webhook para o n8n responder leads no mesmo WhatsApp. Use a edge function{" "}
                  <code className="text-xs">n8n-reply</code> para enviar mensagens. A IA só é acionada
                  quando as regras de negócio permitem (sem atendente no chat, negócio sem responsável,
                  cliente sem opt-out, etc.). Para CRM e envios genéricos, use a API REST{" "}
                  <code className="text-xs">wchat-api</code>.
                </span>
                <Button variant="link" className="h-auto p-0 text-accent" asChild>
                  <Link to="/configuracoes/api-docs">
                    <BookOpen className="mr-1 inline h-3.5 w-3.5" />
                    Documentação Swagger (duas APIs)
                  </Link>
                </Button>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="n8n-enabled"
                  checked={n8nEnabled}
                  onChange={(e) => setN8nEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="n8n-enabled">Ativar integração n8n</Label>
              </div>
              <div className="space-y-2">
                <Label>URL do webhook n8n</Label>
                <Input value={n8nUrl} onChange={(e) => setN8nUrl(e.target.value)} placeholder="https://seu-n8n.com/webhook/..." />
              </div>
              <div className="space-y-2">
                <Label>Segredo (HMAC)</Label>
                <Input type="password" value={n8nSecret} onChange={(e) => setN8nSecret(e.target.value)} placeholder="shared-secret" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="auto-assign"
                    checked={autoAssignLead}
                    onChange={(e) => setAutoAssignLead(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="auto-assign">Distribuir chat automaticamente</Label>
                </div>
                <div className="flex items-center gap-2 md:col-span-2">
                  <input
                    type="checkbox"
                    id="auto-assign-new-deals"
                    checked={autoAssignNewDeals}
                    onChange={(e) => setAutoAssignNewDeals(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="auto-assign-new-deals" className="leading-snug">
                    Distribuir negociações novas do CRM automaticamente
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      (round-robin por menor carga + disponibilidade — deal sem responsável recebe um atendente no INSERT)
                    </span>
                  </Label>
                </div>
              </div>
              <div className="space-y-2 border-t border-border/60 pt-4">
                <Label htmlFor="stale-negotiation-days">Dias sem contato para alerta &quot;Parado&quot;</Label>
                <Input
                  id="stale-negotiation-days"
                  type="number"
                  min={1}
                  max={90}
                  value={staleNegotiationDays}
                  onChange={(e) => setStaleNegotiationDays(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Negócios em andamento sem interação há esse prazo exibem alerta no quadro CRM (1 a 90 dias).
                </p>
              </div>
              <div className="space-y-2">
                <Label>Modo IA padrão em novos chats</Label>
                <Select value={defaultAiMode} onValueChange={(v) => setDefaultAiMode(v as typeof defaultAiMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Desligado</SelectItem>
                    <SelectItem value="qualifying">Qualificação</SelectItem>
                    <SelectItem value="full">Completo</SelectItem>
                    <SelectItem value="handoff">Handoff (só humano)</SelectItem>
                  </SelectContent>
                </Select>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>
                    <strong>Qualificação:</strong> responde só em estágios iniciais (lead/contato) e
                    nunca se o negócio ou o chat já tiver responsável.
                  </li>
                  <li>
                    <strong>Completo:</strong> pode responder em qualquer estágio ativo, desde que não
                    haja humano no chat nem dono no CRM.
                  </li>
                  <li>
                    <strong>Handoff:</strong> não chama o n8n; use após transferir para vendedor.
                  </li>
                </ul>
              </div>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={!canUseAuthenticatedActions || upsertIntegrations.isPending || !canEditConfiguracoes}
                onClick={async () => {
                  if (!canEditConfiguracoes) {
                    toast({
                      title: "Ação indisponível",
                      description: "Seu papel nao tem permissao para salvar integrações.",
                      variant: "destructive",
                    });
                    return;
                  }
                  try {
                    await upsertIntegrations.mutateAsync({
                      n8nWebhookUrl: n8nUrl.trim() || null,
                      n8nSecret: n8nSecret.trim() || null,
                      n8nEnabled,
                    });
                    await upsertSettings.mutateAsync({
                      autoAssignOnLead: autoAssignLead,
                      autoAssignNewDeals,
                      defaultAiMode,
                      staleNegotiationDays,
                    });
                    toast({ title: "Integração salva", description: "Configurações de CRM e n8n atualizadas." });
                  } catch (e) {
                    toast({
                      title: "Erro",
                      description: e instanceof Error ? e.message : "Falha ao salvar",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Salvar IA e CRM
              </Button>
            </CardContent>
          </Card>

          <ApiKeysSettingsCard
            canEdit={canEditConfiguracoes}
            disabled={!canUseAuthenticatedActions}
          />
          </>
              ) : null}

              {integrationsSection === "ads" ? <AdsSettings /> : null}

              {integrationsSection === "webhooks" ? (
                <WebhooksSettingsSection canEdit={canEditConfiguracoes} />
              ) : null}
            </div>
          </div>
        </TabsContent>

        {canViewCollaborators ? (
          <TabsContent value="colaboradores" className="space-y-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <CollaboratorsSectionNav
                value={collaboratorsSection}
                onChange={handleCollaboratorsSectionChange}
              />
              <div className="min-w-0 flex-1 space-y-6">
                {collaboratorsSection === "permissoes" ? (
                  <RolePermissionsMatrix
                    canEdit={myProfile?.role === "admin"}
                    disabled={!canUseAuthenticatedActions}
                  />
                ) : null}

                {collaboratorsSection === "times" ? (
                  <TeamsSettingsSection canEdit={canEditCollaborators} />
                ) : null}

                {collaboratorsSection === "fila" ? (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Fila de atendimento</CardTitle>
                      <CardDescription>
                        Configure quem recebe conversas do pool, limites de carga e distribuição automática.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="secondary" asChild>
                        <Link to="/configuracoes/fila">Abrir configuração da fila</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}

                {collaboratorsSection === "usuarios" ? (
                  <Tabs defaultValue="equipe" className="space-y-6">
                    <TabsList className="h-auto flex-wrap justify-start rounded-2xl border border-border/60 bg-card/80 p-1">
                      <TabsTrigger value="equipe"><Users className="mr-2 h-4 w-4" />Equipe ativa</TabsTrigger>
                      <TabsTrigger value="criar"><Plus className="mr-2 h-4 w-4" />Criar acesso</TabsTrigger>
                      <TabsTrigger value="convites"><Mail className="mr-2 h-4 w-4" />Convites</TabsTrigger>
                    </TabsList>

                    <TabsContent value="equipe" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[{ label: "Colaboradores ativos", value: collaboratorMetrics.active, icon: Users }, { label: "Administradores", value: collaboratorMetrics.admins, icon: ShieldCheck }, { label: "Convites pendentes", value: collaboratorMetrics.pending, icon: Mail }].map((metric) => (
              <Card key={metric.label} className="border-border/60 bg-card/80"><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs text-muted-foreground">{metric.label}</p><p className="text-2xl font-bold text-foreground">{metric.value}</p></div><div className="rounded-xl bg-accent/10 p-3 text-accent"><metric.icon className="h-5 w-5" /></div></CardContent></Card>
            ))}
          </div>

          <Card className="border-border/60 bg-card/80">
            <CardHeader><CardTitle className="text-lg">Equipe ativa</CardTitle><CardDescription>Usuarios ja vinculados ao tenant.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {collaborators.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum colaborador ativo encontrado.</div> : collaborators.map((member) => {
                const isUpdatingCollaborator =
                  updateCollaboratorAccess.isPending &&
                  updateCollaboratorAccess.variables?.profileId === member.id;
                return (
                  <div key={member.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0"><p className="truncate font-medium text-foreground">{member.nome || member.email}</p><p className="truncate text-sm text-muted-foreground">{member.email}</p></div>
                    <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                      <Badge className="bg-secondary text-secondary-foreground">{ROLE_LABELS[member.role]}</Badge>
                      <Badge className="bg-success/20 text-success">{member.status === "active" ? "Ativo" : "Inativo"}</Badge>
                      {canManageCollaborators ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={isUpdatingCollaborator}
                          onClick={() => openCollaboratorEditor(member)}
                        >
                          {isUpdatingCollaborator ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                          Editar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Dialog
            open={collaboratorEditOpen}
            onOpenChange={(open) => {
              if (open) {
                setCollaboratorEditOpen(true);
                return;
              }
              closeCollaboratorEditor();
            }}
          >
            <DialogContent className="sm:max-w-[640px]">
              <DialogHeader>
                <DialogTitle>Editar colaborador</DialogTitle>
                <DialogDescription>
                  Atualize nome, papel, status e defina uma nova senha de acesso.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={collaboratorEditName}
                    onChange={(event) => setCollaboratorEditName(event.target.value)}
                    placeholder="Nome do colaborador"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={collaboratorEditing?.email ?? ""} disabled />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Papel</Label>
                    <Select value={collaboratorEditRole} onValueChange={(value) => setCollaboratorEditRole(value as UserRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="operacao">Operacao</SelectItem>
                        <SelectItem value="financeiro">Financeiro</SelectItem>
                        <SelectItem value="atendimento">Atendimento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={collaboratorEditStatus} onValueChange={(value) => setCollaboratorEditStatus(value as "active" | "inactive")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Nova senha</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => setCollaboratorEditPassword(generateCollaboratorPassword())}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Gerar senha
                    </Button>
                  </div>
                  <Input
                    value={collaboratorEditPassword}
                    onChange={(event) => setCollaboratorEditPassword(event.target.value)}
                    placeholder="Defina uma nova senha"
                  />
                  <p className="text-xs text-muted-foreground">
                    A nova senha entra em vigor imediatamente para o colaborador selecionado.
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeCollaboratorEditor}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={updateCollaboratorAccess.isPending || !collaboratorEditing}
                  onClick={saveCollaboratorEdit}
                >
                  {updateCollaboratorAccess.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                  Salvar alterações
                </Button>
              </div>
            </DialogContent>
          </Dialog>
                    </TabsContent>

                    <TabsContent value="criar" className="space-y-6">
            <Card className="border-border/60 bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg">Criar acesso de colaborador</CardTitle>
                <CardDescription>Convide por e-mail e defina o papel inicial.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Nome</Label><Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Maria da operacao" /></div>
                <div className="space-y-2"><Label>Email</Label><Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="maria@empresa.com.br" type="email" /></div>
                <div className="space-y-2">
                  <Label>Nivel de acesso</Label>
                  <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as UserRole)}>
                    <SelectTrigger><SelectValue placeholder="Selecione um papel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="operacao">Operacao</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                      <SelectItem value="atendimento">Atendimento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                  <Button
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={
                    inviteCollaborator.isPending ||
                    !canUseAuthenticatedActions ||
                    !canEditCollaborators ||
                    !inviteName.trim() ||
                    !inviteEmail.trim()
                  }
                  onClick={async () => {
                    if (!canEditCollaborators) {
                      toast({
                        title: "Ação indisponível",
                        description: "Seu papel nao tem permissao para criar acessos.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (!canUseAuthenticatedActions) {
                      toast({
                        title: "Sessao indisponivel",
                        description: "Faca login novamente antes de criar acessos.",
                        variant: "destructive",
                      });
                      useAppStore.getState().addNotification({
                        tipo: "erro",
                        titulo: "Sessao indisponivel",
                        descricao: "Faca login novamente antes de criar acessos.",
                      });
                      return;
                    }

                    try {
                      const result = await inviteCollaborator.mutateAsync({ nome: inviteName, email: inviteEmail, role: inviteRole });
                      const createdTitle = result.warning
                        ? "Convite salvo com aviso"
                        : result.emailSent
                          ? "E-mail de ativacao enviado"
                          : "Acesso criado";
                      const createdDesc =
                        result.warning ??
                        (result.emailSent
                          ? `Enviamos o link para ${result.invite.email}. Peça para checar spam e lixo eletronico.`
                          : "Convite registrado para o colaborador.");
                      toast({
                        title: createdTitle,
                        description: createdDesc,
                        variant: result.warning ? "destructive" : "default",
                      });
                      useAppStore.getState().addNotification({
                        tipo: result.warning ? "aviso" : "sucesso",
                        titulo: createdTitle,
                        descricao: createdDesc,
                      });
                      setInviteName(""); setInviteEmail(""); setInviteRole("operacao");
                    } catch (e) {
                      const desc = e instanceof Error ? e.message : "Tente novamente.";
                      toast({ title: "Nao foi possivel criar o acesso", description: desc, variant: "destructive" });
                      useAppStore.getState().addNotification({
                        tipo: "erro",
                        titulo: "Nao foi possivel criar o acesso",
                        descricao: desc,
                      });
                    }
                  }}
                >
                  {inviteCollaborator.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Criar acesso
                </Button>
                {!canEditCollaborators ? <p className="text-xs text-warning">Seu papel nao tem permissão para convidar colaboradores.</p> : null}
              </CardContent>
            </Card>
                    </TabsContent>

                    <TabsContent value="convites" className="space-y-6">
            <Card className="border-border/60 bg-card/80">
              <CardHeader><CardTitle className="text-lg">Convites e pendencias</CardTitle><CardDescription>Controle do que ainda nao foi aceito.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {invites.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Ainda nao existem convites registrados.</div> : invites.map((invite) => (
                    <div key={invite.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 md:flex-row md:items-center md:justify-between">
                      <div><p className="font-medium text-foreground">{invite.nome}</p><p className="text-sm text-muted-foreground">{invite.email}</p></div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-secondary text-secondary-foreground">{ROLE_LABELS[invite.role]}</Badge>
                        <Badge className={invite.status === "accepted" ? "bg-success/20 text-success" : invite.status === "revoked" ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"}>{invite.status === "accepted" ? "Aceito" : invite.status === "revoked" ? "Revogado" : "Pendente"}</Badge>
                        {invite.status === "pending" ? (
                          <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              resendingInviteId === invite.id ||
                              inviteCollaborator.isPending ||
                              !canUseAuthenticatedActions ||
                              !canEditCollaborators
                            }
                            onClick={async () => {
                              if (!canUseAuthenticatedActions) {
                                toast({
                                  title: "Sessao indisponivel",
                                  description: "Faca login novamente antes de reenviar convites.",
                                  variant: "destructive",
                                });
                                return;
                              }

                              setResendingInviteId(invite.id);
                              try {
                                const result = await inviteCollaborator.mutateAsync({
                                  nome: invite.nome,
                                  email: invite.email,
                                  role: invite.role,
                                  resend: true,
                                });
                                const resendTitle = result.warning
                                  ? "Nao foi possivel reenviar"
                                  : result.emailSent
                                    ? "E-mail reenviado"
                                    : "Convite atualizado";
                                const resendDesc =
                                  result.warning ??
                                  `Novo link enviado para ${invite.email}. Peça para checar spam.`;
                                toast({
                                  title: resendTitle,
                                  description: resendDesc,
                                  variant: result.warning ? "destructive" : "default",
                                });
                                useAppStore.getState().addNotification({
                                  tipo: result.warning ? "aviso" : "sucesso",
                                  titulo: resendTitle,
                                  descricao: resendDesc,
                                });
                              } catch (e) {
                                const desc = e instanceof Error ? e.message : "Tente novamente.";
                                toast({ title: "Nao foi possivel reenviar", description: desc, variant: "destructive" });
                              } finally {
                                setResendingInviteId(null);
                              }
                            }}
                          >
                            {resendingInviteId === invite.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Mail className="mr-1 h-3 w-3" />
                            )}
                            Reenviar e-mail
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={revokeInvite.isPending || !canUseAuthenticatedActions || !canEditCollaborators}
                            onClick={async () => {
                              if (!canEditCollaborators) {
                                toast({
                                  title: "Ação indisponível",
                                  description: "Seu papel nao tem permissao para revogar convites.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              if (!canUseAuthenticatedActions) {
                                toast({
                                  title: "Sessao indisponivel",
                                  description: "Faca login novamente antes de revogar convites.",
                                  variant: "destructive",
                                });
                                useAppStore.getState().addNotification({
                                  tipo: "erro",
                                  titulo: "Sessao indisponivel",
                                  descricao: "Faca login novamente antes de revogar convites.",
                                });
                                return;
                              }

                              try {
                                await revokeInvite.mutateAsync(invite.id);
                                const revoked = `${invite.email} foi marcado como revogado.`;
                                toast({ title: "Convite revogado", description: revoked });
                                useAppStore.getState().addNotification({
                                  tipo: "aviso",
                                  titulo: "Convite revogado",
                                  descricao: revoked,
                                });
                              } catch (e) {
                                const desc = e instanceof Error ? e.message : "Tente novamente.";
                                toast({ title: "Nao foi possivel revogar", description: desc, variant: "destructive" });
                                useAppStore.getState().addNotification({
                                  tipo: "erro",
                                  titulo: "Nao foi possivel revogar",
                                  descricao: desc,
                                });
                              }
                            }}
                          >
                            Revogar
                          </Button>
                          </>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={
                            deletingInviteId === invite.id ||
                            deleteInvite.isPending ||
                            !canUseAuthenticatedActions ||
                            !canDeleteCollaborators
                          }
                          onClick={async () => {
                            if (!canDeleteCollaborators) {
                              toast({
                                title: "Ação indisponível",
                                description: "Seu papel nao tem permissao para excluir convites.",
                                variant: "destructive",
                              });
                              return;
                            }
                            if (!canUseAuthenticatedActions) {
                              toast({
                                title: "Sessao indisponivel",
                                description: "Faca login novamente antes de excluir convites.",
                                variant: "destructive",
                              });
                              return;
                            }

                            setDeletingInviteId(invite.id);
                            try {
                              await deleteInvite.mutateAsync(invite.id);
                              const removed = `Convite de ${invite.email} removido.`;
                              toast({ title: "Convite excluido", description: removed });
                              useAppStore.getState().addNotification({
                                tipo: "sucesso",
                                titulo: "Convite excluido",
                                descricao: removed,
                              });
                            } catch (e) {
                              const desc = e instanceof Error ? e.message : "Tente novamente.";
                              toast({ title: "Nao foi possivel excluir", description: desc, variant: "destructive" });
                            } finally {
                              setDeletingInviteId(null);
                            }
                          }}
                        >
                          {deletingInviteId === invite.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1 h-3 w-3" />
                          )}
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
                    </TabsContent>
                  </Tabs>
                ) : null}
              </div>
            </div>
          </TabsContent>
        ) : null}

        <TabsContent value="funis" className="space-y-6">
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">Funis do CRM</CardTitle>
              <CardDescription>
                Crie e edite funis, etapas do Kanban e campos obrigatórios usados em <strong>/crm</strong>.
                Sem configuração salva, o app usa os funis padrão.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {crmFunnelsLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : (
                <>
                  <CrmFunnelConfigEditor
                    funnels={funnelDraft}
                    onChange={syncFunnelDraftToJson}
                    disabled={!canUseAuthenticatedActions || upsertCrmFunnels.isPending}
                    countNegotiationsByFunnel={
                      isSupabaseConfigured ? countCrmNegotiationsByFunnelId : undefined
                    }
                    countNegotiationsByStage={
                      isSupabaseConfigured ? countCrmNegotiationsByFunnelStage : undefined
                    }
                    pendingMigrations={pendingFunnelMigrations}
                    onPendingMigrationsChange={setPendingFunnelMigrations}
                  />

                  <Collapsible open={funnelJsonOpen} onOpenChange={setFunnelJsonOpen}>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground">
                        {funnelJsonOpen ? "Ocultar" : "Mostrar"} editor JSON avançado
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="crm-funnels-json">JSON dos funis (estrutura completa)</Label>
                        <Textarea
                          id="crm-funnels-json"
                          value={funnelJsonDraft}
                          onChange={(e) => setFunnelJsonDraft(e.target.value)}
                          className="min-h-[240px] font-mono text-xs"
                          spellCheck={false}
                          disabled={!canUseAuthenticatedActions}
                        />
                        <p className="text-xs text-muted-foreground">
                          Importação/exportação manual da configuração completa (útil para backup ou cópia entre
                          ambientes).
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={upsertCrmFunnels.isPending || !canUseAuthenticatedActions || !canEditConfiguracoes}
                      onClick={() => {
                        if (!canEditConfiguracoes) {
                          toast({
                            title: "Ação indisponível",
                            description: "Seu papel nao tem permissao para salvar funis.",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (!canUseAuthenticatedActions) {
                          toast({
                            title: "Sessão indisponível",
                            description: "Faça login novamente.",
                            variant: "destructive",
                          });
                          return;
                        }
                        void (async () => {
                          try {
                            if (funnelJsonOpen) {
                              let parsed: unknown;
                              try {
                                parsed = JSON.parse(funnelJsonDraft) as unknown;
                              } catch {
                                toast({
                                  title: "JSON inválido",
                                  description: "Verifique vírgulas e aspas.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              const valid = parseTenantCrmFunnelsJson(parsed);
                              if (!valid) {
                                toast({
                                  title: "Formato inválido",
                                  description: "Cada funil precisa de id, listName e stages não vazios.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              await saveFunnelConfig(valid);
                              return;
                            }
                            await saveFunnelConfig(funnelDraft);
                          } catch (e) {
                            toast({
                              title: "Não foi possível salvar",
                              description: e instanceof Error ? e.message : "Tente novamente.",
                              variant: "destructive",
                            });
                          }
                        })();
                      }}
                    >
                      {upsertCrmFunnels.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Salvar funis
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deleteCrmFunnels.isPending || !canUseAuthenticatedActions || !canDeleteConfiguracoes}
                      onClick={() => {
                        if (!canDeleteConfiguracoes) {
                          toast({
                            title: "Ação indisponível",
                            description: "Seu papel nao tem permissao para remover funis.",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (!canUseAuthenticatedActions) {
                          return;
                        }
                        void (async () => {
                          try {
                            await deleteCrmFunnels.mutateAsync();
                            syncFunnelDraftToJson(structuredClone(DEFAULT_CRM_FUNNELS));
                            toast({
                              title: "Funis padrao",
                              description: "Configuracao customizada removida. O CRM voltou ao padrao do sistema.",
                            });
                          } catch (e) {
                            toast({
                              title: "Nao foi possivel restaurar",
                              description: e instanceof Error ? e.message : "Tente novamente.",
                              variant: "destructive",
                            });
                          }
                        })();
                      }}
                    >
                      {deleteCrmFunnels.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Usar funis padrao
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Responsáveis no filtro do CRM vêm dos <button type="button" className="font-medium text-primary underline" onClick={() => handleTabChange("colaboradores")}>colaboradores ativos</button> deste tenant.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracao-chat" className="space-y-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <ChatConfigSectionNav value={chatConfigSection} onChange={handleChatConfigSectionChange} />
            <div className="min-w-0 flex-1 space-y-6">
              {chatConfigSection === "respostas" ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Respostas rapidas</CardTitle>
                        <CardDescription>
                          Mensagens pré-definidas acessíveis no chat pelo botão ⚡ ou digitando /.
                          Globais são visíveis a toda a equipe; Minhas são só suas.
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        className="rounded-xl"
                        disabled={!canEditConfiguracoes}
                        onClick={() => {
                          if (!canEditConfiguracoes) {
                            toast({
                              title: "Ação indisponível",
                              description: "Seu papel nao tem permissao para criar respostas rápidas.",
                              variant: "destructive",
                            });
                            return;
                          }
                          setQrEditingId(null);
                          setQrTitle("");
                          setQrShortcut("");
                          setQrBodyText("");
                          setQrScope("global");
                          setQrDialogOpen(true);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Nova resposta
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {quickRepliesList.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                        Nenhuma resposta cadastrada. Clique em "Nova resposta" para começar.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {quickRepliesList.map((qr) => (
                          <div
                            key={qr.id}
                            className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{qr.title}</span>
                                {qr.shortcut ? (
                                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                    /{qr.shortcut}
                                  </span>
                                ) : null}
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${qr.scope === "global" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"}`}>
                                  {qr.scope === "global" ? "Global" : "Minha"}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{qr.bodyText}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                disabled={!canEditConfiguracoes}
                                onClick={() => {
                                  if (!canEditConfiguracoes) {
                                    toast({
                                      title: "Ação indisponível",
                                      description: "Seu papel nao tem permissao para editar respostas rápidas.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  setQrEditingId(qr.id);
                                  setQrTitle(qr.title);
                                  setQrShortcut(qr.shortcut ?? "");
                                  setQrBodyText(qr.bodyText);
                                  setQrScope(qr.scope);
                                  setQrDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                                disabled={deleteQR.isPending || !canDeleteConfiguracoes}
                                onClick={() => {
                                  if (!canDeleteConfiguracoes) {
                                    toast({
                                      title: "Ação indisponível",
                                      description: "Seu papel nao tem permissao para excluir respostas rápidas.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  void deleteQR.mutateAsync(qr.id).then(() => {
                                    toast({ title: "Resposta removida" });
                                  }).catch((e: Error) => {
                                    toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
                                  });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {chatConfigSection === "etiquetas" ? (
                <ChatTagsSettingsSection
                  canEdit={canEditConfiguracoes}
                  canDelete={canDeleteConfiguracoes}
                />
              ) : null}

              {chatConfigSection === "tarefas" ? (
                <ChatTaskTemplatesSettingsSection
                  canEdit={canEditConfiguracoes}
                  canDelete={canDeleteConfiguracoes}
                />
              ) : null}

              {chatConfigSection === "horario" ? (
                <ChatBusinessHoursSettingsSection canEdit={canEditConfiguracoes} />
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="log" className="space-y-6">
          <PlatformLogSection />
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="auditoria" className="space-y-6">
            <AuditLogSection />
          </TabsContent>
        ) : null}
      </Tabs>

      {/* Dialog criar / editar resposta rápida */}
      <Dialog
        open={qrDialogOpen && canEditConfiguracoes}
        onOpenChange={(open) => {
          if (!canEditConfiguracoes) {
            setQrDialogOpen(false);
            return;
          }
          setQrDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{qrEditingId ? "Editar resposta" : "Nova resposta rápida"}</DialogTitle>
            <DialogDescription>
              O título é o nome que aparece na busca. O atalho (opcional) é ativado digitando /atalho no chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input
                  value={qrTitle}
                  onChange={(e) => setQrTitle(e.target.value)}
                  placeholder="Ex: Saudação inicial"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Atalho</Label>
                <div className="flex items-center rounded-md border border-input bg-background">
                  <span className="border-r px-2 text-sm text-muted-foreground">/</span>
                  <Input
                    value={qrShortcut}
                    onChange={(e) => setQrShortcut(e.target.value.replace(/\s/g, ""))}
                    placeholder="oi"
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem *</Label>
              <Textarea
                value={qrBodyText}
                onChange={(e) => setQrBodyText(e.target.value)}
                placeholder="Olá! Tudo bem? Em que posso ajudar?"
                className="min-h-[100px] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visibilidade</Label>
              <Select value={qrScope} onValueChange={(v) => setQrScope(v as QuickReplyScope)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global — visível para toda a equipe</SelectItem>
                  <SelectItem value="private">Minha — só eu vejo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setQrDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              disabled={!canEditConfiguracoes || !qrTitle.trim() || !qrBodyText.trim() || createQR.isPending || updateQR.isPending}
              onClick={() => {
                if (!canEditConfiguracoes) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel nao tem permissao para salvar respostas rápidas.",
                    variant: "destructive",
                  });
                  return;
                }
                const payload = {
                  title: qrTitle.trim(),
                  shortcut: qrShortcut.trim() || null,
                  bodyText: qrBodyText,
                  scope: qrScope,
                };
                const promise = qrEditingId
                  ? updateQR.mutateAsync({ id: qrEditingId, ...payload })
                  : createQR.mutateAsync(payload);
                void promise
                  .then(() => {
                    toast({ title: qrEditingId ? "Resposta atualizada" : "Resposta criada" });
                    setQrDialogOpen(false);
                  })
                  .catch((e: Error) => {
                    toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
                  });
              }}
            >
              {(createQR.isPending || updateQR.isPending) ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {qrEditingId ? "Salvar alterações" : "Criar resposta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
