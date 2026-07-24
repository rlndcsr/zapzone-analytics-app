// Minimal HTML → readable text + inline-image extraction for previews. The app
// has no WebView/HTML renderer, so template bodies are shown as clean text and
// any embedded <img> URLs are surfaced separately.

const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (m) => NAMED_ENTITIES[m] ?? m);
}

/** Strip HTML to readable text, turning block/`<br>` boundaries into line breaks. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<\s*(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\/\s*(?:p|div|li|h[1-6]|tr|section|header|footer|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Collect `<img src="…">` URLs embedded in an HTML body, in document order. */
export function extractImageSrcs(html: string): string[] {
  if (!html) return [];
  const out: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}
