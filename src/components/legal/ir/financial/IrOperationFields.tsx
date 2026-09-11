import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { LegalField } from "../../LegalShared";
import { selectClassName } from "../../legal-ui";

export function OperationTextField({ label, value, onChange, type = "text", required = false, multiline = false, hint, maxLength = 4000 }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; multiline?: boolean; hint?: string; maxLength?: number }) {
  return <LegalField label={label} hint={hint}>{(id) => multiline ? <Textarea id={id} value={value} required={required} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /> : <Input id={id} type={type} value={value} required={required} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}</LegalField>;
}
export function OperationSelectField({ label, value, onChange, options, required = false, hint }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; required?: boolean; hint?: string }) {
  return <LegalField label={label} hint={hint}>{(id) => <select id={id} className={selectClassName} value={value} onChange={(event) => onChange(event.target.value)} required={required}><option value="">Selecione</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</LegalField>;
}
export function OperationSaveFooter({ pending, disabled, onClose, label }: { pending: boolean; disabled?: boolean; onClose: () => void; label: string }) {
  return <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button><Button type="submit" disabled={pending || disabled}>{label}</Button></DialogFooter>;
}
