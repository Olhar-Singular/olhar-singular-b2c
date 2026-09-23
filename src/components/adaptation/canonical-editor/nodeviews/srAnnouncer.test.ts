import { describe, it, expect, beforeEach, vi } from "vitest";
import { announceOnSheet } from "./srAnnouncer";

/** Espera a região viva existir com o texto pedido (o texto é escrito numa tarefa seguinte). */
const waitForRegion = () =>
  vi.waitFor(() => {
    const region = document.querySelector<HTMLElement>('[role="status"][aria-live="polite"]');
    if (!region || !region.textContent) throw new Error("sem anúncio");
    return region;
  });

describe("announceOnSheet (achado 0256)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("cria uma região viva sr-only no body e escreve a mensagem nela", async () => {
    announceOnSheet("Questão 1 excluída");
    const region = await waitForRegion();
    expect(region.className).toContain("sr-only");
    expect(region.parentElement).toBe(document.body);
    expect(region.textContent).toBe("Questão 1 excluída");
  });

  it("monta a região ANTES de escrever o texto (região inserida junto com o texto não é anunciada)", () => {
    announceOnSheet("Imagem excluída");
    const region = document.querySelector<HTMLElement>('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe("");
  });

  it("reaproveita a mesma região em anúncios seguidos", async () => {
    announceOnSheet("Questão 1 excluída");
    const first = await waitForRegion();
    announceOnSheet("Imagem excluída");
    await vi.waitFor(() => expect(first.textContent).toBe("Imagem excluída"));
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("muda o texto quando a mesma mensagem se repete (senão o segundo anúncio não dispara)", async () => {
    announceOnSheet("Questão 1 excluída");
    const region = await waitForRegion();
    announceOnSheet("Questão 1 excluída");
    await vi.waitFor(() => expect(region.textContent).not.toBe("Questão 1 excluída"));
    expect(region.textContent?.trim()).toBe("Questão 1 excluída");
  });

  it("não anuncia (nem cria região) com mensagem vazia", () => {
    announceOnSheet("");
    expect(document.querySelector('[role="status"]')).toBeNull();
  });
});
