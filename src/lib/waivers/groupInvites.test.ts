import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chaperoneLinkPath,
  createInviteFeedback,
  groupLinkPath,
  groupLinkState,
  mapInviteRecipient,
  recipientContactLine,
  recipientStatusMeta,
  recipientSummary,
  type RawInviteRecipient,
} from "./groupInvites.ts";

const RAW: RawInviteRecipient[] = [
  {
    id: 1,
    name: "Ana Diaz",
    email: "ana@example.com",
    phone: null,
    status: "complete",
    resent_count: 0,
    last_sent_at: "2026-11-01T10:00:00Z",
  },
  {
    id: 2,
    name: "Ben Ito",
    email: "bounce@example",
    phone: "8105889748",
    status: "failed",
    resent_count: 1,
    last_sent_at: null,
  },
  {
    id: 3,
    name: null,
    email: null,
    phone: "8105550000",
    status: "sent",
    resent_count: 0,
    last_sent_at: "2026-11-01T10:00:00Z",
  },
  {
    id: 4,
    name: "Cal Ng",
    email: "cal@example.com",
    phone: null,
    status: "not_sent",
    resent_count: 0,
    last_sent_at: null,
  },
  {
    id: 5,
    name: "Dee Ko",
    email: "dee@example.com",
    phone: null,
    status: "failed",
    resent_count: 0,
    last_sent_at: null,
  },
  {
    id: 6,
    name: "Eve Lu",
    email: "eve@example.com",
    phone: null,
    status: "not_complete",
    resent_count: 0,
    last_sent_at: null,
  },
];
const recipients = RAW.map(mapInviteRecipient);

describe("group links", () => {
  it("builds the web's chaperone and group paths from the backend tokens", () => {
    assert.equal(chaperoneLinkPath("mngTok"), "/waiver/bulk/mngTok");
    assert.equal(groupLinkPath("grpTok"), "/waiver/group/grpTok");
  });

  it("offers Copy only when the link is allowed and has a token", () => {
    assert.equal(
      groupLinkState({ allowShareableLink: true, shareableToken: "t" }),
      "copy",
    );
    assert.equal(
      groupLinkState({ allowShareableLink: true, shareableToken: null }),
      "enabled",
    );
    assert.equal(
      groupLinkState({ allowShareableLink: false, shareableToken: "t" }),
      "off",
    );
    assert.equal(
      groupLinkState({ allowShareableLink: false, shareableToken: null }),
      "off",
    );
  });
});

describe("recipient list", () => {
  it("keeps every parent the chaperone added, in API order", () => {
    assert.deepEqual(
      recipients.map((r) => r.id),
      [1, 2, 3, 4, 5, 6],
    );
  });

  it("counts signed and not-delivered from their own statuses only", () => {
    assert.deepEqual(recipientSummary(recipients), {
      signed: 1,
      total: 6,
      failed: 2,
    });
  });

  it("never counts an undelivered parent as reached or signed", () => {
    const s = recipientSummary([
      mapInviteRecipient({ id: 9, status: "failed" }),
    ]);
    assert.equal(s.signed, 0);
    assert.equal(s.failed, 1);
  });

  it("gives an empty group zero of zero", () => {
    assert.deepEqual(recipientSummary([]), { signed: 0, total: 0, failed: 0 });
  });

  it("labels each status as the web does, with distinct signing and delivery wording", () => {
    assert.equal(recipientStatusMeta("complete").label, "Signed");
    assert.equal(recipientStatusMeta("sent").label, "Invite sent");
    assert.equal(recipientStatusMeta("not_sent").label, "Not sent yet");
    assert.equal(recipientStatusMeta("not_complete").label, "Not signed");
    assert.equal(recipientStatusMeta("failed").label, "Not delivered");
  });

  it("shows an unknown status raw rather than guessing", () => {
    assert.equal(recipientStatusMeta("bounced").label, "bounced");
  });

  it("gives every badge a dark-mode background, border and text colour", () => {
    for (const status of [
      "complete",
      "sent",
      "not_sent",
      "not_complete",
      "failed",
      "bounced",
    ]) {
      const meta = recipientStatusMeta(status);
      assert.match(meta.box, /dark:bg-/, status);
      assert.match(meta.box, /dark:border-/, status);
      assert.match(meta.text, /dark:text-/, status);
    }
  });

  it("joins email and a formatted phone for the contact line", () => {
    assert.equal(
      recipientContactLine(recipients[1]),
      "bounce@example · (810) 588-9748",
    );
    assert.equal(recipientContactLine(recipients[2]), "(810) 555-0000");
    assert.equal(recipientContactLine(recipients[0]), "ana@example.com");
  });

  it("maps missing fields to safe defaults", () => {
    assert.deepEqual(
      mapInviteRecipient({ id: 7, name: "  ", email: "", resent_count: null }),
      {
        id: 7,
        name: null,
        email: null,
        phone: null,
        status: "not_sent",
        resentCount: 0,
        lastSentAt: null,
      },
    );
  });
});

describe("create-invite feedback", () => {
  it("reports success only when the chaperone was notified", () => {
    const f = createInviteFeedback({
      message: "Group invite created and the chaperone was notified.",
      data: { chaperone_notified: true },
    });
    assert.equal(f.notified, true);
    assert.equal(f.title, "Invite sent");
    assert.equal(
      f.message,
      "Group invite created and the chaperone was notified.",
    );
  });

  it("does not claim the chaperone was reached when the send failed", () => {
    const message =
      "Group invite created, but the email or text to the chaperone did not go out. Copy the chaperone link and send it to them.";
    const f = createInviteFeedback({
      message,
      data: { chaperone_notified: false },
    });
    assert.equal(f.notified, false);
    assert.equal(f.title, "Invite created");
    assert.equal(f.message, message);
    assert.doesNotMatch(f.title + f.message, /was notified|has been notified/);
  });

  it("falls back to its own wording when the server sends no message", () => {
    const f = createInviteFeedback({ data: { chaperone_notified: false } });
    assert.match(f.message, /was not notified/);
  });

  it("treats a server without the flag as notified, as the web does", () => {
    assert.equal(createInviteFeedback({ message: "ok" }).notified, true);
    assert.equal(createInviteFeedback(undefined).notified, true);
  });
});
