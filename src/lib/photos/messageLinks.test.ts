import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PhotoMessageLink } from "../../services/photosService";
import {
  linkDraftFor,
  linkFieldKey,
  mergeLinkDrafts,
  normaliseLinkUrl,
  savedLinkUrl,
} from "./messageLinks.ts";

const link = (over: Partial<PhotoMessageLink> = {}): PhotoMessageLink => ({
  id: 7,
  key: "instagram",
  variable: "link_instagram",
  label: "Instagram",
  defaultUrl: "https://instagram.com/zap",
  urls: [
    { locationId: 1, url: "https://instagram.com/zap-brighton" },
    { locationId: 2, url: "https://instagram.com/zap-novi" },
  ],
  ...over,
});

describe("normaliseLinkUrl — https:// only for text that looks like a web address", () => {
  it("adds https:// to a bare domain, with or without a path or leading slashes", () => {
    assert.equal(normaliseLinkUrl(" instagram.com/zap "), "https://instagram.com/zap");
    assert.equal(normaliseLinkUrl("//www.facebook.com"), "https://www.facebook.com");
    assert.equal(normaliseLinkUrl("zap.example:8080/x"), "https://zap.example:8080/x");
  });

  it("leaves an address with a scheme, plain words and empty text alone", () => {
    assert.equal(normaliseLinkUrl("https://instagram.com/zap"), "https://instagram.com/zap");
    assert.equal(normaliseLinkUrl("http://zap.example"), "http://zap.example");
    assert.equal(normaliseLinkUrl("our instagram"), "our instagram");
    assert.equal(normaliseLinkUrl("someone@example.com"), "someone@example.com");
    assert.equal(normaliseLinkUrl("   "), "");
  });
});

describe("mergeLinkDrafts — a reload keeps only this screen's own edits", () => {
  it("takes every field from the server when nothing was edited", () => {
    const stale = { 7: { ...linkDraftFor(link()), label: "Old name" } };
    const fresh = link({ label: "Insta" });
    assert.deepEqual(mergeLinkDrafts(stale, [fresh], new Set()), { 7: linkDraftFor(fresh) });
  });

  it("keeps an edited field and still takes someone else's change to another one", () => {
    const typed = {
      7: {
        ...linkDraftFor(link()),
        label: "Insta (typing)",
        urls: { 1: "https://typed.example", 2: "https://instagram.com/zap-novi" },
      },
    };
    const fromServer = link({
      defaultUrl: "https://instagram.com/new",
      urls: [
        { locationId: 1, url: "https://instagram.com/zap-brighton" },
        { locationId: 2, url: "https://instagram.com/changed-elsewhere" },
      ],
    });
    const edited = new Set([linkFieldKey(7, "label"), linkFieldKey(7, "url:1")]);
    assert.deepEqual(mergeLinkDrafts(typed, [fromServer], edited)[7], {
      label: "Insta (typing)",
      defaultUrl: "https://instagram.com/new",
      urls: { 1: "https://typed.example", 2: "https://instagram.com/changed-elsewhere" },
    });
  });

  it("starts a new link from the server and drops a removed one", () => {
    const merged = mergeLinkDrafts({ 7: linkDraftFor(link()) }, [link({ id: 8, label: "TikTok" })], new Set());
    assert.deepEqual(Object.keys(merged), ["8"]);
    assert.equal(merged[8].label, "TikTok");
  });

  it("reads a location's saved address, or empty when it uses the default", () => {
    assert.equal(savedLinkUrl(link(), 2), "https://instagram.com/zap-novi");
    assert.equal(savedLinkUrl(link(), 3), "");
  });
});
