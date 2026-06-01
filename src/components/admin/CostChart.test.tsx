import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CostChart } from "./CostChart";

// Deterministic recharts stubs. The axis/tooltip stubs invoke the formatter
// callbacks so those inline functions are exercised.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="linechart" data-points={data.length}>
      {children}
    </div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="xaxis" />,
  YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => string }) => (
    <div data-testid="yaxis">{tickFormatter ? tickFormatter(10) : null}</div>
  ),
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: ({ formatter }: { formatter?: (v: number) => string }) => (
    <div data-testid="tooltip">{formatter ? formatter(10) : null}</div>
  ),
}));

const daily = [
  { bucket: "2026-06-01T00:00:00Z", cost: 1.5 },
  { bucket: "not-a-date", cost: 2 },
];
const monthly = [{ bucket: "2026-06-01T00:00:00Z", cost: 9 }];

describe("CostChart", () => {
  it("renders the daily series by default and toggles to monthly and back", () => {
    render(<CostChart daily={daily} monthly={monthly} />);

    expect(screen.getByText("Custo de IA (USD)")).toBeInTheDocument();
    expect(screen.getByTestId("linechart").getAttribute("data-points")).toBe("2");
    // formatter callbacks rendered the USD string
    expect(screen.getByTestId("yaxis").textContent).toBe("$10.00");
    expect(screen.getByTestId("tooltip").textContent).toBe("$10.00");

    fireEvent.click(screen.getByRole("button", { name: "Mensal" }));
    expect(screen.getByTestId("linechart").getAttribute("data-points")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Diário" }));
    expect(screen.getByTestId("linechart").getAttribute("data-points")).toBe("2");
  });

  it("shows an empty state when there is no data", () => {
    render(<CostChart daily={[]} monthly={[]} />);
    expect(screen.getByText("Sem dados de custo no período.")).toBeInTheDocument();
    expect(screen.queryByTestId("linechart")).not.toBeInTheDocument();
  });
});
