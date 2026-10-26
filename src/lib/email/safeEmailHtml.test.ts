import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENT_PHOTO_STARTER } from "./emailTemplateOptions.ts";
import { cleanEmailHtml } from "./safeEmailHtml.ts";

/** The raw-text checks of the backend's App\Support\EmailHtml::problem(). */
const serverRefuses = (html: string): boolean =>
  /<\s*\/?\s*(script|iframe|object|embed|svg|math|frame|frameset|applet|base|portal)\b/i.test(html) ||
  /<[a-z][^>]*?[\s/"'](on[a-z]+)\s*=/i.test(html);

describe("cleanEmailHtml keeps a normal email exactly as written", () => {
  it("leaves the event photo starter, styles, tables, images and placeholders untouched", () => {
    const email = [
      EVENT_PHOTO_STARTER.body,
      '<style>p { color: #333; }</style>',
      '<table width="100%" style="border-collapse: collapse"><tr><td align="center">Hi {{ first_name }}</td></tr></table>',
      '<p><a href="{{ photo_link }}" target="_blank" style="color: #3182ce; text-decoration: underline;">View</a></p>',
      '<img src="https://example.com/a.png" alt="Logo" style="max-width: 100%; height: auto;" /><br/>',
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="QR">',
      '<a href="mailto:hi@example.com">Mail</a> <a href="tel:+15551234">Call</a>',
      "<!-- a plain note -->",
    ].join("");
    assert.equal(cleanEmailHtml(email), email);
  });

  it("returns an empty string for nothing", () => {
    assert.equal(cleanEmailHtml(null), "");
    assert.equal(cleanEmailHtml(undefined), "");
    assert.equal(cleanEmailHtml(""), "");
  });
});

describe("cleanEmailHtml removes what the server refuses", () => {
  it("drops scripts, iframes, svg and the like with their content", () => {
    assert.equal(cleanEmailHtml('<p>Hi</p><script>alert(1)</script><p>there</p>'), "<p>Hi</p><p>there</p>");
    assert.equal(cleanEmailHtml('<SCRIPT type="x">a</SCRIPT >b'), "b");
    assert.equal(cleanEmailHtml('<iframe src="https://x.test"></iframe>ok'), "ok");
    assert.equal(cleanEmailHtml("<svg><svg><circle/></svg></svg>ok"), "ok");
    assert.equal(cleanEmailHtml("<math><mi>x</mi></math>ok"), "ok");
  });

  it("treats an unclosed script as swallowing the rest, as a browser does", () => {
    assert.equal(cleanEmailHtml("<p>Hi</p><script>alert(1)<p>gone</p>"), "<p>Hi</p>");
  });

  it("drops embeds and form controls but keeps the text they wrap", () => {
    assert.equal(cleanEmailHtml('<object data="x.swf">Fallback</object>'), "Fallback");
    assert.equal(cleanEmailHtml('<embed src="x.swf"><base href="https://x.test">ok'), "ok");
    assert.equal(cleanEmailHtml('<form action="/x"><button>Click</button><input name="a"></form>'), "Click");
    assert.equal(cleanEmailHtml('<meta http-equiv="refresh" content="0;url=https://x.test">ok'), "ok");
  });

  it("drops event handlers and srcdoc, keeping the tag's other attributes", () => {
    assert.equal(cleanEmailHtml('<p class="a" onclick="x()">Hi</p>'), '<p class="a">Hi</p>');
    assert.equal(cleanEmailHtml('<img src="a.png"\nonerror=alert(1) alt="A">'), '<img src="a.png" alt="A">');
    assert.equal(cleanEmailHtml('<div ONMOUSEOVER=\'x\'>Hi</div>'), "<div>Hi</div>");
    assert.equal(cleanEmailHtml('<br onload="x"/>'), "<br />");
  });

  it("drops javascript:, vbscript: and data: addresses, however they are disguised", () => {
    assert.equal(cleanEmailHtml('<a href="javascript:alert(1)">x</a>'), "<a>x</a>");
    assert.equal(cleanEmailHtml('<a href=" JaVa\tScRiPt:alert(1)">x</a>'), "<a>x</a>");
    assert.equal(cleanEmailHtml('<a href="&#106;avascript:alert(1)">x</a>'), "<a>x</a>");
    assert.equal(cleanEmailHtml('<a href="&#106avascript:alert(1)">x</a>'), "<a>x</a>");
    assert.equal(cleanEmailHtml('<a href="javascript&colon;alert(1)">x</a>'), "<a>x</a>");
    assert.equal(cleanEmailHtml('<a href="vbscript:x" target="_blank">x</a>'), '<a target="_blank">x</a>');
    assert.equal(cleanEmailHtml('<a href="data:text/html,hi">x</a>'), "<a>x</a>");
    assert.equal(cleanEmailHtml('<img src="data:image/svg+xml,<svg/>">'), "<img>");
  });

  it("drops a style that runs code, keeping ordinary styles", () => {
    assert.equal(cleanEmailHtml('<p style="width: expression(alert(1))">x</p>'), "<p>x</p>");
    assert.equal(cleanEmailHtml('<p style="background:url(javascript:x)">x</p>'), "<p>x</p>");
    assert.equal(cleanEmailHtml('<p style="color:red">x</p>'), '<p style="color:red">x</p>');
  });

  it("drops comments that hold markup", () => {
    assert.equal(cleanEmailHtml("a<!--[if mso]><table><tr><td><![endif]-->b"), "ab");
  });

  it("leaves nothing the server would refuse", () => {
    const messy =
      '<div onclick="x"><script>1</script><iframe></iframe><object></object><embed><svg></svg>' +
      '<a href="javascript:x" onmouseover="y">l</a><img src=x onerror=y><frameset><frame></frameset><portal></portal></div>';
    const cleaned = cleanEmailHtml(messy);
    assert.equal(serverRefuses(messy), true);
    assert.equal(serverRefuses(cleaned), false, cleaned);
    assert.equal(cleaned, '<div><a>l</a><img src=x></div>');
  });
});
