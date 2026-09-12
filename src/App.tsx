import { Suspense, useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { lazyWithReload } from "@/lib/chunk-load-recovery";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PermissionRoute, PlatformAdminRoute, ProtectedRoute, PublicOnlyRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import AtivarAcesso from "./pages/AtivarAcesso";
import RecuperarSenha from "./pages/RecuperarSenha";
import RedefinirSenha from "./pages/RedefinirSenha";
import NotFound from "./pages/NotFound";
import EmbedForm from "./pages/EmbedForm";
import PublicBooking from "./pages/PublicBooking";
import PublicAnamnese from "./pages/PublicAnamnese";
import PublicOrcamento from "./pages/PublicOrcamento";

const DesignSystem = lazyWithReload(() => import("./pages/DesignSystem"));
const Inbox = lazyWithReload(() => import("./pages/Inbox"));
const Clientes = lazyWithReload(() => import("./pages/Clientes"));
const Configuracoes = lazyWithReload(() => import("./pages/Configuracoes"));
const ConfiguracoesFila = lazyWithReload(() => import("./pages/ConfiguracoesFila"));
const ApiDocs = lazyWithReload(() => import("./pages/ApiDocs"));
const ClientePerfil = lazyWithReload(() => import("./pages/ClientePerfil"));
const LegalMyDay = lazyWithReload(() => import("./components/legal/client-care/LegalMyDay"));
const LegalReadiness = lazyWithReload(() => import("./components/legal/operations-readiness/LegalReadinessPage"));
const LegalCases = lazyWithReload(() => import("./pages/LegalCases"));
const LegalDocumentUpload = lazyWithReload(() => import("./pages/LegalDocumentUpload"));
const Crm = lazyWithReload(() => import("./pages/Crm"));
const Agenda = lazyWithReload(() => import("./pages/Agenda"));
const AgendamentosConfig = lazyWithReload(() => import("./pages/AgendamentosConfig"));
const CrmNegotiationDetail = lazyWithReload(() => import("./pages/CrmNegotiationDetail"));
const Relatorios = lazyWithReload(() => import("./pages/Relatorios"));
const Produtos = lazyWithReload(() => import("./pages/Produtos"));
const Documentos = lazyWithReload(() => import("./pages/Documentos"));
const Marketing = lazyWithReload(() => import("./pages/Marketing"));
const MarketingFlowEditor = lazyWithReload(() => import("./pages/MarketingFlowEditor"));
const AgenteIA = lazyWithReload(() => import("./pages/AgenteIA"));
const AdminIA = lazyWithReload(() => import("./pages/AdminIA"));
const AdminBilling = lazyWithReload(() => import("./pages/AdminBilling"));
const AdminPlansCatalog = lazyWithReload(() => import("./pages/AdminPlansCatalog"));
const AdminOperacao = lazyWithReload(() => import("./pages/AdminOperacao"));
const PageFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center bg-background text-sm text-muted-foreground">
    Carregando…
  </div>
);

function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const boundaryKey = `${location.pathname}?${location.search}`;
  return (
    <RouteErrorBoundary key={boundaryKey}>
      {children}
    </RouteErrorBoundary>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});

// Rotas públicas (login, cadastro, site) sempre em tema claro. O dark mode é uma
// preferência individual de cada usuário e só vale DENTRO do painel autenticado.
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/ativar-acesso",
  "/redefinir-senha",
  "/embed",
  "/agendar",
];

const isPublicPath = (path: string) =>
  path === "/" ||
  PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

// next-themes aplica a classe `dark` no <html> globalmente. Aqui reconciliamos:
// em rota pública força claro; no painel, segue a preferência salva do usuário.
const ThemeRouteScope = () => {
  const location = useLocation();
  const { theme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const dark = !isPublicPath(location.pathname) && theme === "dark";
    root.classList.toggle("dark", dark);
  }, [location.pathname, theme]);

  return null;
};

