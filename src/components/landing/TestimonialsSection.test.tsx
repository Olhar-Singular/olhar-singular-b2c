import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import TestimonialsSection from "./TestimonialsSection";
import { renderWithProviders } from "@/test/helpers";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.replace(/\./g, "").charAt(0))
    .join("")
    .toUpperCase();
}

describe("TestimonialsSection", () => {
  it("is a region labelled by its h2 heading", () => {
    renderWithProviders(<TestimonialsSection />);
    const heading = screen.getByRole("heading", { level: 2, name: "Quem já usa conta assim" });
    const region = screen.getByRole("region", { name: "Quem já usa conta assim" });
    expect(region).toContainElement(heading);
    expect(region).toHaveAttribute("aria-labelledby", heading.id);
    expect(heading).toHaveAttribute("id", "h-depoimentos");
  });

  it("lists exactly three quotes, each a figure with a blockquote and a signed caption", () => {
    renderWithProviders(<TestimonialsSection />);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) {
      const figure = within(item).getByRole("figure");
      const quote = figure.querySelector("blockquote");
      const caption = figure.querySelector("figcaption");
      expect(quote?.textContent?.trim().length).toBeGreaterThan(40);
      expect(caption?.textContent?.trim().length).toBeGreaterThan(0);
      // Name on one line, subject and city on the next: both must be there.
      expect(caption?.querySelectorAll("span.block")).toHaveLength(2);
    }
  });

  it("signs every quote with a first name and an initial, a subject and a city", () => {
    renderWithProviders(<TestimonialsSection />);
    const names = screen.getAllByTestId("testimonial-name").map((el) => el.textContent ?? "");
    const details = screen.getAllByTestId("testimonial-detail").map((el) => el.textContent ?? "");
    expect(names).toHaveLength(3);
    names.forEach((name) => expect(name).toMatch(/^[A-ZÁ-Ú][a-zá-ú]+ [A-Z]\.$/));
    details.forEach((detail) => expect(detail).toMatch(/^.+ · .+ \([A-Z]{2}\)$/));
    expect(new Set(names).size).toBe(3);
  });

  it("uses decorative initials as avatars, never a photo of a person", () => {
    const { container } = renderWithProviders(<TestimonialsSection />);
    expect(container.querySelector("img")).toBeNull();
    const avatars = screen.getAllByTestId("testimonial-avatar");
    const names = screen.getAllByTestId("testimonial-name").map((el) => el.textContent ?? "");
    expect(avatars).toHaveLength(3);
    avatars.forEach((avatar, i) => {
      expect(avatar).toHaveAttribute("aria-hidden", "true");
      expect(avatar.textContent).toBe(initialsOf(names[i]));
    });
  });

  it("has no template tokens, dashes, inline styles or placeholder text in what the visitor sees", () => {
    const { container } = renderWithProviders(<TestimonialsSection />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("{{");
    const dashes = new RegExp(`${String.fromCharCode(0x2014)}|${String.fromCharCode(0x2013)}`);
    expect(text).not.toMatch(dashes);
    expect(text).not.toMatch(/undefined|NaN|lorem|placeholder|exemplo de depoimento/i);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
