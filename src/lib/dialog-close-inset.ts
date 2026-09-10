/**
 * Horizontal padding (`padding-inline-end`) so content clears `DialogContent`'s built-in
 * close button (`absolute right-4 top-4`), used when the dialog surface has `p-0`.
 */
export const dialogCloseInset = {
  /** Header / titles / descriptive blocks beside the corner control */
  headerEnd: "pr-14",
  /** Single compact row next to the X (command search bar, toolbar, etc.) */
  compactRowEnd: "pr-12",
} as const;
