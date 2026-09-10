import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCustomers } from "@/lib/api/customers";
import { CustomerCustomFieldInput } from "@/components/customers/CustomerCustomFieldInput";
import {
  customFieldValueToString,
  listCustomFieldValuesForCustomer,
  upsertCustomerCustomFieldValues,
  useCustomerCustomFields,
} from "@/lib/api/customer-custom-fields";
import { normalizePhone } from "@/lib/phone";
import type { Customer, CustomerUpsertInput } from "@/types/domain";

type CustomerFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Retorne o id do cliente criado quando for cadastro novo. */
  onSubmit: (input: CustomerUpsertInput) => Promise<string | void> | string | void;
  customer?: Customer | null;
  initialOverrides?: Partial<CustomerUpsertInput>;
  loading?: boolean;
};

function nextCustomerCode(customers: Array<{ codigo?: string }>) {
  const highestCode = customers.reduce((highest, customer) => {
    const numericCode = Number((customer.codigo ?? "").replace(/\D/g, ""));
    if (!Number.isFinite(numericCode)) {
      return highest;
    }
    return Math.max(highest, numericCode);
  }, 0);

  return String(highestCode + 1).padStart(4, "0");
}

function getInitialForm(customer?: Customer | null): CustomerUpsertInput {
  if (customer) {
    return {
      codigo: customer.codigo,
      tipo:
        customer.tipo === "pf" || customer.tipo === "pj"
          ? customer.tipo
          : customer.cpf && !customer.cnpj
            ? "pf"
            : "pj",
      origem: customer.origem,
      nome: customer.nome,
      telefone: customer.telefone,
      celular: customer.celular,
      email: customer.email,
      cnpj: customer.cnpj,
      endereco: customer.endereco,
      perfil: customer.perfil,
      rota: customer.rota,
      status: customer.status,
      vendedor: customer.vendedor,
      ultimoPedido: customer.ultimoPedido,
      ticketMedio: customer.ticketMedio,
      frequenciaCompra: customer.frequenciaCompra,
      totalGasto: customer.totalGasto,
      cpf: customer.cpf,
      rg: customer.rg,
      nascimento: customer.nascimento,
      nomeSocial: customer.nomeSocial,
      razaoSocial: customer.razaoSocial,
      inscricaoEstadual: customer.inscricaoEstadual,
      inscricaoMunicipal: customer.inscricaoMunicipal,
      cep: customer.cep,
      logradouro: customer.logradouro,
      numero: customer.numero,
      bairro: customer.bairro,
      zone: customer.zone,
      cidade: customer.cidade,
      estado: customer.estado,
      complemento: customer.complemento,
      ativo: customer.ativo,
      observacoes: customer.observacoes,
      cadastradoEm: customer.cadastradoEm,
    };
  }

  return {
    codigo: "",
    tipo: "pj",
    origem: undefined,
    nome: "",
    telefone: "",
    celular: "",
    email: "",
    cnpj: "",
    endereco: "",
    perfil: "B",
    rota: "",
    status: "ativo",
    vendedor: "",
    ultimoPedido: new Date().toISOString().slice(0, 10),
    ticketMedio: 0,
    frequenciaCompra: "Quinzenal",
    totalGasto: 0,
    cpf: "",
    rg: "",
    nascimento: "",
    nomeSocial: "",
    razaoSocial: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    cep: "",
    logradouro: "",
    numero: "",
    bairro: "",
    zone: "",
    cidade: "",
    estado: "",
    complemento: "",
    ativo: true,
    observacoes: "",
    cadastradoEm: new Date().toISOString().slice(0, 10),
  };
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  onSubmit,
  customer,
  initialOverrides,
  loading = false,
}: CustomerFormDialogProps) {
  const { toast } = useToast();
  const { data: customers = [] } = useCustomers({}, { enabled: open });
  const { data: fieldDefs = [] } = useCustomerCustomFields({ enabled: open });
  const [baseForm, setBaseForm] = useState<CustomerUpsertInput>(getInitialForm(customer));
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);
  const [savingCustomFields, setSavingCustomFields] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const base = getInitialForm(customer);
    const merged = customer ? base : { ...base, ...initialOverrides };
    setBaseForm(merged);
    setNome(merged.nome ?? "");
    setTelefone(merged.telefone ?? "");
    setEmail(merged.email ?? "");
    setCustomValues({});

    if (!customer?.id || fieldDefs.length === 0) {
      setCustomFieldsLoading(false);
      return;
    }

    let active = true;
    setCustomFieldsLoading(true);

    void listCustomFieldValuesForCustomer(customer.id)
      .then((rows) => {
        if (!active) {
          return;
        }
        const byField = new Map(rows.map((row) => [row.fieldId, row]));
        const next: Record<string, string> = {};
        for (const field of fieldDefs) {
          const row = byField.get(field.id);
          next[field.id] = row ? customFieldValueToString(field.kind, row) : "";
        }
        setCustomValues(next);
      })
      .catch((error) => {
        if (active) {
          toast({
            title: "Não foi possível carregar campos personalizados",
            description: error instanceof Error ? error.message : "Tente novamente.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (active) {
          setCustomFieldsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [customer, fieldDefs, initialOverrides, open, toast]);

  useEffect(() => {
    if (!open || customer || (baseForm.codigo ?? "").trim() || customers.length === 0) {
      return;
    }

    setBaseForm((current) => ({
      ...current,
      codigo: nextCustomerCode(customers),
    }));
  }, [baseForm.codigo, customer, customers, open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const phone = normalizePhone(telefone);
    if (!phone.jid) {
      toast({
        title: "Telefone inválido",
        description: "Informe um número de WhatsApp válido.",
        variant: "destructive",
      });
      return;
    }

    const payload: CustomerUpsertInput = {
      ...baseForm,
      nome: nome.trim(),
      telefone: phone.e164 ?? telefone.trim(),
      email: email.trim(),
    };

    try {
      const submitResult = await onSubmit(payload);
      const customerId =
        customer?.id ?? (typeof submitResult === "string" ? submitResult : undefined);

      if (customerId && fieldDefs.length > 0) {
        setSavingCustomFields(true);
        try {
          await upsertCustomerCustomFieldValues(customerId, fieldDefs, customValues);
        } finally {
          setSavingCustomFields(false);
        }
      }

      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  const isBusy = loading || savingCustomFields;
  const hasCustomFields = fieldDefs.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[12px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{customer ? "Editar contato" : "Novo contato"}</DialogTitle>
            <DialogDescription>
              {hasCustomFields
                ? "Nome, telefone, e-mail e campos personalizados do seu tenant."
                : "Informe os dados principais do contato."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer-nome">Nome</Label>
              <Input
                id="customer-nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Nome do contato"
                className="rounded-[10px]"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-telefone">Telefone</Label>
              <Input
                id="customer-telefone"
                value={telefone}
                onChange={(event) => setTelefone(event.target.value)}
                placeholder="+55 (11) 99999-9999"
                className="rounded-[10px]"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-email">E-mail</Label>
              <Input
                id="customer-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@exemplo.com"
                className="rounded-[10px]"
              />
            </div>

            {hasCustomFields ? (
              <div className="space-y-4 border-t border-border/60 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Campos personalizados
                </p>
                {customFieldsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando…
                  </div>
                ) : (
                  fieldDefs.map((field) => (
                    <CustomerCustomFieldInput
                      key={field.id}
                      field={field}
                      value={customValues[field.id] ?? ""}
                      onChange={(value) =>
                        setCustomValues((current) => ({ ...current, [field.id]: value }))
                      }
                    />
                  ))
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
