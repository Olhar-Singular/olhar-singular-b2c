import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import { requestConsentReopen } from "@/lib/analytics/consent";
import { isGtmAllowedOn } from "@/lib/analytics/gtm";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> & {
  /** Optional leading icon (menu items carry one, footers do not). */
  icon?: ReactNode;
  /**
   * Who gets the focus back after the decision, when not this button itself:
   * a menu item unmounts with the menu, so the menu names its trigger instead.
   */
  returnFocusTo?: RefObject<HTMLElement>;
};

// LGPD entry point: reopens the consent banner over a stored decision. A plain
// button styled by its host (className), never a link: it changes state, it
// does not navigate. Absent where the banner itself never shows (checkout and
// first-access password screen), so it is never a button that does nothing.
// forwardRef + onClick pass-through let a Radix DropdownMenuItem wrap it with asChild.
export const CookiePreferencesButton = forwardRef<HTMLButtonElement, Props>(function CookiePreferencesButton(
  { icon, onClick, returnFocusTo, ...rest },
  ref,
) {
  const { pathname } = useLocation();
  if (!isGtmAllowedOn(pathname)) return null;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    requestConsentReopen(returnFocusTo?.current ?? event.currentTarget);
  }

  return (
    <button ref={ref} type="button" {...rest} onClick={handleClick}>
      {icon}
      Preferências de cookies
    </button>
  );
});

export default CookiePreferencesButton;
