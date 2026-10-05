import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseHtmlBlocks } from "./htmlBlocks.ts";

describe("parseHtmlBlocks", () => {
  it("reads the Group Appreciation Night template the way the web renders it", () => {
    const body =
      '<p><img src="/storage/email-images/group.jpg" style="width: 100%;"></p>' +
      '<p><img src="https://zap-zone.com/banner.png" width="600"></p>' +
      "<p>We at Zap Zone would like to express our sincere gratitude on " +
      "<strong>Sunday, October 11th, from 6:00 PM to 9:00 PM</strong> at the Waterford location.</p>" +
      "<p><br></p>" +
      '<p>To attend, please pre-register at <a href="https://zap-zone.com/group-appreciation-night/">' +
      "https://zap-zone.com/group-appreciation-night/</a>.</p>" +
      "<p><br></p>" +
      "<p>Devin Decator / General Manager<br>{{ location_phone }}<br>{{ location_email }}</p>";

    assert.deepEqual(parseHtmlBlocks(body), [
      {
        kind: "image",
        spacing: "paragraph",
        src: "/storage/email-images/group.jpg",
        alt: "",
        widthFraction: 1,
      },
      {
        kind: "image",
        spacing: "paragraph",
        src: "https://zap-zone.com/banner.png",
        alt: "",
        widthPx: 600,
      },
      {
        kind: "text",
        spacing: "paragraph",
        style: "p",
        runs: [
          { text: "We at Zap Zone would like to express our sincere gratitude on " },
          { text: "Sunday, October 11th, from 6:00 PM to 9:00 PM", bold: true },
          { text: " at the Waterford location." },
        ],
      },
      { kind: "spacer", spacing: "paragraph" },
      {
        kind: "text",
        spacing: "paragraph",
        style: "p",
        runs: [
          { text: "To attend, please pre-register at " },
          {
            text: "https://zap-zone.com/group-appreciation-night/",
            href: "https://zap-zone.com/group-appreciation-night/",
          },
          { text: "." },
        ],
      },
      { kind: "spacer", spacing: "paragraph" },
      {
        kind: "text",
        spacing: "paragraph",
        style: "p",
        runs: [{ text: "Devin Decator / General Manager\n{{ location_phone }}\n{{ location_email }}" }],
      },
    ]);
  });

  it("keeps merge variables as written, since the list preview shows them raw", () => {
    const [block] = parseHtmlBlocks("<p>Hi {{ recipient_first_name }},</p>");
    assert.deepEqual(block, {
      kind: "text",
      spacing: "paragraph",
      style: "p",
      runs: [{ text: "Hi {{ recipient_first_name }}," }],
    });
  });

  it("spaces paragraphs apart but keeps the editor's <div> lines tight", () => {
    const blocks = parseHtmlBlocks("<div>Line one</div><div>Line two</div><div><br></div><p>Para</p>");
    assert.deepEqual(
      blocks.map((b) => [b.kind, b.spacing]),
      [
        ["text", "none"],
        ["text", "none"],
        ["spacer", "none"],
        ["text", "paragraph"],
      ],
    );
  });

  it("collapses HTML whitespace and decodes entities", () => {
    const [block] = parseHtmlBlocks("<div>\n   Rock &amp;   roll\n  <em> tonight </em> !\n</div>");
    assert.deepEqual(block, {
      kind: "text",
      spacing: "none",
      style: "p",
      runs: [
        { text: "Rock & roll " },
        { text: "tonight ", italic: true },
        { text: "!" },
      ],
    });
  });

  it("treats text without any tags as one block", () => {
    assert.deepEqual(parseHtmlBlocks("Plain text body"), [
      { kind: "text", spacing: "none", style: "p", runs: [{ text: "Plain text body" }] },
    ]);
  });

  it("reads headings, quotes, alignment and inline styles", () => {
    const blocks = parseHtmlBlocks(
      '<h1 style="text-align: center;">Big news</h1>' +
        "<h2>Sub</h2><h4>Small</h4>" +
        "<blockquote>Quoted</blockquote>" +
        '<p style="text-align:right"><span style="color: rgb(239, 68, 68); font-weight: 700">Red</span>' +
        ' <u>under</u> <s>gone</s> <span style="background-color: #fde047">lit</span></p>',
    );
    assert.deepEqual(blocks, [
      { kind: "text", spacing: "paragraph", style: "h1", align: "center", runs: [{ text: "Big news" }] },
      { kind: "text", spacing: "paragraph", style: "h2", runs: [{ text: "Sub" }] },
      { kind: "text", spacing: "paragraph", style: "h3", runs: [{ text: "Small" }] },
      { kind: "text", spacing: "paragraph", style: "quote", runs: [{ text: "Quoted" }] },
      {
        kind: "text",
        spacing: "paragraph",
        style: "p",
        align: "right",
        runs: [
          { text: "Red", color: "rgb(239, 68, 68)", bold: true },
          { text: " " },
          { text: "under", underline: true },
          { text: " " },
          { text: "gone", strike: true },
          { text: " " },
          { text: "lit", highlight: "#fde047" },
        ],
      },
    ]);
  });

  it("numbers ordered lists and bullets unordered ones", () => {
    const blocks = parseHtmlBlocks("<ol><li>One</li><li>Two</li></ol><ul><li>Dot</li></ul>");
    assert.deepEqual(blocks, [
      { kind: "text", spacing: "list", style: "li", runs: [{ text: "One" }], marker: "1." },
      { kind: "text", spacing: "list", style: "li", runs: [{ text: "Two" }], marker: "2." },
      { kind: "text", spacing: "list", style: "li", runs: [{ text: "Dot" }], marker: "•" },
    ]);
  });

  it("never lends an empty list item's marker to the next block", () => {
    const blocks = parseHtmlBlocks("<ul><li></li></ul><p>After</p>");
    assert.deepEqual(blocks, [
      { kind: "text", spacing: "paragraph", style: "p", runs: [{ text: "After" }] },
    ]);
  });

  it("carries a centered parent's alignment and a link onto an image", () => {
    const blocks = parseHtmlBlocks(
      '<div style="text-align:center"><a href="https://x.test"><img src="a.png" alt="Logo" style="width: 50%"></a></div>',
    );
    assert.deepEqual(blocks, [
      {
        kind: "image",
        spacing: "none",
        src: "a.png",
        alt: "Logo",
        align: "center",
        widthFraction: 0.5,
        href: "https://x.test",
      },
    ]);
  });

  it("drops styles, scripts, comments and blank lines at the edges", () => {
    const blocks = parseHtmlBlocks(
      "<style>p{color:red}</style><!-- note --><p><br></p><p>Body</p><p><br></p><p><br></p>",
    );
    assert.deepEqual(blocks, [
      { kind: "text", spacing: "paragraph", style: "p", runs: [{ text: "Body" }] },
    ]);
  });

  it("keeps every blank line between content, as the web shows them", () => {
    const blocks = parseHtmlBlocks("<p>A</p><p><br></p><p><br></p><p>B</p>");
    assert.deepEqual(blocks.map((b) => b.kind), ["text", "spacer", "spacer", "text"]);
  });

  it("puts a horizontal rule in its own block", () => {
    assert.deepEqual(parseHtmlBlocks("<p>A</p><hr><p>B</p>").map((b) => b.kind), [
      "text",
      "rule",
      "text",
    ]);
  });

  it("returns nothing for an empty body", () => {
    assert.deepEqual(parseHtmlBlocks(""), []);
    assert.deepEqual(parseHtmlBlocks("<p></p>"), []);
    assert.deepEqual(parseHtmlBlocks("<p><br></p>"), []);
  });
});
