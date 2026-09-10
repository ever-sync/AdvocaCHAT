import { useState } from "react";
import type { MarketingFormRecord } from "@/lib/marketing/form-types";
import { MarketingFormsList } from "./MarketingFormsList";
import { MarketingFormBuilder } from "./MarketingFormBuilder";
import { MarketingAnalytics } from "./MarketingAnalytics";

export function MarketingFormsTab() {
  const [editing, setEditing] = useState<MarketingFormRecord | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  if (editing) {
    return (
      <div className="h-[calc(100vh-13rem)] min-h-[520px]">
        <MarketingFormBuilder form={editing} onClose={() => setEditing(null)} />
      </div>
    );
  }

  if (showAnalytics) {
    return <MarketingAnalytics onBack={() => setShowAnalytics(false)} />;
  }

  return <MarketingFormsList onEdit={setEditing} onShowAnalytics={() => setShowAnalytics(true)} />;
}
