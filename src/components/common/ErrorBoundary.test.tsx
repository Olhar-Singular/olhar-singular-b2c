import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>conteúdo normal</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("conteúdo normal")).toBeInTheDocument();
  });

  it("renders the fallback UI when a child throws during render", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/algo não saiu como esperado/i)).toBeInTheDocument();
  });

  it("logs the captured error to the console", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("renders children again after clicking 'Tentar novamente'", () => {
    let shouldThrow = true;
    function Maybe() {
      if (shouldThrow) throw new Error("kaboom");
      return <p>recuperado</p>;
    }
    render(
      <ErrorBoundary>
        <Maybe />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/algo não saiu como esperado/i)).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(screen.getByText("recuperado")).toBeInTheDocument();
  });

  it("reloads the page when clicking 'Recarregar página'", () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /recarregar página/i }));
    expect(reload).toHaveBeenCalled();
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
});
