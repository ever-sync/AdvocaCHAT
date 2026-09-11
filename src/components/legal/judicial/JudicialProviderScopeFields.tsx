import { useState } from "react";
import { LegalField } from "../LegalShared";
import { JudicialText } from "./JudicialShared";
export function JudicialProviderScopeFields({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange(value: Record<string, unknown>): void;
}) {
  const [origins, setOrigins] = useState(
    Array.isArray(value.origins_ids) ? value.origins_ids.join(", ") : "",
  );
  const field = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : "";
  return (
    <fieldset className="space-y-4 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">
        Escopo expressamente autorizado
      </legend>
      <JudicialText
        label="Tribunal da autorização"
        value={field("court")}
        onChange={(court) => onChange({ ...value, court })}
        maxLength={200}
        hint="Deve coincidir com o tribunal cadastrado no processo. Use * somente se a documentação aprovada abranger expressamente todos os tribunais."
      />
      <JudicialText
        label="UF da OAB abrangida"
        value={field("oab_state")}
        onChange={(oab_state) =>
          onChange({ ...value, oab_state: oab_state.toUpperCase() })
        }
        maxLength={2}
        hint="Preencha para descoberta por OAB. * exige autorização documental para todas as UFs."
      />
      <LegalField
        label="Identificadores dos diários autorizados"
        hint="IDs positivos separados por vírgula, conforme o fornecedor. Necessários para monitoramento de diário."
      >
        {(id) => (
          <input
            id={id}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={origins}
            maxLength={240}
            pattern="[ ]*[1-9][0-9]{0,9}([ ]*,[ ]*[1-9][0-9]{0,9})*[ ]*"
            onChange={(event) => {
              const text = event.target.value;
              setOrigins(text);
              const pieces = text
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
              if (pieces.every((x) => /^[1-9][0-9]{0,9}$/.test(x)))
                onChange({ ...value, origins_ids: pieces.map(Number) });
            }}
          />
        )}
      </LegalField>
      <JudicialText
        label="Fundamento, alcance e ressalvas do escopo"
        value={field("note")}
        onChange={(note) => onChange({ ...value, note })}
        multiline
        maxLength={4000}
      />
    </fieldset>
  );
}
