import { AlertTriangle, Edit2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ClientWarning {
  type: "no_unit" | "no_esn" | "esn_email_mismatch";
  message: string;
}

interface Props {
  warnings: ClientWarning[];
  onEditClient: () => void;
}

export function getClientWarnings(
  client: any,
  salesTeam: any[],
  userEmail: string | undefined
): ClientWarning[] {
  const warnings: ClientWarning[] = [];

  if (!client.unit_id) {
    warnings.push({
      type: "no_unit",
      message: "Este cliente não possui unidade vinculada. O fator de imposto não será aplicado.",
    });
  }

  if (!client.esn_id) {
    warnings.push({
      type: "no_esn",
      message: "Este cliente não possui Executivo de Vendas (ESN) vinculado.",
    });
  } else if (userEmail) {
    const esn = salesTeam.find((m) => m.id === client.esn_id);
    if (esn && esn.email && esn.email.toLowerCase() !== userEmail.toLowerCase()) {
      warnings.push({
        type: "esn_email_mismatch",
        message: `O ESN vinculado ao cliente (${esn.name} - ${esn.email}) não corresponde ao seu e-mail (${userEmail}).`,
      });
    }
  }

  return warnings;
}

export default function ClientValidationAlerts({ warnings, onEditClient }: Props) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <Alert key={i} className="border-warning/40 bg-warning/10 text-warning [&>svg]:text-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span className="text-sm">{w.message}</span>
            {i === 0 && (
              <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={onEditClient}>
                <Edit2 className="mr-1 h-3 w-3" /> Editar Cliente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
