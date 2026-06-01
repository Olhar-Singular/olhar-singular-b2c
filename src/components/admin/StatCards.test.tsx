import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatCards } from "./StatCards";

const metrics = { total_usd: 12.5, today_usd: 0.0123, month_usd: 3, daily: [], monthly: [] };

describe("StatCards", () => {
  it("renders the three cost cards with formatted USD values", () => {
    render(<StatCards metrics={metrics} />);

    expect(screen.getByText("Custo total (IA)")).toBeInTheDocument();
    expect(screen.getByText("Custo hoje")).toBeInTheDocument();
    expect(screen.getByText("Custo no mês")).toBeInTheDocument();

    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    expect(screen.getByText("$3.00")).toBeInTheDocument();
  });
});
