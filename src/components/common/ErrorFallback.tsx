import { Button } from "@/components/ui/button";

type Props = {
  onReset: () => void;
};

/** Friendly full-screen fallback shown by ErrorBoundary when a render crashes. */
export function ErrorFallback({ onReset }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <h1 className="text-xl font-semibold text-foreground">
        Ops, algo não saiu como esperado.
      </h1>
      <p className="text-muted-foreground text-sm max-w-md">
        Encontramos um problema inesperado ao carregar esta parte do aplicativo. Você
        pode tentar novamente ou recarregar a página.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" onClick={onReset}>
          Tentar novamente
        </Button>
        <Button onClick={() => window.location.reload()}>Recarregar página</Button>
      </div>
    </div>
  );
}
