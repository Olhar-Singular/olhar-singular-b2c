import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorModeProvider, useEditorMode } from "./EditorMode";

function Probe() {
  return <span data-testid="mode">{useEditorMode()}</span>;
}

describe("EditorMode", () => {
  it("defaults to 'content' when no provider is present", () => {
    render(<Probe />);
    expect(screen.getByTestId("mode")).toHaveTextContent("content");
  });

  it("returns the provided value when wrapped in a provider", () => {
    render(
      <EditorModeProvider value="style">
        <Probe />
      </EditorModeProvider>
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("style");
  });
});
