/** Plain text for the UI: drops *emphasis*, _emphasis_, bullets and stray asterisks the model adds anyway */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^[ \t]*[*-][ \t]+/gm, "")
    .replace(/(^|\s)_([^_\n]+?)_(?=\s|[.,!?]|$)/g, "$1$2")
    .replace(/\*+/g, "")
    .trim();
}
