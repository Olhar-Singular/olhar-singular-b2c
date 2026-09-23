import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateUserDialog } from "./CreateUserDialog";

describe("CreateUserDialog", () => {
  async function open(onCreate = vi.fn(async () => ({ success: true }))) {
    const ue = userEvent.setup();
    render(<CreateUserDialog onCreate={onCreate} />);
    await ue.click(screen.getByRole("button", { name: /criar usuário/i }));
    await screen.findByRole("dialog");
    return { ue, onCreate };
  }

  it("validates name and e-mail before inviting", async () => {
    const { ue, onCreate } = await open();
    await ue.click(screen.getByRole("button", { name: /enviar convite/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/nome completo/);

    await ue.type(screen.getByLabelText(/nome completo/i), "Nova Pessoa");
    await ue.type(screen.getByLabelText(/^e-mail$/i), "nope");
    await ue.click(screen.getByRole("button", { name: /enviar convite/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/e-mail válido/);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("invites as trial by default, normalising the fields, and closes on success", async () => {
    const { ue, onCreate } = await open();
    await ue.type(screen.getByLabelText(/nome completo/i), " Nova Pessoa ");
    await ue.type(screen.getByLabelText(/^e-mail$/i), " Nova@X.com ");
    await ue.click(screen.getByRole("button", { name: /enviar convite/i }));
    expect(onCreate).toHaveBeenCalledWith({ email: "nova@x.com", fullName: "Nova Pessoa", mode: "trial" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("invites as courtesy when chosen", async () => {
    const { ue, onCreate } = await open();
    await ue.type(screen.getByLabelText(/nome completo/i), "Nova Pessoa");
    await ue.type(screen.getByLabelText(/^e-mail$/i), "nova@x.com");
    await ue.click(screen.getByRole("radio", { name: /cortesia/i }));
    await ue.click(screen.getByRole("button", { name: /enviar convite/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ mode: "exempt" }));
  });

  it("keeps the form open when the invite fails (hook toasts)", async () => {
    const { ue, onCreate } = await open(vi.fn(async () => { throw new Error("email_exists"); }));
    await ue.type(screen.getByLabelText(/nome completo/i), "Nova Pessoa");
    await ue.type(screen.getByLabelText(/^e-mail$/i), "nova@x.com");
    await ue.click(screen.getByRole("button", { name: /enviar convite/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^e-mail$/i)).toHaveValue("nova@x.com");
  });

  it("resets the form when closed", async () => {
    const { ue } = await open();
    await ue.type(screen.getByLabelText(/nome completo/i), "Nova Pessoa");
    await ue.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await ue.click(screen.getByRole("button", { name: /criar usuário/i }));
    expect(await screen.findByLabelText(/nome completo/i)).toHaveValue("");
  });

  it("can be disabled", () => {
    render(<CreateUserDialog onCreate={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /criar usuário/i })).toBeDisabled();
  });
});
