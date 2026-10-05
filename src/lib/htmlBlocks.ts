// HTML email body → a flat list of blocks the app can draw with plain React
// Native views. The app has no WebView (adding one needs a new native build,
// which over-the-air updates cannot deliver), so the web's rendered preview —
// `dangerouslySetInnerHTML` of a template body — is rebuilt from what the
// web's rich-text editor actually produces: paragraphs and divs, headings,
// quotes, lists, line breaks, images, links and inline bold / italic /
// underline / strike / colour / highlight.

import { decodeEntities } from "./htmlText.ts";

export type HtmlAlign = "left" | "center" | "right";

/** A stretch of text with one set of inline styles. */
export type HtmlRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Text colour as written in the HTML (#hex / rgb() / name). */
  color?: string;
  /** Background highlight colour. */
  highlight?: string;
  /** Target of an enclosing <a>. */
  href?: string;
};

export type HtmlTextStyle = "p" | "h1" | "h2" | "h3" | "quote" | "li";

/**
 * The vertical margin of the element a block sits in, as the web preview draws
 * it: paragraphs, headings and quotes are spaced apart, list items slightly, and
 * plain `<div>` lines (what the rich-text editor writes for each new line) not
 * at all. Neighbouring margins collapse, as in CSS.
 */
export type HtmlSpacing = "none" | "list" | "paragraph";

export type HtmlBlock = { spacing: HtmlSpacing } & (
  | {
      kind: "text";
      style: HtmlTextStyle;
      align?: HtmlAlign;
      runs: HtmlRun[];
      /** List items: "•" for <ul>, "1." / "2." … for <ol>. */
      marker?: string;
    }
  | {
      kind: "image";
      src: string;
      alt: string;
      align?: HtmlAlign;
      /** Explicit width: pixels, or a fraction (0–1] of the body for "%". */
      widthPx?: number;
      widthFraction?: number;
      href?: string;
    }
  /** An empty line — the editor's `<p><br></p>` or `<div><br></div>`. */
  | { kind: "spacer" }
  | { kind: "rule" }
);

const PARAGRAPH_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "figure", "address", "dl",
]);

type Inline = Omit<HtmlRun, "text">;

type OpenTag = {
  tag: string;
  inline: Inline;
  /** Set on block-level tags only. */
  block?: { style?: HtmlTextStyle; align?: HtmlAlign };
};

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside",
  "center", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "ul", "ol", "table", "tbody", "thead", "tfoot", "tr", "td", "th",
  "figure", "figcaption", "address", "dl", "dt", "dd",
]);

const VOID_TAGS = new Set(["br", "img", "hr", "meta", "link", "input", "col", "wbr", "source"]);

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  if (!m) return undefined;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
}

function styleProp(style: string | undefined, prop: string): string | undefined {
  if (!style) return undefined;
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(style);
  return m ? m[1].trim().replace(/\s*!important$/i, "") : undefined;
}

function parseAlign(value: string | undefined): HtmlAlign | undefined {
  const v = value?.trim().toLowerCase();
  if (v === "center" || v === "right" || v === "left") return v;
  if (v === "justify" || v === "start") return "left";
  if (v === "end") return "right";
  return undefined;
}

