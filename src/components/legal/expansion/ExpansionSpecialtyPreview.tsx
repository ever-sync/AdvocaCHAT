import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { applySpecialty, previewSpecialty } from "@/lib/api/legal-expansion";
import { useLegalAction } from "../legal-ui";
import { ExpansionAccessNotice, ExpansionDialog } from "./ExpansionShared";
import {
  expansionCaseAccess,
  expansionCategoryAccess,
  expansionKey,
  expansionOwner,
  type ExpansionProps,
} from "./expansion-ui";
import { ExpansionSpecialtyBodyView } from "./ExpansionSpecialtyDetails";
import { SuccessionCheck, SuccessionNotice } from "./ExpansionSuccessionFields";
export function ExpansionSpecialtyPreview({
  props,
  versionId,
  onClose,
}: {
  props: ExpansionProps;
  versionId: string;
  onClose(): void;
}) {
  const access =
    expansionCaseAccess(props) &&
    expansionOwner(props) &&
    props.context.can_review &&
    props.context.user_id === props.workspace.user_id &&
    props.context.tenant_id === props.workspace.tenant_id;
  const [confirmedHash, setConfirmedHash] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<{ hash: string; key: string } | null>(
    null,
  );
  const action = useLegalAction();
  const preview = useQuery({
    queryKey: [...expansionKey(props, "specialty-preview"), versionId],
    queryFn: () => previewSpecialty(props.legalCase.id, versionId),
    enabled: access,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const value =
    access &&
    preview.isFetchedAfterMount &&
    !preview.isError &&
    preview.data?.version_id === versionId
      ? preview.data
      : null;
  const categoriesAllowed =
    value &&
    [...value.additions.checklist, ...value.additions.task_templates].every(
      (item) => expansionCategoryAccess(props, item.category),
    );
  const canApply =
    value?.can_apply &&
    value.is_current &&
    value.missing.length === 0 &&
    categoriesAllowed;
  const confirmationHash = attempt?.hash ?? value?.preview_hash;
  const confirmed = Boolean(
    confirmationHash && confirmedHash === confirmationHash,
  );
  async function apply() {
    if (!access || !confirmed || (!attempt && (!canApply || !value))) return;
    const request = attempt ?? {
      hash: value!.preview_hash,
      key: crypto.randomUUID(),
    };
    if (!attempt) setAttempt(request);
    if (
      await action.run(
        () =>
          applySpecialty(
            props.legalCase.id,
            versionId,
            request.hash,
            request.key,
          ),
        "Aplicação do pacote conferida",
      )
    )
      onClose();
  }
  if (!access) return <ExpansionAccessNotice />;
  return (
    <ExpansionDialog
      title="Prévia de aplicação ao caso"
      description="Confira exatamente os itens organizacionais. A aplicação preserva instalações anteriores e não agenda tarefas automaticamente."
      onClose={onClose}
      onSubmit={apply}
      actionLabel={
        attempt
          ? "Consultar ou repetir a mesma solicitação"
          : "Aplicar pacote conferido"
      }
      pending={action.pending}
      disabled={!confirmed || (!attempt && !canApply)}
    >
      {preview.isError ? (
        <ExpansionAccessNotice />
      ) : !value ? (
        <SuccessionNotice>
          Conferindo versão, permissões e itens existentes…
        </SuccessionNotice>
      ) : (
        <>
          {value.missing.length > 0 && (
            <SuccessionNotice error>
              Pendências:{" "}
              {value.missing
                .map(
                  (code) =>
                    ({
                      package_not_current_reviewed:
                        "Revisar a versão atual do pacote",
                      case_owner_required:
                        "A aplicação exige o responsável atual pelo caso",
                      category_required_general: "Conferir acesso ao caso",
                      category_required_medical:
                        "Conferir acesso aos dados de saúde",
                      category_required_fiscal:
                        "Conferir acesso aos dados fiscais",
                      category_required_restricted:
                        "Conferir acesso simultâneo aos dados de saúde e fiscais",
                    })[code] ?? "Conferir a pendência de acesso ou revisão",
                )
                .join("; ")}
              .
            </SuccessionNotice>
          )}
          {value.conflicts.length > 0 && (
            <SuccessionNotice>
              {value.conflicts.length} item(ns) de instalações anteriores serão
              preservados. Confira o trabalho existente para evitar
              acompanhamentos repetidos.
            </SuccessionNotice>
          )}
          {!categoriesAllowed ? (
            <ExpansionAccessNotice />
          ) : (
            <ExpansionSpecialtyBodyView body={value.additions} />
          )}
          {!value.is_current && (
            <SuccessionNotice error>
              Esta versão não está atual para aplicação.
            </SuccessionNotice>
          )}
        </>
      )}
      {attempt && (
        <SuccessionNotice>
          A solicitação mantém a mesma chave e a mesma prévia até haver
          confirmação. Uma falha de resposta não provoca outra instalação.
        </SuccessionNotice>
      )}
      <SuccessionCheck
        label="Conferi os itens e autorizo a aplicação organizacional desta versão ao caso"
        checked={confirmed}
        onChange={(checked) =>
          setConfirmedHash(
            checked && confirmationHash ? confirmationHash : null,
          )
        }
      />
    </ExpansionDialog>
  );
}
