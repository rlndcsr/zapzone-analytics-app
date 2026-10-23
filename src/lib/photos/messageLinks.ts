import type { PhotoMessageLink } from "../../services/photosService";

export type LinkDraft = { label: string; defaultUrl: string; urls: Record<number, string> };

/** Field keys for the edited set: `label`, `default` or `url:{locationId}`, each prefixed by the link id. */
export const linkFieldKey = (linkId: number, field: string): string => `${linkId}:${field}`;

const LOOKS_LIKE_DOMAIN = /^[^\s/?#@:]+\.[^\s/?#@:]+(?:[:/?#]|$)/;

/** "instagram.com/zap" → "https://instagram.com/zap"; anything else (schemes, plain words) is left trimmed, as the backend does. */
export function normaliseLinkUrl(value: string): string {
  const trimmed = value.trim();
  const bare = trimmed.replace(/^\/+/, "");
  return LOOKS_LIKE_DOMAIN.test(bare) ? `https://${bare}` : trimmed;
}

export const savedLinkUrl = (link: PhotoMessageLink, locationId: number): string =>
  link.urls.find((row) => row.locationId === locationId)?.url ?? "";

export const linkDraftFor = (link: PhotoMessageLink): LinkDraft => ({
  label: link.label,
  defaultUrl: link.defaultUrl ?? "",
  urls: Object.fromEntries(link.urls.map((row) => [row.locationId, row.url])),
});

/** Fresh server values for every field except the ones this screen has edited, so a reload never reverts another change. */
export function mergeLinkDrafts(
  previous: Record<number, LinkDraft>,
  links: PhotoMessageLink[],
  edited: ReadonlySet<string>,
): Record<number, LinkDraft> {
  return Object.fromEntries(
    links.map((link) => {
      const fresh = linkDraftFor(link);
      const prior = previous[link.id];
      if (!prior) return [link.id, fresh];
      const kept = (field: string) => edited.has(linkFieldKey(link.id, field));
      const urls = { ...fresh.urls };
      Object.entries(prior.urls).forEach(([locationId, value]) => {
        if (kept(`url:${locationId}`)) urls[Number(locationId)] = value;
      });
      return [
        link.id,
        {
          label: kept("label") ? prior.label : fresh.label,
          defaultUrl: kept("default") ? prior.defaultUrl : fresh.defaultUrl,
          urls,
        },
      ];
    }),
  );
}
