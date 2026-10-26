/**
 * Cleans a saved email body before the app shows it or loads it into an
 * editor (web: utils/safeHtml, DOMPurify). The app draws email HTML with native
 * views, so nothing in it could run here; cleaning keeps what the app shows the
 * same as the web, and lets an older email be saved again — the server now
 * refuses a body that carries scripts, event handlers or javascript: links
 * (backend App\Support\EmailHtml), and this removes exactly those.
 *
 * Kept: text, links, styles, tables, images (including data: PNG/JPEG/GIF/WebP)
 * and placeholders such as {{ photo_link }}.
 */
import { decodeEntities } from "../htmlText.ts";

/** Dropped with everything inside them. */
const DROP_WITH_CONTENT = ["script", "iframe", "noscript", "noembed", "noframes", "xmp", "template", "svg", "math"];

/** Raw-text elements: a browser reads everything after an unclosed one as its content. */
const RAW_TEXT = new Set(["script", "iframe", "noscript", "noembed", "noframes", "xmp"]);

/** Dropped, keeping the text they wrap (as DOMPurify does with tags it doesn't allow). */
const DROP_TAG_ONLY = new Set([
  ...DROP_WITH_CONTENT,
  "object", "embed", "applet", "frame", "frameset", "base", "portal",
  "form", "input", "button", "textarea", "select", "meta", "link",
]);

/** Attributes that hold an address (the backend's URL_ATTRIBUTES). */
const URL_ATTRIBUTES = new Set([
  "href", "src", "action", "formaction", "background", "poster", "cite", "data",
  "longdesc", "lowsrc", "dynsrc", "xlink:href", "srcset",
]);

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** An attribute value as a browser reads it: entities decoded, spaces and control characters gone. */
const normalise = (value: string): string =>
  decodeEntities(
    // browsers also decode a number written without its closing ";"
    value
      .replace(/&#x([0-9a-f]+)(?![0-9a-f;])/gi, "&#x$1;")
      .replace(/&#(\d+)(?![\d;])/g, "&#$1;"),
  )
    .replace(/&colon;/gi, ":")
    .replace(/&(?:tab|newline);/gi, "")
    .replace(/[\x00-\x20]+/g, "")
    .toLowerCase();

function unsafeAttribute(name: string, rawValue: string | undefined): boolean {
  if (name.startsWith("on") || name === "srcdoc") return true;
  if (rawValue === undefined) return false;
  const value = normalise(rawValue);
  if (URL_ATTRIBUTES.has(name)) {
    if (/^(javascript|vbscript):/.test(value)) return true;
    if (value.startsWith("data:")) return !(name === "src" && /^data:image\/(png|jpe?g|gif|webp);/.test(value));
  }
  return name === "style" && /expression\(|javascript:|vbscript:|behavior:|-moz-binding/.test(value);
}

function cleanTag(whole: string, closing: string, rawName: string, attrs: string): string {
  const name = rawName.toLowerCase();
  if (DROP_TAG_ONLY.has(name)) return "";
  if (closing) return `</${rawName}>`;

  const kept: string[] = [];
  let dropped = false;
  let match: RegExpExecArray | null;
  ATTRIBUTE.lastIndex = 0;
  while ((match = ATTRIBUTE.exec(attrs)) !== null) {
    const [text, attrName, double, single, bare] = match;
    if (unsafeAttribute(attrName.toLowerCase(), double ?? single ?? bare)) dropped = true;
    else kept.push(text);
  }
  // a tag with nothing to remove stays exactly as written, so a clean email is never rewritten
  if (!dropped) return whole;
  const selfClosing = /\/\s*>$/.test(whole);
  return `<${rawName}${kept.length ? ` ${kept.join(" ")}` : ""}${selfClosing ? " /" : ""}>`;
}

export function cleanEmailHtml(html: string | null | undefined): string {
  if (!html) return "";

  // comments that hold markup (Outlook's conditional blocks) go, as on the web
  let out = html.replace(/<!--([\s\S]*?)-->/g, (comment, inner: string) => (/<[/\w]/.test(inner) ? "" : comment));

  for (const name of DROP_WITH_CONTENT) {
    const element = new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>[\\s\\S]*?<\\/${name}\\s*>`, "gi");
    let previous: string;
    do {
      previous = out;
      out = out.replace(element, "");
    } while (out !== previous);
    if (RAW_TEXT.has(name)) {
      // an unclosed one swallows the rest of the email
      out = out.replace(new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>[\\s\\S]*$`, "i"), "");
    }
  }

  return out.replace(TAG, cleanTag);
}
