import {
  executeSalesTool,
  loadSalesWorkflow,
  salesPersona,
  salesTools,
  type SalesWorkflow,
} from "../functions/_shared/ai-sales-workflow.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
function fixture(phase: SalesWorkflow["phase"] = "sdr"): SalesWorkflow {
  return {
    phase,
    revision: 0,
    answers: {},
    inboundId: "inbound-one",
    config: {
      enabled: true,
      sdr_name: "Davi",
      closer_name: "Clara",
      sdr_instructions: "",
      closer_instructions: "",
      template_approved: false,
      fee_terms: "",
      revision: 1,
    },
  };
}
Deno.test(
  "SDR and closer have different capabilities, without autonomous signature or legal approval",
  () => {
    const sdr = fixture();
    assert(
      salesTools(sdr)
        .map((t) => t.name)
        .join() === "record_intake",
      "SDR must only collect answers",
    );
    const closer = fixture("closer");
    assert(
      !salesTools(closer).some((t) => t.name === "prepare_contract"),
      "unapproved contract hidden",
    );
    closer.config.template_approved = true;
    assert(
      salesTools(closer).some((t) => t.name === "prepare_contract"),
      "approved draft available",
    );
    assert(
      !salesTools(closer).some((t) => /sign|approve/.test(t.name)),
      "no final legal approval tool",
    );
    closer.stopped = true;
    assert(
      salesTools(closer).length === 0,
      "stop further actions after transfer",
    );
  },
);
Deno.test(
  "transition persists next phase and stops the old agent",
  async () => {
    const workflow = fixture();
    const ctx = {
      tenantId: "tenant",
      chat: { id: "chat" },
      salesWorkflow: workflow,
      admin: {
        rpc: () =>
          Promise.resolve({
            data: { phase: "closer", revision: 1, answers: { consent: "yes" } },
            error: null,
          }),
      },
    };
    const result = await executeSalesTool(ctx as never, "record_intake", {
      consent: "yes",
    });
    assert(
      result.aborted && workflow.stopped && workflow.phase === "closer",
      "old agent stopped after transition",
    );
    assert(
      result.transitionNotice?.includes("Clara"),
      "announce configured closer",
    );
    assert(
      !result.transitionNotice?.includes("qualificado"),
      "no legal qualification claim",
    );
  },
);
Deno.test(
  "idempotency key ignores property order but separates different inbound messages",
  async () => {
    const workflow = fixture("closer");
    const keys: string[] = [];
    const ctx = {
      tenantId: "tenant",
      chat: { id: "chat" },
      salesWorkflow: workflow,
      admin: {
        rpc: (_name: string, params: { p_request_key: string }) => {
          keys.push(params.p_request_key);
          return Promise.resolve({
            data: { phase: "closer", revision: 1, answers: {} },
            error: null,
          });
        },
      },
    };
    await executeSalesTool(ctx as never, "record_intake", {
      benefit: "retirement",
      pays_ir: "unknown",
    });
    await executeSalesTool(ctx as never, "record_intake", {
      pays_ir: "unknown",
      benefit: "retirement",
    });
    workflow.inboundId = "inbound-two";
    await executeSalesTool(ctx as never, "record_intake", {
      pays_ir: "unknown",
      benefit: "retirement",
    });
    assert(
      keys[0] === keys[1] && keys[1] !== keys[2],
      "stable retry key bound to inbound",
    );
  },
);
Deno.test(
  "database refusal is not presented as successful preparation",
  async () => {
    const workflow = fixture("closer");
    workflow.config.template_approved = true;
    const ctx = {
      tenantId: "tenant",
      chat: { id: "chat" },
      salesWorkflow: workflow,
      admin: {
        rpc: () =>
          Promise.resolve({
            data: null,
            error: { message: "Interesse pendente" },
          }),
      },
    };
    const result = await executeSalesTool(ctx as never, "prepare_contract", {});
    assert(result.isError && workflow.revision === 0, "no optimistic success");
  },
);
Deno.test(
  "configuration failure is fail closed, not silent fallback to another persona",
  async () => {
    const query = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: null, error: { message: "offline" } });
      },
    };
    let rejected = false;
    try {
      await loadSalesWorkflow({
        tenantId: "tenant",
        chat: {},
        admin: { from: () => query },
      } as never);
    } catch {
      rejected = true;
    }
    assert(rejected, "configuration error must stop automation");
  },
);
Deno.test("personas disclose unavailable integrations", () => {
  const prompt = salesPersona(fixture("closer"));
  assert(prompt.includes("NÃO CONFIGURADA"), "signature status explicit");
  assert(prompt.includes("Não faça diagnóstico"), "non-diagnostic scope");
});
