/**
 * Turning a stored image reference into something an `<Image>` can load.
 *
 * Three shapes reach the client, and all three are live at once:
 *
 *  - a stored file path, `images/packages/abc.jpg` — what the API writes now
 *    that images are saved to disk rather than inlined;
 *  - a base64 data URI, from rows written before that change;
 *  - an absolute URL, for anything already hosted elsewhere.
 *
 * A column may hold one of those, an array of them (several columns are cast to
 * arrays server-side), or a JSON-encoded array inside a string column.
 *
 * Kept free of runtime imports — and taking the base URL as an argument rather
 * than reading config — so the rules can be unit-tested. `lib/api` wraps these
 * with the app's real base URL.
 */

/** Resolve one reference against `baseUrl`, or null when there is nothing. */
export function resolveMediaPath(
  path: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!path) return null;
  const p = String(path).trim();
  if (!p) return null;

  // Already loadable as-is.
  if (/^(https?:|data:)/i.test(p)) return p;

  // A server-absolute path is appended to the host untouched.
  if (p.startsWith("/")) return `${baseUrl}${p}`;

  // A long unbroken token is bare base64 that lost its data: prefix. Checked
  // before the storage branch, since such a string has no slash to give it away.
  if (p.length > 200 && !p.includes("/") && !p.includes(" ")) {
    return `data:image/jpeg;base64,${p}`;
  }

  // Otherwise a storage-relative path. `storage/` is stripped when already
  // present so the prefix is never doubled.
  return `${baseUrl}/storage/${p.replace(/^storage\//, "")}`;
}

/**
 * Every reference in a column, resolved. Accepts a single value, an array, or
 * a JSON-encoded array in a string column; unusable entries are dropped.
 */
export function resolveMediaPathList(
  image: unknown,
  baseUrl: string,
): string[] {
  const raw: unknown[] = [];

  if (Array.isArray(image)) {
    raw.push(...image);
  } else if (typeof image === "string") {
    const s = image.trim();
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) raw.push(...parsed);
        else raw.push(s);
      } catch {
        raw.push(s);
      }
    } else if (s) {
      raw.push(s);
    }
  }

  return raw
    .map((v) => (typeof v === "string" ? resolveMediaPath(v, baseUrl) : null))
    .filter((v): v is string => !!v);
}

/** The first usable reference, or null. */
export function resolveFirstMediaPath(
  image: unknown,
  baseUrl: string,
): string | null {
  return resolveMediaPathList(image, baseUrl)[0] ?? null;
}