const RootRedirect = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  return <Navigate to={isAuthenticated ? "/inbox" : "/login"} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ThemeRouteScope />
            <Suspense fallback={<PageFallback />}>
              <RoutedErrorBoundary>
                <Routes>
                  {/* Public visual reference: fictional data only. */}
                  <Route path="/design-system" element={<DesignSystem />} />
                  {/* Public */}
                  <Route path="/" element={<RootRedirect />} />
                  <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
                  <Route path="/cadastro" element={<PublicOnlyRoute><Cadastro /></PublicOnlyRoute>} />
                  <Route path="/cadastro/plano" element={<Navigate to="/cadastro" replace />} />
                  <Route path="/cadastro/pagamento" element={<Navigate to="/cadastro" replace />} />
                  <Route path="/recuperar-senha" element={<PublicOnlyRoute><RecuperarSenha /></PublicOnlyRoute>} />
                  <Route path="/ativar-acesso" element={<AtivarAcesso />} />
                  <Route path="/redefinir-senha" element={<RedefinirSenha />} />

                  <Route path="/enviar-documento" element={<LegalDocumentUpload />} />

                  {/* Formulário público embedável (sem auth) */}
                  <Route path="/embed" element={<EmbedForm />} />

                  {/* Auto-agendamento público (sem auth) */}
                  <Route path="/agendar/:slug" element={<PublicBooking />} />

                  {/* Ficha de anamnese pública (sem auth) */}
                  <Route path="/anamnese/preencher" element={<PublicAnamnese />} />

                  {/* Orçamento público p/ aprovação (sem auth) */}
                  <Route path="/orcamento/aprovar" element={<PublicOrcamento />} />

                  {/* Authenticated */}
                  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                    <Route path="/juridico/meu-dia" element={<LegalMyDay />} />
                    <Route path="/juridico/operacao" element={<LegalReadiness />} />
                    <Route path="/casos" element={<LegalCases />} />
                    <Route path="/casos/:id" element={<LegalCases />} />
                    <Route
                      path="/inbox"
                      element={
                        <PermissionRoute permission="inbox">
                          <RouteErrorBoundary title="Erro ao carregar o Inbox">
                            <Inbox />
                          </RouteErrorBoundary>
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/clientes"
                      element={
                        <PermissionRoute permission="clientes">
                          <Clientes />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/clientes/:id"
                      element={
                        <PermissionRoute permission="clientes">
                          <ClientePerfil />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/crm"
                      element={
                        <PermissionRoute permission="crm">
                          <Crm />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/agenda"
                      element={
                        <PermissionRoute permission="agenda">
                          <Agenda />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/agenda/configuracoes"
                      element={
                        <PermissionRoute permission="configuracoes">
                          <AgendamentosConfig />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/crm/negociacao/:negotiationId"
                      element={
                        <PermissionRoute permission="crm">
                          <CrmNegotiationDetail />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/produtos"
                      element={
                        <PermissionRoute permission="produtos">
                          <Produtos />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/documentos"
                      element={
                        <PermissionRoute permission="crm">
                          <Documentos />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/relatorios"
                      element={<Navigate to="/painel" replace />}
                    />
                    <Route
                      path="/painel"
                      element={
                        <PermissionRoute permission="relatorios">
                          <Relatorios />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/marketing"
                      element={
                        <PermissionRoute permission="marketing">
                          <Marketing />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/marketing/fluxo/:flowId"
                      element={
                        <PermissionRoute permission="marketing">
                          <MarketingFlowEditor />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/agente-ia"
                      element={
                        <PermissionRoute permission="ia">
                          <AgenteIA />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/admin/ia"
                      element={
                        <PlatformAdminRoute>
                          <AdminIA />
                        </PlatformAdminRoute>
                      }
                    />
                    <Route
                      path="/admin/billing"
                      element={
                        <PlatformAdminRoute>
                          <AdminBilling />
                        </PlatformAdminRoute>
                      }
                    />
                    <Route
                      path="/admin/planos"
                      element={
                        <PlatformAdminRoute>
                          <AdminPlansCatalog />
                        </PlatformAdminRoute>
                      }
                    />
                    <Route
                      path="/admin/operacao"
                      element={
                        <PlatformAdminRoute>
                          <AdminOperacao />
                        </PlatformAdminRoute>
                      }
                    />
                    <Route
                      path="/configuracoes"
                      element={
                        <PermissionRoute permission="configuracoes">
                          <Configuracoes />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/fila"
                      element={
                        <PermissionRoute permission="configuracoes">
                          <ConfiguracoesFila />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/api-docs"
                      element={
                        <PermissionRoute permission="configuracoes">
                          <ApiDocs />
                        </PermissionRoute>
                      }
                    />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </RoutedErrorBoundary>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
