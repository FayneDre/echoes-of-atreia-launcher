/**
 * Closes a modal `<dialog>` when the click falls beside it, on its backdrop. The dialog's own padding is the dialog too (`event.target` is
 * the same element there), so the click's place is compared with its box: a click in the padding leaves it open.
 */
export function closeOnBackdropClick(event: React.MouseEvent<HTMLDialogElement>): void {
  const dialog = event.currentTarget
  if (event.target !== dialog) {
    return
  }
  const box = dialog.getBoundingClientRect()
  const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
  if (!inside) {
    dialog.close()
  }
}
