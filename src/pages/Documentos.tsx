import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  Download,
  Trash2,
  Plus,
  Search,
  Briefcase,
  HardDrive,
  Loader2,
  AlertCircle,
  FolderOpen,
  Sparkles,
  FileSignature,
  Link as LinkIcon,
  Share2,
  Edit2,
  Settings,
  X,
  ListPlus,
} from "lucide-react";

import { getCurrentTenantId } from "@/lib/api/tenant";
import { listCrmNegotiations } from "@/lib/api/crm-negotiations";
import {
  useAllCrmDocuments,
  useCreateCrmNegotiationDocument,
  useDeleteCrmNegotiationDocument,
  getCrmNegotiationDocumentSignedUrl,
} from "@/lib/api/crm-negotiation-documents";
import {
  useDocumentTemplates,
  useCreateDocumentTemplate,
  useUpdateDocumentTemplate,
  useDeleteDocumentTemplate,
  type DocumentTemplate,
  type DocumentTemplateField,
} from "@/lib/api/crm-document-templates";
import { safeParseMs } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type DocumentTab = "anamnese" | "orcamento" | "contrato" | "modelos";
type TemplateCategory = Exclude<DocumentTab, "modelos">;

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function getFileIcon(mimeType: string) {
  const type = mimeType.toLowerCase();
  if (type.includes("pdf")) return FileText;
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return FileSpreadsheet;
  if (type.includes("image")) return FileImage;
  if (type.includes("video")) return FileVideo;
  if (type.includes("audio")) return FileAudio;
  if (type.includes("word") || type.includes("text")) return FileText;
  return File;
}

function getIconColorClass(mimeType: string) {
  const type = mimeType.toLowerCase();
  if (type.includes("pdf")) return "text-rose-500 bg-rose-500/10";
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return "text-emerald-500 bg-emerald-500/10";
  if (type.includes("image")) return "text-blue-500 bg-blue-500/10";
  if (type.includes("video")) return "text-purple-500 bg-purple-500/10";
  if (type.includes("audio")) return "text-amber-500 bg-amber-500/10";
  return "text-zinc-500 bg-zinc-500/10";
}

