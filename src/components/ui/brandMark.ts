/**
 * The ZapZone wordmark — the app's default brand image, shown wherever there is
 * no company or location logo of its own: the splash, the login header, the
 * sign-in card and the header logo.
 *
 * Not the profile avatar: that is a person's own picture, and falls back to a
 * plain glyph rather than to branding.
 *
 * One import so the default lives in a single place. It is close to 3:1, and a
 * square box renders it as a thin sliver, so anything drawing it sizes from
 * {@link BRAND_MARK_RATIO} rather than guessing a height.
 */
export const BRAND_MARK = require("../../../assets/zapzone-assests/Zap-Zone.png");

/** The wordmark's intrinsic aspect ratio (2048 × 686). */
export const BRAND_MARK_RATIO = 2048 / 686;