/** Inline styles a tag and its `style` attribute add on top of its parents'. */
function inlineFor(tag: string, attrs: string): Inline {
  const style = attr(attrs, "style");
  const out: Inline = {};
  if (tag === "b" || tag === "strong") out.bold = true;
  if (tag === "i" || tag === "em") out.italic = true;
  if (tag === "u" || tag === "ins") out.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") out.strike = true;
  if (tag === "mark") out.highlight = "#FEF08A";
  if (tag === "a") {
    const href = attr(attrs, "href")?.trim();
    if (href) out.href = href;
  }
  if (tag === "font") {
    const color = attr(attrs, "color");
    if (color) out.color = color;
  }

  const weight = styleProp(style, "font-weight")?.toLowerCase();
  if (weight === "bold" || weight === "bolder" || (weight && Number(weight) >= 600)) {
    out.bold = true;
  } else if (weight === "normal" || (weight && Number(weight) > 0 && Number(weight) < 600)) {
    out.bold = false;
  }
  const fontStyle = styleProp(style, "font-style")?.toLowerCase();
  if (fontStyle === "italic" || fontStyle === "oblique") out.italic = true;
  const decoration = styleProp(style, "text-decoration")?.toLowerCase()
    ?? styleProp(style, "text-decoration-line")?.toLowerCase();
  if (decoration?.includes("underline")) out.underline = true;
  if (decoration?.includes("line-through")) out.strike = true;
  const color = styleProp(style, "color");
  if (color) out.color = color;
  // A block's own background is its box, not highlighted text.
  if (!BLOCK_TAGS.has(tag)) {
    const bg = styleProp(style, "background-color") ?? styleProp(style, "background");
    if (bg && !/^(transparent|none|initial|inherit)$/i.test(bg)) out.highlight = bg;
  }
  return out;
}

function blockStyleFor(tag: string): HtmlTextStyle | undefined {
  if (tag === "h1") return "h1";
  if (tag === "h2") return "h2";
  if (/^h[3-6]$/.test(tag)) return "h3";
  if (tag === "blockquote") return "quote";
  if (tag === "li") return "li";
  return undefined;
}

/** "300", "300px", "50%" → a pixel width or a fraction of the body. */
function parseWidth(raw: string | undefined): { px?: number; fraction?: number } {
  const v = raw?.trim().toLowerCase();
  if (!v) return {};
  const pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(v);
  if (pct) {
    const f = Number(pct[1]) / 100;
    return f > 0 ? { fraction: Math.min(f, 1) } : {};
  }
  const px = /^(\d+(?:\.\d+)?)\s*(?:px)?$/.exec(v);
  if (px) {
    const n = Number(px[1]);
    return n > 0 ? { px: n } : {};
  }
  return {};
}

const sameInline = (a: Inline, b: Inline) =>
  !!a.bold === !!b.bold &&
  !!a.italic === !!b.italic &&
  !!a.underline === !!b.underline &&
  !!a.strike === !!b.strike &&
  a.color === b.color &&
  a.highlight === b.highlight &&
  a.href === b.href;