export default function Documentos() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DocumentTab>("anamnese");
  const [search, setSearch] = useState("");

  // Dialog controls
  const [uploadOpen, setUploadOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteNegotiationId, setDeleteNegotiationId] = useState<string | null>(null);

  // Template Builder states
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>("anamnese");
  const [templateName, setTemplateName] = useState("");
  const [templateContent, setTemplateContent] = useState("");
  const [templateFields, setTemplateFields] = useState<DocumentTemplateField[]>([]);

  // Add field form states (Form Builder)
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "radio" | "checkbox" | "textarea">("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState("");

  // Upload Form states
  const [displayName, setDisplayName] = useState("");
  const [selectedNegotiationId, setSelectedNegotiationId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Custom Document Creator states
  const [customTitle, setCustomTitle] = useState("");
  const [customNegotiationId, setCustomNegotiationId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [documentContent, setDocumentContent] = useState("");

  // Anamnese Link Generator states
  const [linkNegotiationId, setLinkNegotiationId] = useState("");
  const [linkTemplateId, setLinkTemplateId] = useState("default");

  // Orçamento Link Generator states
  const [orcamentoLinkOpen, setOrcamentoLinkOpen] = useState(false);
  const [orcamentoLinkNegotiationId, setOrcamentoLinkNegotiationId] = useState("");
  const [orcamentoTamanho, setOrcamentoTamanho] = useState("");
  const [orcamentoPeso, setOrcamentoPeso] = useState("");
  const [orcamentoCabeloCor, setOrcamentoCabeloCor] = useState("");
  const [orcamentoObs, setOrcamentoObs] = useState("");
  const [orcamentoValorTotal, setOrcamentoValorTotal] = useState("");
  const [orcamentoTemplateId, setOrcamentoTemplateId] = useState("default");
  const [orcamentoAnswers, setOrcamentoAnswers] = useState<Record<string, string>>({});
  const [generatedAnamneseLink, setGeneratedAnamneseLink] = useState("");
  const [generatedOrcamentoLink, setGeneratedOrcamentoLink] = useState("");

  useEffect(() => {
    document.title = "Documentos | WChat";
  }, []);

  // Fetch tenantId
  const { data: tenantId } = useQuery({
    queryKey: ["current-tenant-id"],
    queryFn: () => getCurrentTenantId(),
  });

  // Fetch all documents
  const { data: allDocuments = [], isLoading: docsLoading, error: docsError } = useAllCrmDocuments();

  // Fetch templates for current tab/all
  const { data: dbTemplates = [], isLoading: templatesLoading } = useDocumentTemplates();

  // Fetch negotiations for target selectors
  const { data: negotiationsResult } = useQuery({
    queryKey: ["crm-negotiations-list-for-docs"],
    queryFn: () => listCrmNegotiations({ limit: 100 }),
  });
  const negotiations = negotiationsResult?.data ?? [];

  // Filter templates list
  const filteredDbTemplates = useMemo(() => {
    const query = search.toLowerCase();
    return dbTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query)
    );
  }, [dbTemplates, search]);

  // Mutations
  const createMutation = useCreateCrmNegotiationDocument({
    onSuccess: () => {
      toast({
        title: "Sucesso!",
        description: "O documento foi criado e anexado com sucesso.",
      });
      // Reset forms and close
      setDisplayName("");
      setSelectedNegotiationId("");
      setSelectedFile(null);
      setCustomTitle("");
      setCustomNegotiationId("");
      setSelectedTemplateId("");
      setDocumentContent("");
      setUploadOpen(false);
      setCustomOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Erro ao criar documento",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useDeleteCrmNegotiationDocument({
    onSuccess: () => {
      toast({
        title: "Sucesso!",
        description: "O documento foi excluído com sucesso.",
      });
      setDeleteId(null);
      setDeleteNegotiationId(null);
    },
    onError: (err) => {
      toast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Template mutations
  const createTemplateMutation = useCreateDocumentTemplate({
    onSuccess: () => {
      toast({ title: "Modelo criado", description: "O modelo de documento foi salvo com sucesso." });
      closeBuilder();
    },
    onError: (err) => {
      toast({ title: "Erro ao criar modelo", description: err.message, variant: "destructive" });
    },
  });

  const updateTemplateMutation = useUpdateDocumentTemplate({
    onSuccess: () => {
      toast({ title: "Modelo atualizado", description: "As alterações do modelo foram salvas." });
      closeBuilder();
    },
    onError: (err) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useDeleteDocumentTemplate({
    onSuccess: () => {
      toast({ title: "Modelo removido", description: "O modelo foi excluído." });
    },
    onError: (err) => {
      toast({ title: "Erro ao excluir modelo", description: err.message, variant: "destructive" });
    },
  });

  // Filter documents by tab category and search term
  const categorizedDocs = useMemo(() => {
    return allDocuments.map((doc) => {
      // Determine category based on name prefix
      let category: "anamnese" | "orcamento" | "contrato" = "contrato";
      let cleanName = doc.displayName;

      if (doc.displayName.startsWith("[Anamnese]")) {
        category = "anamnese";
        cleanName = doc.displayName.replace(/^\[Anamnese\]\s*/, "");
      } else if (doc.displayName.startsWith("[Orçamento]")) {
        category = "orcamento";
        cleanName = doc.displayName.replace(/^\[Orçamento\]\s*/, "");
      } else if (doc.displayName.startsWith("[Contrato]")) {
        category = "contrato";
        cleanName = doc.displayName.replace(/^\[Contrato\]\s*/, "");
      }

      return {
        ...doc,
        category,
        cleanName,
      };
    })
    .filter((doc) => {
      // Match active tab
      if (doc.category !== activeTab) return false;

      // Match search string
      const query = search.toLowerCase();
      return (
        doc.cleanName.toLowerCase().includes(query) ||
        doc.fileName.toLowerCase().includes(query) ||
        (doc.negotiationTitle ?? "").toLowerCase().includes(query)
      );
    });
  }, [allDocuments, activeTab, search]);

  // General stats
  const stats = useMemo(() => {
    const totalCount = allDocuments.length;
    const totalBytes = allDocuments.reduce((acc, doc) => acc + doc.fileSize, 0);
    const uniqueLeads = new Set(allDocuments.map((d) => d.negotiationId)).size;

    return {
      totalCount,
      totalBytesFormatted: formatBytes(totalBytes),
      uniqueLeads,
    };
  }, [allDocuments]);

  // Load template contents and replace dynamic variables
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setDocumentContent("");
      return;
    }

    // Find template in either dynamic templates or fallback static templates
    const template = dbTemplates.find((t) => t.id === templateId);
    let content = "";
    if (template) {
      content = template.content;
    }

    // Fill variables if a negotiation is selected
    if (customNegotiationId) {
      const negotiation = negotiations.find((n) => n.id === customNegotiationId);
      if (negotiation) {
        content = content
          .replace(/{{cliente}}/g, negotiation.customer?.nome ?? "Cliente")
          .replace(/{{negociacao}}/g, negotiation.title)
          .replace(
            /{{valor}}/g,
            negotiation.totalValue > 0
              ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  negotiation.totalValue,
                )
              : "A definir",
          )
          .replace(/{{data}}/g, format(new Date(), "dd/MM/yyyy"));
      }
    } else {
      content = content
        .replace(/{{cliente}}/g, "[Selecione o Lead]")
        .replace(/{{negociacao}}/g, "[Selecione o Lead]")
        .replace(/{{valor}}/g, "[Selecione o Lead]")
        .replace(/{{data}}/g, format(new Date(), "dd/MM/yyyy"));
    }

    setDocumentContent(content);
  };

  // Re-run template insertion when negotiation is selected
  const handleCustomNegotiationChange = (negId: string) => {
    setCustomNegotiationId(negId);
    // Trigger update on content if template is selected
    if (selectedTemplateId) {
      const template = dbTemplates.find((t) => t.id === selectedTemplateId);
      if (template) {
        const negotiation = negotiations.find((n) => n.id === negId);
        let content = template.content;
        if (negotiation) {
          content = content
            .replace(/{{cliente}}/g, negotiation.customer?.nome ?? "Cliente")
            .replace(/{{negociacao}}/g, negotiation.title)
            .replace(
              /{{valor}}/g,
              negotiation.totalValue > 0
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                    negotiation.totalValue,
                  )
                : "A definir",
            )
            .replace(/{{data}}/g, format(new Date(), "dd/MM/yyyy"));
        }
        setDocumentContent(content);
      }
    }
  };

  const handleDownload = async (doc: typeof categorizedDocs[0]) => {
    try {
      const signedUrl = await getCrmNegotiationDocumentSignedUrl(doc.storagePath);
      window.open(signedUrl, "_blank");
    } catch (err) {
      toast({
        title: "Erro no download",
        description: err instanceof Error ? err.message : "Não foi possível baixar o arquivo.",
        variant: "destructive",
      });
    }
  };

  // Upload submitting
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({ title: "Atenção", description: "Informe o nome do documento.", variant: "destructive" });
      return;
    }
    if (!selectedNegotiationId) {
      toast({ title: "Atenção", description: "Selecione uma negociação associada.", variant: "destructive" });
      return;
    }
    if (!selectedFile) {
      toast({ title: "Atenção", description: "Selecione um arquivo para envio.", variant: "destructive" });
      return;
    }

    const categoryPrefix =
      activeTab === "anamnese" ? "[Anamnese] " : activeTab === "orcamento" ? "[Orçamento] " : "[Contrato] ";

    createMutation.mutate({
      negotiationId: selectedNegotiationId,
      displayName: categoryPrefix + displayName.trim(),
      file: selectedFile,
    });
  };

  // Custom text document submitting
  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) {
      toast({ title: "Atenção", description: "Informe o título do documento.", variant: "destructive" });
      return;
    }
    if (!customNegotiationId) {
      toast({ title: "Atenção", description: "Selecione o lead/negociação associado.", variant: "destructive" });
      return;
    }
    if (!documentContent.trim()) {
      toast({ title: "Atenção", description: "Escreva o conteúdo do documento.", variant: "destructive" });
      return;
    }

    const blob = new Blob([documentContent], { type: "text/plain;charset=utf-8" });
    const filename = `${customTitle.trim().toLowerCase().replace(/\s+/g, "_")}.txt`;
    const file = new globalThis.File([blob], filename, { type: "text/plain" });

    const categoryPrefix =
      activeTab === "anamnese" ? "[Anamnese] " : activeTab === "orcamento" ? "[Orçamento] " : "[Contrato] ";

    createMutation.mutate({
      negotiationId: customNegotiationId,
      displayName: categoryPrefix + customTitle.trim(),
      file: file,
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteId || !deleteNegotiationId) return;
    deleteMutation.mutate({ id: deleteId, negotiationId: deleteNegotiationId });
  };

  // Construct URL for public anamnese form filling
  useEffect(() => {
    if (!linkNegotiationId || !tenantId) {
      setGeneratedAnamneseLink("");
      return;
    }
    const selected = negotiations.find((n) => n.id === linkNegotiationId);
    if (!selected) {
      setGeneratedAnamneseLink("");
      return;
    }

    const host = window.location.origin;
    const custId = selected.customerId || "";
    const nome = selected.customer?.nome || "";
    const fone = selected.customer?.telefone || "";

    // Link expires in 7 days
    const exp = String(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const signParams = {
      neg: selected.id,
      cust: custId,
      tenant: tenantId,
      exp,
      templateId: linkTemplateId || "",
    };

    import("@/lib/security").then(async ({ signUrlParams }) => {
      const sig = await signUrlParams(signParams);
      let link = `${host}/anamnese/preencher?neg=${selected.id}&cust=${custId}&tenant=${tenantId}&nome=${encodeURIComponent(
        nome,
      )}&fone=${encodeURIComponent(fone)}&exp=${exp}&sig=${sig}`;

      if (linkTemplateId && linkTemplateId !== "default") {
        link += `&templateId=${linkTemplateId}`;
      }
      setGeneratedAnamneseLink(link);
    });
  }, [linkNegotiationId, linkTemplateId, tenantId, negotiations]);

  const handleCopyLink = () => {
    if (!generatedAnamneseLink) return;
    navigator.clipboard.writeText(generatedAnamneseLink);
    toast({
      title: "Copiado!",
      description: "O link público da Ficha de Anamnese foi copiado para a área de transferência.",
    });
  };

  const handleWhatsAppSend = () => {
    if (!generatedAnamneseLink || !linkNegotiationId) return;
    const selected = negotiations.find((n) => n.id === linkNegotiationId);
    if (!selected) return;

    const nome = selected.customer?.nome || "Cliente";
    const fone = selected.customer?.telefone || "";
    const cleanPhone = fone.replace(/\D/g, "");

    const text = `Olá, ${nome}! Por favor, preencha sua Ficha de Anamnese clicando neste link seguro: ${generatedAnamneseLink}`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  };

  // Construct URL for public budget/quote form filling and approval
  useEffect(() => {
    if (!orcamentoLinkNegotiationId || !tenantId) {
      setGeneratedOrcamentoLink("");
      return;
    }
    const selected = negotiations.find((n) => n.id === orcamentoLinkNegotiationId);
    if (!selected) {
      setGeneratedOrcamentoLink("");
      return;
    }

    const host = window.location.origin;
    const custId = selected.customerId || "";
    const nome = selected.customer?.nome || "";
    const fone = selected.customer?.telefone || "";
    const cleanValorTotal = orcamentoValorTotal.replace(/\D/g, "");

    // Link expires in 7 days
    const exp = String(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const signParams = {
      neg: selected.id,
      cust: custId,
      tenant: tenantId,
      exp,
      valor_total: cleanValorTotal,
      templateId: orcamentoTemplateId || "",
    };

    import("@/lib/security").then(async ({ signUrlParams }) => {
      const sig = await signUrlParams(signParams);
      let link = `${host}/orcamento/aprovar?neg=${selected.id}&cust=${custId}&tenant=${tenantId}&nome=${encodeURIComponent(
        nome,
      )}&fone=${encodeURIComponent(fone)}&valor_total=${encodeURIComponent(cleanValorTotal)}&exp=${exp}&sig=${sig}`;

      if (orcamentoTemplateId && orcamentoTemplateId !== "default") {
        link += `&templateId=${orcamentoTemplateId}`;
        Object.entries(orcamentoAnswers).forEach(([fieldId, val]) => {
          if (val) {
            link += `&${fieldId}=${encodeURIComponent(val)}`;
          }
        });
      } else {
        link += `&tamanho=${encodeURIComponent(orcamentoTamanho)}&peso=${encodeURIComponent(
          orcamentoPeso,
        )}&cabelo_cor=${encodeURIComponent(orcamentoCabeloCor)}&obs=${encodeURIComponent(
          orcamentoObs,
        )}`;
      }

      setGeneratedOrcamentoLink(link);
    });
  }, [
    orcamentoLinkNegotiationId,
    tenantId,
    negotiations,
    orcamentoTamanho,
    orcamentoPeso,
    orcamentoCabeloCor,
    orcamentoObs,
    orcamentoValorTotal,
    orcamentoTemplateId,
    orcamentoAnswers,
  ]);

  const handleCopyOrcamentoLink = () => {
    if (!generatedOrcamentoLink) return;
    navigator.clipboard.writeText(generatedOrcamentoLink);
    toast({
      title: "Copiado!",
      description: "O link de aprovação do orçamento foi copiado para a área de transferência.",
    });
  };

  const handleWhatsAppOrcamentoSend = () => {
    if (!generatedOrcamentoLink || !orcamentoLinkNegotiationId) return;
    const selected = negotiations.find((n) => n.id === orcamentoLinkNegotiationId);
    if (!selected) return;

    const nome = selected.customer?.nome || "Cliente";
    const fone = selected.customer?.telefone || "";
    const cleanPhone = fone.replace(/\D/g, "");

    const text = `Olá, ${nome}! Segue a proposta com o orçamento detalhado do seu Mega Hair. Por favor, acesse o link para revisar e aprovar digitalmente: ${generatedOrcamentoLink}`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  };

  // Form Builder fields controller
  const addFieldToTemplate = () => {
    if (!newFieldLabel.trim()) return;
    const id = newFieldLabel.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");

    const newField: DocumentTemplateField = {
      id: id + "_" + Date.now(),
      label: newFieldLabel.trim(),
      type: newFieldType,
      required: newFieldRequired,
    };

    if ((newFieldType === "radio" || newFieldType === "checkbox") && newFieldOptions.trim()) {
      newField.options = newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean);
    }

    setTemplateFields([...templateFields, newField]);
    setNewFieldLabel("");
    setNewFieldRequired(false);
    setNewFieldOptions("");
  };

  const removeFieldFromTemplate = (id: string) => {
    setTemplateFields(templateFields.filter((f) => f.id !== id));
  };

  const openBuilder = (template?: DocumentTemplate) => {
    if (template) {
      setEditingTemplateId(template.id);
      setTemplateCategory(template.category);
      setTemplateName(template.name);
      setTemplateContent(template.content);
      setTemplateFields(template.fields || []);
    } else {
      setEditingTemplateId(null);
      setTemplateCategory("anamnese");
      setTemplateName("");
      setTemplateContent("");
      setTemplateFields([]);
    }
    setBuilderOpen(true);
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateContent("");
    setTemplateFields([]);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;

    if (editingTemplateId) {
      updateTemplateMutation.mutate({
        id: editingTemplateId,
        name: templateName,
        content: templateCategory === "anamnese" ? "" : templateContent,
        fields: templateCategory === "anamnese" ? templateFields : [],
      });
    } else {
      createTemplateMutation.mutate({
        category: templateCategory,
        name: templateName,
        content: templateCategory === "anamnese" ? "" : templateContent,
        fields: templateCategory === "anamnese" ? templateFields : [],
      });
    }
  };

  // Filter templates based on current tab selector for generation dialog
  const templatesForSelectedTab = useMemo(() => {
    return dbTemplates.filter((t) => t.category === activeTab);
  }, [dbTemplates, activeTab]);

  const anamneseTemplates = useMemo(() => {
    return dbTemplates.filter((t) => t.category === "anamnese");
  }, [dbTemplates]);

  const orcamentoTemplates = useMemo(() => {
    return dbTemplates.filter((t) => t.category === "orcamento");
  }, [dbTemplates]);

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-5">
        <div>
          <h1 id="documents-title" className="text-3xl font-bold tracking-tight">
            Documentos
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualização, geração de contratos personalizados e histórico de anamnese de clientes.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm border-border hover:border-primary/20 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Arquivos</CardTitle>
            <FolderOpen className="h-4.5 w-4.5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Documentos armazenados na nuvem</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border hover:border-primary/20 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Espaço Utilizado</CardTitle>
            <HardDrive className="h-4.5 w-4.5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBytesFormatted}</div>
            <p className="text-xs text-muted-foreground mt-1">Uso de banda do bucket do tenant</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border hover:border-primary/20 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads com Anexos</CardTitle>
            <Briefcase className="h-4.5 w-4.5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueLeads}</div>
            <p className="text-xs text-muted-foreground mt-1">Leads contendo documentação</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DocumentTab)}
        className="w-full space-y-6"
      >
        <TabsList className="grid grid-cols-4 w-full max-w-[600px] bg-muted/60 p-1 rounded-lg border border-border">
          <TabsTrigger value="anamnese" className="rounded-md font-semibold text-xs py-2">
            Anamnese
          </TabsTrigger>
          <TabsTrigger value="orcamento" className="rounded-md font-semibold text-xs py-2">
            Orçamentos
          </TabsTrigger>
          <TabsTrigger value="contrato" className="rounded-md font-semibold text-xs py-2">
            Contratos
          </TabsTrigger>
          <TabsTrigger value="modelos" className="rounded-md font-semibold text-xs py-2 bg-primary/5 text-primary border-emerald-500/10">
            Modelos (Templates)
          </TabsTrigger>
        </TabsList>

        {/* Dynamic content wrapper for active tab */}
        <div className="space-y-6">
          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card border border-border p-4 rounded-xl shadow-sm">
            <div className="flex flex-wrap gap-3 w-full sm:w-auto">
              {activeTab === "modelos" ? (
                <Button
                  id="btn-create-template"
                  onClick={() => openBuilder()}
                  className="flex items-center gap-2 font-semibold transition-transform active:scale-[0.98] shadow-sm shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Criar Modelo
                </Button>
              ) : (
                <>
                  <Button
                    id="btn-create-custom"
                    onClick={() => setCustomOpen(true)}
                    variant="outline"
                    className="flex items-center gap-2 font-semibold border-primary/20 hover:border-primary hover:bg-primary/5 text-primary transition-all active:scale-[0.98] shadow-sm shrink-0"
                  >
                    <Sparkles className="h-4 w-4" />
                    Criar Personalizado
                  </Button>

                  {activeTab === "anamnese" && (
                    <Button
                      id="btn-generate-anamnese-link"
                      onClick={() => setLinkOpen(true)}
                      variant="outline"
                      className="flex items-center gap-2 font-semibold border-emerald-500/20 hover:border-emerald-500 hover:bg-emerald-500/5 text-emerald-600 transition-all active:scale-[0.98] shadow-sm shrink-0"
                    >
                      <LinkIcon className="h-4 w-4" />
                      Gerar Link de Envio
                    </Button>
                  )}

                  {activeTab === "orcamento" && (
                    <Button
                      id="btn-generate-orcamento-link"
                      onClick={() => setOrcamentoLinkOpen(true)}
                      variant="outline"
                      className="flex items-center gap-2 font-semibold border-emerald-500/20 hover:border-emerald-500 hover:bg-emerald-500/5 text-emerald-600 transition-all active:scale-[0.98] shadow-sm shrink-0"
                    >
                      <LinkIcon className="h-4 w-4" />
                      Gerar Link de Orçamento
                    </Button>
                  )}

                  <Button
                    id="btn-create-new"
                    onClick={() => setUploadOpen(true)}
                    className="flex items-center gap-2 font-semibold transition-transform active:scale-[0.98] shadow-sm shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    Criar um Novo
                  </Button>
                </>
              )}
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="input-search-tab-documents"
                type="text"
                placeholder="Buscar nesta aba..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background border-border"
              />
            </div>
          </div>

          {/* Modelos Table */}
          {activeTab === "modelos" ? (
            <Card className="shadow-sm border-border overflow-hidden">
              <CardContent className="p-0">
                {templatesLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Carregando modelos...</p>
                  </div>
                ) : filteredDbTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <FolderOpen className="h-10 w-10 text-muted-foreground/60 mb-2" />
                    <p className="text-sm font-semibold">Nenhum modelo cadastrado.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Crie templates para facilitar orçamentos, contratos e avaliações.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-[45%]">Nome do Modelo</TableHead>
                          <TableHead className="w-[20%]">Categoria</TableHead>
                          <TableHead className="w-[20%]">Campos/Perguntas</TableHead>
                          <TableHead className="w-[15%] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDbTemplates.map((template) => (
                          <TableRow key={template.id} className="hover:bg-muted/20 transition-colors">
                            <TableCell className="font-semibold text-sm">
                              {template.name}
                            </TableCell>
                            <TableCell className="capitalize text-sm text-muted-foreground">
                              {template.category === "orcamento" ? "Orçamento" : template.category}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {template.category === "anamnese"
                                ? `${template.fields?.length || 0} perguntas customizadas`
                                : "Template de texto"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openBuilder(template)}
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full"
                                  title="Editar Modelo"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                                  title="Excluir Modelo"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Documents Table */
            <Card className="shadow-sm border-border overflow-hidden">
              <CardContent className="p-0">
                {docsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Carregando documentos...</p>
                  </div>
                ) : docsError ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-destructive">
                    <AlertCircle className="h-8 w-8" />
                    <p className="text-sm font-semibold">Erro ao carregar documentos.</p>
                    <p className="text-xs text-muted-foreground">
                      {docsError instanceof Error ? docsError.message : "Erro desconhecido."}
                    </p>
                  </div>
                ) : categorizedDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <FolderOpen className="h-10 w-10 text-muted-foreground/60 mb-2" />
                    <p className="text-sm font-semibold">Nenhum documento nesta aba.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Crie um documento personalizado ou envie um novo arquivo.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-[35%]">Título do Documento</TableHead>
                          <TableHead className="w-[25%]">Negociação</TableHead>
                          <TableHead className="w-[12%]">Tamanho</TableHead>
                          <TableHead className="w-[18%]">Criado em</TableHead>
                          <TableHead className="w-[10%] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categorizedDocs.map((doc) => {
                          const IconComp = getFileIcon(doc.mimeType);
                          const colorClass = getIconColorClass(doc.mimeType);
                          const ms = safeParseMs(doc.createdAt);
                          const formattedDate =
                            ms > 0 ? format(new Date(ms), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "-";

                          return (
                            <TableRow key={doc.id} className="hover:bg-muted/20 transition-colors">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                                    <IconComp className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="block truncate font-semibold text-foreground text-sm">
                                      {doc.cleanName}
                                    </span>
                                    <span className="block text-xs text-muted-foreground truncate font-normal">
                                      {doc.fileName}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/crm/negociacao/${doc.negotiationId}`)}
                                  className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors text-sm font-medium text-left"
                                >
                                  <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground/75" />
                                  <span className="truncate max-w-[200px]">{doc.negotiationTitle || "Ver Lead"}</span>
                                </button>
                                {doc.customerName && (
                                  <span className="block text-[11px] text-muted-foreground/80 mt-0.5 ml-5.5 font-normal truncate max-w-[200px]">
                                    Cliente: {doc.customerName}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm font-medium text-muted-foreground">
                                {formatBytes(doc.fileSize)}
                              </TableCell>
                              <TableCell className="text-sm font-medium text-muted-foreground">
                                {formattedDate}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    id={`btn-download-${doc.id}`}
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleDownload(doc)}
                                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full"
                                    title="Baixar Documento"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    id={`btn-delete-${doc.id}`}
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                      setDeleteId(doc.id);
                                      setDeleteNegotiationId(doc.negotiationId);
                                    }}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                                    title="Excluir Documento"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </Tabs>

      {/* Template Builder Dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Settings className="h-5 w-5 text-primary" />
              {editingTemplateId ? "Editar Modelo" : "Criar Novo Modelo"}
            </DialogTitle>
            <DialogDescription>
              Configure o nome, a categoria e construa a estrutura de variáveis ou formulários.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTemplate} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-category">Categoria do Modelo</Label>
                <Select
                  value={templateCategory}
                  onValueChange={(value) => setTemplateCategory(value as TemplateCategory)}
                  disabled={!!editingTemplateId}
                >
                  <SelectTrigger id="tpl-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anamnese">Anamnese</SelectItem>
                    <SelectItem value="orcamento">Orçamento</SelectItem>
                    <SelectItem value="contrato">Contrato</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Nome do Modelo</Label>
                <Input
                  id="tpl-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Ex: Anamnese Corporal, Contrato Salão"
                  required
                />
              </div>
            </div>

            {/* If contract: standard text editor */}
            {templateCategory === "contrato" ? (
              <div className="space-y-1.5">
                <Label htmlFor="tpl-content">Texto do Modelo</Label>
                <Textarea
                  id="tpl-content"
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  placeholder="Escreva o texto do modelo. Você pode usar variáveis dinâmicas como {{cliente}}, {{negociacao}}, {{valor}} ou {{data}} que serão substituídas automaticamente."
                  rows={10}
                  className="font-mono text-xs leading-relaxed"
                  required
                />
              </div>
            ) : (
              /* If Anamnese or Orçamento: dynamic form fields builder */
              <div className="space-y-5 border-t border-border pt-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <ListPlus className="h-4.5 w-4.5 text-primary" />
                  Form Builder: Adicionar Perguntas ao Formulário
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl border border-border/80">
                  <div className="space-y-1.5">
                    <Label>Pergunta / Label do Campo</Label>
                    <Input
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      placeholder="Ex: Histórico de alergias?"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Tipo de Resposta</Label>
                    <Select
                      value={newFieldType}
                      onValueChange={(value) => setNewFieldType(value as DocumentTemplateField["type"])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Texto Curto</SelectItem>
                        <SelectItem value="textarea">Texto Longo</SelectItem>
                        <SelectItem value="number">Número</SelectItem>
                        <SelectItem value="radio">Seleção Única (Sim/Não)</SelectItem>
                        <SelectItem value="checkbox">Multipla Escolha (Checkboxes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(newFieldType === "radio" || newFieldType === "checkbox") && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Opções de resposta (Separadas por vírgula)</Label>
                      <Input
                        value={newFieldOptions}
                        onChange={(e) => setNewFieldOptions(e.target.value)}
                        placeholder="Ex: Sim, Não, Talvez"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="field-required"
                      checked={newFieldRequired}
                      onChange={(e) => setNewFieldRequired(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary"
                    />
                    <Label htmlFor="field-required" className="cursor-pointer">Campo Obrigatório?</Label>
                  </div>

                  <div className="flex items-end justify-end sm:col-span-2">
                    <Button type="button" onClick={addFieldToTemplate} size="sm" className="font-semibold">
                      Adicionar Pergunta
                    </Button>
                  </div>
                </div>

                {/* List added fields */}
                <div className="space-y-2">
                  <Label>Campos Configurados no Formulário ({templateFields.length})</Label>
                  {templateFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic bg-zinc-50 border border-dashed p-3 text-center rounded-lg">
                      Nenhum campo adicionado ainda. Adicione perguntas acima.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto border border-border rounded-lg p-2 bg-zinc-50/50">
                      {templateFields.map((f, index) => (
                        <div key={f.id} className="flex items-center justify-between bg-card border border-border p-2.5 rounded-lg text-xs">
                          <div>
                            <span className="font-bold text-foreground block">
                              {index + 1}. {f.label} {f.required && <span className="text-destructive">*</span>}
                            </span>
                            <span className="text-[10px] text-muted-foreground capitalize">
                              Tipo: {f.type} {f.options && `(${f.options.join(", ")})`}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFieldFromTemplate(f.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-full"
                          >
                            <X className="h-4.5 w-4.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="pt-4 border-t border-border/50">
              <Button
                type="button"
                variant="ghost"
                onClick={closeBuilder}
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                className="font-semibold"
              >
                {(createTemplateMutation.isPending || updateTemplateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                )}
                Salvar Modelo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog ("Criar um Novo") */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Plus className="h-5 w-5 text-primary" />
              Adicionar Documento ({activeTab === "anamnese" ? "Anamnese" : activeTab === "orcamento" ? "Orçamento" : "Contrato"})
            </DialogTitle>
            <DialogDescription>
              Fazer upload de um arquivo existente e associar ao lead selecionado.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="upload-title">Nome do Documento</Label>
              <Input
                id="upload-title"
                type="text"
                placeholder={`Ex: ${activeTab === "anamnese" ? "Anamnese Corporal, Histórico Clínico" : activeTab === "orcamento" ? "Proposta de Consultoria" : "Contrato Assinado"}`}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="upload-negotiation">Associar ao Lead / Negociação</Label>
              {negotiations.length === 0 ? (
                <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Nenhuma negociação encontrada no CRM. Crie um lead primeiro.
                </div>
              ) : (
                <Select value={selectedNegotiationId} onValueChange={setSelectedNegotiationId}>
                  <SelectTrigger id="upload-negotiation" className="w-full">
                    <SelectValue placeholder="Selecione o lead associado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {negotiations.map((neg) => (
                      <SelectItem key={neg.id} value={neg.id}>
                        {neg.title} {neg.customer?.nome ? `(${neg.customer.nome})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Selecionar Arquivo (Máx. 25 MB)</Label>
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 transition-colors p-6 rounded-lg bg-muted/20 relative cursor-pointer group">
                <input
                  id="file-selector"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <File className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                {selectedFile ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground truncate max-w-[320px]">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatBytes(selectedFile.size)}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      Clique para escolher o arquivo
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF, Excel, Imagem ou qualquer outro formato
                    </p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-border/50">
              <Button
                id="btn-upload-cancel"
                type="button"
                variant="ghost"
                onClick={() => setUploadOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                id="btn-upload-submit"
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-1.5 font-semibold"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Arquivo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Custom Document Dialog ("Criar Personalizado") */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Sparkles className="h-5 w-5 text-primary" />
              Criar Documento Personalizado ({activeTab === "anamnese" ? "Anamnese" : activeTab === "orcamento" ? "Orçamento" : "Contrato"})
            </DialogTitle>
            <DialogDescription>
              Selecione um modelo pronto, preencha as variáveis automaticamente com o lead e edite o texto.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCustomSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="custom-negotiation">1. Selecionar o Lead</Label>
                {negotiations.length === 0 ? (
                  <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                    Crie um lead primeiro no CRM.
                  </div>
                ) : (
                  <Select value={customNegotiationId} onValueChange={handleCustomNegotiationChange}>
                    <SelectTrigger id="custom-negotiation" className="w-full">
                      <SelectValue placeholder="Selecione o lead..." />
                    </SelectTrigger>
                    <SelectContent>
                      {negotiations.map((neg) => (
                        <SelectItem key={neg.id} value={neg.id}>
                          {neg.title} {neg.customer?.nome ? `(${neg.customer.nome})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="custom-template">2. Modelo Pronto</Label>
                {templatesForSelectedTab.length === 0 ? (
                  <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                    Nenhum modelo cadastrado para esta aba. Crie um modelo na aba "Modelos" primeiro.
                  </div>
                ) : (
                  <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger id="custom-template" className="w-full">
                      <SelectValue placeholder="Selecione um modelo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templatesForSelectedTab.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="custom-title">Título do Documento</Label>
              <Input
                id="custom-title"
                type="text"
                placeholder="Ex: Ficha de Avaliação - Raphael Rego"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="custom-content">Conteúdo do Documento</Label>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/60 px-2 py-0.5 rounded-full border border-border">
                  Variáveis automáticas substituídas
                </span>
              </div>
              <Textarea
                id="custom-content"
                value={documentContent}
                onChange={(e) => setDocumentContent(e.target.value)}
                placeholder="Selecione um modelo ou digite o texto do documento aqui..."
                rows={10}
                className="font-mono text-xs leading-relaxed border-border bg-background focus:ring-1"
                required
              />
            </div>

            <DialogFooter className="pt-4 border-t border-border/50">
              <Button
                id="btn-custom-cancel"
                type="button"
                variant="ghost"
                onClick={() => setCustomOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                id="btn-custom-submit"
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-1.5 font-semibold"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <FileSignature className="h-4 w-4" />
                Gerar e Salvar Documento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link Generator Dialog ("Gerar Link de Envio") */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-emerald-600" />
              Gerar Link de Ficha de Anamnese
            </DialogTitle>
            <DialogDescription>
              Selecione o lead e qual modelo de anamnese deseja enviar para o cliente preencher.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="link-negotiation">1. Selecione o Lead / Negociação</Label>
              {negotiations.length === 0 ? (
                <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                  Nenhuma negociação encontrada no CRM.
                </div>
              ) : (
                <Select value={linkNegotiationId} onValueChange={setLinkNegotiationId}>
                  <SelectTrigger id="link-negotiation" className="w-full">
                    <SelectValue placeholder="Selecione o lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    {negotiations.map((neg) => (
                      <SelectItem key={neg.id} value={neg.id}>
                        {neg.title} {neg.customer?.nome ? `(${neg.customer.nome})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="link-template">2. Modelo de Anamnese</Label>
              <Select value={linkTemplateId} onValueChange={setLinkTemplateId}>
                <SelectTrigger id="link-template" className="w-full">
                  <SelectValue placeholder="Selecione o formulário..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Ficha Capilar Padrão (Aline Ferreira)</SelectItem>
                  {anamneseTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {generatedAnamneseLink && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="flex flex-col gap-1.5">
                  <Label>Link Público Gerado</Label>
                  <div className="flex gap-2">
                    <Input
                      id="input-generated-link"
                      value={generatedAnamneseLink}
                      readOnly
                      className="bg-muted text-xs font-mono select-all"
                    />
                    <Button onClick={handleCopyLink} size="sm" className="shrink-0 font-semibold">
                      Copiar
                    </Button>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleWhatsAppSend}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    Enviar por WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-border/50">
            <Button
              id="btn-link-cancel"
              type="button"
              variant="ghost"
              onClick={() => {
                setLinkOpen(false);
                setLinkNegotiationId("");
                setLinkTemplateId("default");
              }}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Orçamento Link Generator Dialog ("Gerar Link de Orçamento") */}
      <Dialog open={orcamentoLinkOpen} onOpenChange={setOrcamentoLinkOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-emerald-600" />
              Gerar Link de Orçamento
            </DialogTitle>
            <DialogDescription>
              Selecione o lead e preencha os detalhes técnicos para gerar a proposta comercial e o link de aprovação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-2">
              <Label htmlFor="orc-link-negotiation">1. Selecione o Lead / Negociação</Label>
              {negotiations.length === 0 ? (
                <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                  Nenhuma negociação encontrada no CRM.
                </div>
              ) : (
                <Select value={orcamentoLinkNegotiationId} onValueChange={val => {
                  setOrcamentoLinkNegotiationId(val);
                  const selected = negotiations.find((n) => n.id === val);
                  if (selected && selected.totalValue > 0) {
                    setOrcamentoValorTotal(String(selected.totalValue));
                  }
                }}>
                  <SelectTrigger id="orc-link-negotiation" className="w-full">
                    <SelectValue placeholder="Selecione o lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    {negotiations.map((neg) => (
                      <SelectItem key={neg.id} value={neg.id}>
                        {neg.title} {neg.customer?.nome ? `(${neg.customer.nome})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="orc-link-template">2. Selecione o Modelo de Orçamento</Label>
              <Select value={orcamentoTemplateId} onValueChange={(val) => {
                setOrcamentoTemplateId(val);
                setOrcamentoAnswers({});
              }}>
                <SelectTrigger id="orc-link-template" className="w-full">
                  <SelectValue placeholder="Selecione o modelo de orçamento..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Orçamento Capilar Padrão</SelectItem>
                  {orcamentoTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {orcamentoTemplateId === "default" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="orc-tamanho">Tamanho do Cabelo</Label>
                    <Input
                      id="orc-tamanho"
                      placeholder="Ex: 60cm"
                      value={orcamentoTamanho}
                      onChange={(e) => setOrcamentoTamanho(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="orc-peso">Peso (g)</Label>
                    <Input
                      id="orc-peso"
                      placeholder="Ex: 150g"
                      value={orcamentoPeso}
                      onChange={(e) => setOrcamentoPeso(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="orc-cor">Cabelo / Cor</Label>
                  <Input
                    id="orc-cor"
                    placeholder="Ex: Loiro Mesclado / Castanho Escuro"
                    value={orcamentoCabeloCor}
                    onChange={(e) => setOrcamentoCabeloCor(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="orc-obs">Observações Adicionais</Label>
                  <Textarea
                    id="orc-obs"
                    placeholder="Ex: Preparação com queratina, aplicação em micropele..."
                    value={orcamentoObs}
                    onChange={(e) => setOrcamentoObs(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-3 pt-2 border-t border-border/50">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Campos do Modelo Selecionado</span>
                {dbTemplates.find(t => t.id === orcamentoTemplateId)?.fields.map((field) => (
                  <div key={field.id} className="flex flex-col gap-1.5">
                    <Label htmlFor={`orc-f-${field.id}`}>{field.label}</Label>
                    {field.type === "textarea" ? (
                      <Textarea
                        id={`orc-f-${field.id}`}
                        value={orcamentoAnswers[field.id] || ""}
                        onChange={(e) => setOrcamentoAnswers({ ...orcamentoAnswers, [field.id]: e.target.value })}
                        rows={2}
                      />
                    ) : (
                      <Input
                        id={`orc-f-${field.id}`}
                        type={field.type === "number" ? "number" : "text"}
                        value={orcamentoAnswers[field.id] || ""}
                        onChange={(e) => setOrcamentoAnswers({ ...orcamentoAnswers, [field.id]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orc-valor">Valor Total do Orçamento (R$)</Label>
              <Input
                id="orc-valor"
                type="text"
                placeholder="Ex: R$ 2.500"
                value={orcamentoValorTotal}
                onChange={(e) => {
                  const val = e.target.value;
                  const clean = val.replace(/\D/g, "");
                  if (!clean) {
                    setOrcamentoValorTotal("");
                  } else {
                    setOrcamentoValorTotal(new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    }).format(Number(clean)));
                  }
                }}
              />
            </div>

            {generatedOrcamentoLink && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="flex flex-col gap-1.5">
                  <Label>Link de Aprovação Gerado</Label>
                  <div className="flex gap-2">
                    <Input
                      id="input-orc-generated-link"
                      value={generatedOrcamentoLink}
                      readOnly
                      className="bg-muted text-xs font-mono select-all"
                    />
                    <Button onClick={handleCopyOrcamentoLink} size="sm" className="shrink-0 font-semibold">
                      Copiar
                    </Button>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleWhatsAppOrcamentoSend}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    Enviar por WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-border/50">
            <Button
              id="btn-orc-link-cancel"
              type="button"
              variant="ghost"
              onClick={() => {
                setOrcamentoLinkOpen(false);
                setOrcamentoLinkNegotiationId("");
                setOrcamentoTamanho("");
                setOrcamentoPeso("");
                setOrcamentoCabeloCor("");
                setOrcamentoObs("");
                setOrcamentoValorTotal("");
                setOrcamentoTemplateId("default");
                setOrcamentoAnswers({});
              }}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5.5 w-5.5" />
              Excluir Documento?
            </DialogTitle>
            <DialogDescription className="pt-2 text-muted-foreground leading-relaxed">
              Tem certeza que deseja excluir permanentemente este documento? Esta ação não pode ser desfeita e removerá o arquivo do armazenamento do sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
            <Button
              id="btn-delete-cancel"
              type="button"
              variant="ghost"
              onClick={() => {
                setDeleteId(null);
                setDeleteNegotiationId(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              id="btn-delete-confirm"
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1 font-semibold"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
