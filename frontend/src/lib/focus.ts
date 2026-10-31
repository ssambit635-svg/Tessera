import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * A modal surface that behaves like one.
 *
 * - focus moves inside on open and returns to the trigger on close
 * - Tab / Shift+Tab cycle inside the panel instead of escaping to the page behind
 * - Escape closes, and the panel is announced as a dialog
 *
 * Without this a drawer is a visual illusion: keyboard users keep tabbing through the board
 * underneath it, which is why the old review measured "88 tabs to the first tile".
 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);

    // Move focus to the panel itself if nothing inside claims it first.
    const first = items()[0];
    (first ?? node).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const head = list[0];
      const tail = list[list.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (current === head || !node.contains(current))) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && (current === tail || !node.contains(current))) {
        event.preventDefault();
        head.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previous?.focus?.({ preventScroll: true });
    };
  }, [ref, onClose, active]);
}