/** Parse an HTML email body into drawable blocks, in document order. */
export function parseHtmlBlocks(html: string): HtmlBlock[] {
  if (!html) return [];
  const source = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");

  const blocks: HtmlBlock[] = [];
  const stack: OpenTag[] = [];
  const lists: { ordered: boolean; count: number }[] = [];

  let runs: HtmlRun[] = [];
  let sawBreak = false;
  let marker: string | undefined;

  const currentInline = (): Inline => {
    const merged: Inline = {};
    for (const open of stack) Object.assign(merged, open.inline);
    if (merged.bold === false) delete merged.bold;
    return merged;
  };
  const currentBlock = () => {
    let style: HtmlTextStyle = "p";
    let align: HtmlAlign | undefined;
    let container: string | undefined;
    for (const open of stack) {
      if (!open.block) continue;
      container = open.tag;
      if (open.block.style) style = open.block.style;
      if (open.block.align) align = open.block.align;
    }
    const spacing: HtmlSpacing =
      container === "li"
        ? "list"
        : container && PARAGRAPH_TAGS.has(container)
          ? "paragraph"
          : "none";
    return { style, align, spacing };
  };

  const pushText = (text: string, inline: Inline) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && sameInline(last, inline)) last.text += text;
    else runs.push({ ...inline, text });
  };

  const flush = () => {
    // HTML whitespace: spaces around a line break and at the block's edges vanish.
    const cleaned = runs
      .map((r) => ({ ...r, text: r.text.replace(/ *\n */g, "\n") }))
      .filter((r) => r.text.length > 0);
    if (cleaned.length > 0) {
      cleaned[0].text = cleaned[0].text.replace(/^ +/, "");
      const last = cleaned[cleaned.length - 1];
      last.text = last.text.replace(/[ \n]+$/, "");
    }
    const kept = cleaned.filter((r) => r.text.length > 0);
    const { style, align, spacing } = currentBlock();
    if (kept.length > 0) {
      blocks.push({
        kind: "text",
        spacing,
        style,
        ...(align && align !== "left" ? { align } : {}),
        runs: kept.map((r) => ({ ...r, text: decodeEntities(r.text) })),
        ...(marker ? { marker } : {}),
      });
      marker = undefined;
    } else if (sawBreak) {
      blocks.push({ kind: "spacer", spacing });
    }
    runs = [];
    sawBreak = false;
  };

  const token = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(source)) !== null) {
    const [whole, rawTag, attrs = "", text, strayLt] = m;

    if (text !== undefined || strayLt !== undefined) {
      const collapsed = (text ?? "<").replace(/\s+/g, " ");
      const last = runs[runs.length - 1];
      // collapse a space that straddles two runs, and a leading space after a break
      const trimmed =
        (!last || /[ \n]$/.test(last.text)) && collapsed.startsWith(" ")
          ? collapsed.slice(1)
          : collapsed;
      pushText(trimmed, currentInline());
      continue;
    }

    const tag = rawTag.toLowerCase();
    const closing = whole.startsWith("</");
    const selfClosing = /\/\s*>$/.test(whole);

    if (closing) {
      const at = stack.map((o) => o.tag).lastIndexOf(tag);
      if (at === -1) continue;
      if (BLOCK_TAGS.has(tag)) flush();
      if (tag === "ul" || tag === "ol") lists.pop();
      // a list item that held no text must not lend its marker to what follows
      if (tag === "li") marker = undefined;
      stack.length = at;
      continue;
    }

    if (tag === "br") {
      pushText("\n", currentInline());
      sawBreak = true;
      continue;
    }
    if (tag === "hr") {
      flush();
      blocks.push({ kind: "rule", spacing: "paragraph" });
      continue;
    }
    if (tag === "img") {
      const src = attr(attrs, "src")?.trim();
      if (!src) continue;
      flush();
      const style = attr(attrs, "style");
      const width = parseWidth(styleProp(style, "width") ?? attr(attrs, "width"));
      const { align, spacing } = currentBlock();
      const href = currentInline().href;
      blocks.push({
        kind: "image",
        spacing,
        src,
        alt: attr(attrs, "alt") ?? "",
        ...(align && align !== "left" ? { align } : {}),
        ...(width.px ? { widthPx: width.px } : {}),
        ...(width.fraction ? { widthFraction: width.fraction } : {}),
        ...(href ? { href } : {}),
      });
      continue;
    }
    if (VOID_TAGS.has(tag)) continue;

    if (BLOCK_TAGS.has(tag)) {
      flush();
      if (tag === "ul" || tag === "ol") lists.push({ ordered: tag === "ol", count: 0 });
      if (tag === "li") {
        const list = lists[lists.length - 1];
        if (list) {
          list.count += 1;
          marker = list.ordered ? `${list.count}.` : "•";
        } else {
          marker = "•";
        }
      }
      const style = attr(attrs, "style");
      const align =
        parseAlign(styleProp(style, "text-align")) ??
        parseAlign(attr(attrs, "align")) ??
        (tag === "center" ? "center" : undefined);
      const open: OpenTag = {
        tag,
        inline: inlineFor(tag, attrs),
        block: { style: blockStyleFor(tag), align },
      };
      if (!selfClosing) stack.push(open);
      continue;
    }

    if (!selfClosing) stack.push({ tag, inline: inlineFor(tag, attrs) });
  }
  flush();

  // Blank lines before the first and after the last content carry nothing.
  const first = blocks.findIndex((b) => b.kind !== "spacer");
  if (first === -1) return [];
  let last = blocks.length - 1;
  while (blocks[last].kind === "spacer") last -= 1;
  return blocks.slice(first, last + 1);
}
