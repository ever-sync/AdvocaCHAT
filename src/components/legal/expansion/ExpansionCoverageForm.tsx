import { OPERATION_LABELS } from "./expansion-labels";
import { useExpansionSources } from "./expansion-sources";
import { useState } from "react";
import { useLegalAction } from "../legal-ui";
import { createCoverage } from "@/lib/api/legal-expansion";
import type {
  ExpansionCoverage,
  ExpansionCoverageInput,
  ExpansionProvider,
  ExpansionOperation,
} from "@/types/legal-expansion";
import {
  ExpansionDialog,
  ExpansionSelect,
  ExpansionNotice,
} from "./ExpansionShared";
import { ExpansionText, ExpansionDocumentField } from "./ExpansionFields";
import type { ExpansionProps } from "./expansion-ui";
const PROVIDERS: Record<ExpansionProvider, string> = {
  domicilio: "Domicílio Judicial Eletrônico",
  djen: "Diário de Justiça Eletrônico Nacional",
  mni: "Interoperabilidade dos tribunais",
  inss: "INSS",
  onr: "Registro de imóveis / ONR",
  other: "Outro canal manual",
};
const OPTIONS: Record<ExpansionProvider, ExpansionOperation[]> = {
  domicilio: ["domicilio_list", "domicilio_logs", "domicilio_awareness"],
  djen: ["court_publication_read"],
  mni: ["court_case_read", "petition_submit"],
  inss: ["inss_request"],
  onr: ["registry_search", "registry_signature"],
  other: ["other_manual"],
};
export default function ExpansionCoverageForm({
  props,
  previous,
  onClose,
}: {
  props: ExpansionProps;
  previous?: ExpansionCoverage;
  onClose(): void;
}) {
  const action = useLegalAction(),
    sources = useExpansionSources(props);
  const [form, setForm] = useState<ExpansionCoverageInput>(() =>
    previous
      ? {
          coverage_key: previous.coverage_key,
          previous_version_id: previous.id,
          title: previous.title,
          provider: previous.provider,
          operation: previous.operation,
          api_version: previous.api_version,
          environment: previous.environment,
          institution_reference: previous.institution_reference,
          court: previous.court,
          degree: previous.degree,
          channel: previous.channel,
          documentation_url: previous.documentation_url,
          checked_on: previous.checked_on,
          permission_document_id: previous.permission_document_id,
          valid_from: previous.valid_from,
          valid_until: previous.valid_until,
          limitations: previous.limitations,
          permission_state: "unverified",
        }
      : {
          coverage_key: "",
          title: "",
          provider: "other",
          operation: "other_manual",
          api_version: "",
          environment: "homologation",
          institution_reference: "",
          court: "",
          degree: "",
          channel: "",
          documentation_url: "",
          checked_on: null,
          permission_document_id: null,
          valid_from: null,
          valid_until: null,
          limitations: "",
          permission_state: "unverified",
        },
  );
  const set = <K extends keyof ExpansionCoverageInput>(
    key: K,
    value: ExpansionCoverageInput[K],
  ) => setForm((old) => ({ ...old, [key]: value }));
  if (!props.context.can_manage) return null;
  return (
    <ExpansionDialog
      title={
        previous ? "Nova versão da cobertura" : "Registrar operação e cobertura"
      }
      description="Registre a fonte, a operação exata e as condições. A cobertura fica em rascunho; nenhuma conexão é ativada."
      onClose={onClose}
      pending={action.pending}
      onSubmit={() =>
        action.run(async () => {
          await createCoverage(form);
          onClose();
        }, "Cobertura registrada para revisão")
      }
    >
      <ExpansionNotice>
        Permissão institucional, configuração do ambiente e resultado de
        homologação são verificados separadamente. Registrar uma ciência ou um
        peticionamento neste catálogo não executa o ato.
      </ExpansionNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        <ExpansionText
          label="Identificador da cobertura"
          value={form.coverage_key}
          onChange={(v) => set("coverage_key", v)}
          required
          disabled={Boolean(previous)}
        />
        <ExpansionText
          label="Título da cobertura"
          value={form.title}
          onChange={(v) => set("title", v)}
          required
        />
        <ExpansionSelect
          label="Instituição ou provedor"
          value={form.provider}
          onChange={(v) =>
            setForm((old) => ({
              ...old,
              provider: v as ExpansionProvider,
              operation: OPTIONS[v as ExpansionProvider][0],
            }))
          }
        >
          {Object.entries(PROVIDERS).map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </ExpansionSelect>
        <ExpansionSelect
          label="Operação específica"
          value={form.operation}
          onChange={(v) => set("operation", v as ExpansionOperation)}
        >
          {OPTIONS[form.provider].map((v) => (
            <option key={v} value={v}>
              {OPERATION_LABELS[v]}
            </option>
          ))}
        </ExpansionSelect>
        <ExpansionText
          label="Versão do contrato técnico ou API"
          value={form.api_version}
          onChange={(v) => set("api_version", v)}
          required
        />
        <ExpansionSelect
          label="Ambiente da operação"
          value={form.environment}
          onChange={(v) =>
            set("environment", v as "production" | "homologation")
          }
        >
          <option value="homologation">Homologação</option>
          <option value="production">Produção</option>
        </ExpansionSelect>
        <ExpansionText
          label="Referência da instituição autorizada"
          value={form.institution_reference}
          onChange={(v) => set("institution_reference", v)}
          required
          hint="Identificador institucional protegido; não informe senha ou chave."
        />
        <ExpansionText
          label="Tribunal ou órgão coberto"
          value={form.court}
          onChange={(v) => set("court", v)}
          required
        />
        <ExpansionText
          label="Grau ou âmbito da operação"
          value={form.degree}
          onChange={(v) => set("degree", v)}
          required
        />
        <ExpansionText
          label="Canal autorizado"
          value={form.channel}
          onChange={(v) => set("channel", v)}
          required
        />
        <ExpansionText
          label="Fonte da documentação"
          value={form.documentation_url}
          onChange={(v) => set("documentation_url", v)}
          required
          type="url"
          maxLength={2000}
          hint="Endereço HTTPS da fonte conferida."
        />
        <ExpansionText
          label="Data de consulta da documentação"
          value={form.checked_on ?? ""}
          onChange={(v) => set("checked_on", v || null)}
          type="date"
        />
        <ExpansionText
          label="Início de vigência"
          value={form.valid_from ?? ""}
          onChange={(v) => set("valid_from", v || null)}
          type="date"
        />
        <ExpansionText
          label="Fim de vigência"
          value={form.valid_until ?? ""}
          onChange={(v) => set("valid_until", v || null)}
          type="date"
        />
      </div>
      <ExpansionSelect
        label="Situação da permissão institucional"
        value={form.permission_state}
        onChange={(v) =>
          set(
            "permission_state",
            v as ExpansionCoverageInput["permission_state"],
          )
        }
      >
        <option value="unverified">Ainda não conferida</option>
        <option value="documented">
          Permissão documentada, sujeita à revisão
        </option>
        <option value="denied">Permissão negada</option>
      </ExpansionSelect>
      <ExpansionDocumentField
        label="Prova geral da autorização"
        docs={sources.docs.filter((d) => d.category === "general")}
        value={form.permission_document_id ?? ""}
        onChange={(v) => set("permission_document_id", v || null)}
      />
      <ExpansionText
        label="Limitações, custos informados e condições da cobertura"
        value={form.limitations}
        onChange={(v) => set("limitations", v)}
        multiline
        maxLength={4000}
      />
    </ExpansionDialog>
  );
}
