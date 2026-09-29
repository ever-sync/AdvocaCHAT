import { Outlet } from "react-router-dom";
import { CalculadoraProvider } from "@/contexts/CalculadoraContext";
import { CommandPalette } from "@/components/CommandPalette";
import { AppSidebar } from "./AppSidebar";
import { CrmNotificationListener } from "./CrmNotificationListener";
import { MobileNav } from "./MobileNav";
import { TrialActivationGate } from "@/components/billing/TrialActivationGate";
import { AppTopbar } from "./AppTopbar";

export function AppLayout() {
  return (
    <CalculadoraProvider>
      <div className="app-shell flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden md:flex-row">
        <AppSidebar />
        <CrmNotificationListener />
        <CommandPalette />
        <MobileNav />
        <TrialActivationGate />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AppTopbar />
          <div className="app-workspace flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </CalculadoraProvider>
  );
}
