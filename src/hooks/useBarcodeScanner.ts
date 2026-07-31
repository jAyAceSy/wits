import { useEffect, type RefObject } from 'react'

/**
 * Honeywell / USB / Bluetooth handheld scanners all emulate a keyboard:
 * they "type" the barcode very fast and finish with an Enter (or Tab).
 * Because of that, this hook does NOT try to intercept raw keystrokes —
 * it simply keeps the barcode <input> focused so the OS-level keyboard
 * event stream from the scanner always lands in the right field, and lets
 * the browser's normal onChange/onKeyDown handle the rest.
 *
 * `active` should be false whenever a modal/dialog is open or a text field
 * that needs real typing (e.g. Remarks) is focused, so the scanner doesn't
 * fight the user for focus.
 */
export function useBarcodeScannerFocus(
  inputRef: RefObject<HTMLInputElement>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return

    // Focus immediately on mount / when re-activated.
    inputRef.current?.focus()

    function handleDocumentClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      // Don't steal focus away from other interactive elements the user
      // deliberately clicked (buttons, other inputs/selects/textareas).
      const isInteractive = target.closest('input, select, textarea, button, a, [role="dialog"]')
      if (!isInteractive) {
        inputRef.current?.focus()
      }
    }

    // If focus lands somewhere unexpected (e.g. body) after a re-render,
    // pull it back so continuous scanning never requires the mouse.
    function handleFocusOut() {
      window.setTimeout(() => {
        const active = document.activeElement
        if (active === document.body) {
          inputRef.current?.focus()
        }
      }, 50)
    }

    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [inputRef, active])
}
