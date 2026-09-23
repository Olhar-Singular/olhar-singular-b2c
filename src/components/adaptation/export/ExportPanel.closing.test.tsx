/**
 * 0129 — o diálogo "o que não vai para o <formato>" não pode trocar de
 * identidade enquanto fecha.
 *
 * O conteúdo do AlertDialog do shadcn/Radix continua montado durante a animação
 * de saída (200 ms). Nesse intervalo `pending` já é `null`, e um render que
 * leia `pending` direto mostra o título do Word com a lista de avisos vazia.
 *
 * O jsdom não anima: o Radix desmonta o conteúdo no mesmo commit e a janela do
 * bug simplesmente não existe. Por isso este arquivo troca as primitivas do
 * diálogo por stubs que mantêm o conteúdo montado — é exatamente a condição do
 * browser real — e por isso ele mora fora de `ExportPanel.test.tsx` (o
 * `vi.mock` vale para o arquivo inteiro).
 */

import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/components/ui/alert-dialog", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    // Ignora `open`: o conteúdo fica montado, como na animação de saída.
    AlertDialog: Passthrough,
    AlertDialogContent: ({ children }: { children?: ReactNode }) => (
      <div role="alertdialog">{children}</div>
    ),
    AlertDialogHeader: Passthrough,
    AlertDialogFooter: Passthrough,
    AlertDialogTitle: ({ children }: { children?: ReactNode }) => (
      <h2>{children}</h2>
    ),
    AlertDialogDescription: ({ children }: { children?: ReactNode }) => (
      <>{children}</>
    ),
    AlertDialogCancel: ({ children }: { children?: ReactNode }) => (
      <button>{children}</button>
    ),
    AlertDialogAction: ({
      children,
      onClick,
    }: {
      children?: ReactNode;
      onClick?: () => void;
    }) => <button onClick={onClick}>{children}</button>,
  };
});

const { ExportPanel } = await import("./ExportPanel");

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const mathDocument: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [{ id: id(1), type: "blockMath", latex: "a^2 + b^2 = c^2" }],
};

describe("diálogo de exportação enquanto fecha (0129)", () => {
  it("continua falando do PDF, com os avisos na lista, depois de confirmar", async () => {
    render(
      <ExportPanel
        document={mathDocument}
        onDownload={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("O que não vai para o PDF");
    const avisos = dialog.querySelectorAll("li").length;
    expect(avisos).toBeGreaterThan(0);

    // "Baixar mesmo assim" zera `pending`; o conteúdo segue montado.
    fireEvent.click(
      screen.getByRole("button", { name: /Baixar mesmo assim/i }),
    );

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "O que não vai para o PDF",
    );
    expect(screen.getByRole("alertdialog").querySelectorAll("li")).toHaveLength(
      avisos,
    );
  });

  it("antes de qualquer exportação não existe conteúdo de diálogo montado", () => {
    render(<ExportPanel document={mathDocument} onDownload={vi.fn()} />);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
