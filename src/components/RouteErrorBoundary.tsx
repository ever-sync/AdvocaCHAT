import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearChunkReloadFlag,
  isChunkLoadError,
  reloadForChunkError,
} from "@/lib/chunk-load-recovery";

type Props = {
  children: ReactNode;
  title?: string;
};

type State = {
  error: Error | null;
  showError: boolean;
};

export class RouteErrorBoundary extends Component<Props, State> {
  private showErrorTimer: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { error: null, showError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, showError: false };
  }

  componentWillUnmount() {
    if (this.showErrorTimer !== null) {
      window.clearTimeout(this.showErrorTimer);
      this.showErrorTimer = null;
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RouteErrorBoundary]", error, info.componentStack);
    // Tab antiga + deploy novo: tenta recarregar automaticamente (uma vez/sessão).
    if (isChunkLoadError(error)) {
      reloadForChunkError();
      return;
    }

    if (this.showErrorTimer !== null) {
      window.clearTimeout(this.showErrorTimer);
    }
    this.showErrorTimer = window.setTimeout(() => {
      this.setState({ showError: true });
      this.showErrorTimer = null;
    }, 250);
  }

  render() {
    if (this.state.error && this.state.showError) {
      if (isChunkLoadError(this.state.error)) {
        return (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Nova versão disponível</h2>
              <p className="text-sm text-muted-foreground break-words">
                O app foi atualizado. Recarregue a página para continuar.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                clearChunkReloadFlag();
                window.location.reload();
              }}
            >
              Recarregar página
            </Button>
          </div>
        );
      }

      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              {this.props.title ?? "Algo deu errado nesta tela"}
            </h2>
            <p className="text-sm text-muted-foreground break-words">{this.state.error.message}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => this.setState({ error: null })}>
            Tentar novamente
          </Button>
        </div>
      );
    }

    if (this.state.error && !this.state.showError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <p className="text-sm text-muted-foreground">Aguarde, estamos ajustando esta tela...</p>
        </div>
      );
    }

    return this.props.children;
  }
}
