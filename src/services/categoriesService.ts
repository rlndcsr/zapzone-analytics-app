import { apiRequest } from "../lib/api";

/** Attraction category, as returned by /api/categories. */
export type Category = {
  id: number;
  name: string;
};

type RawCategory = { id: number; name?: string | null };

// The web categoryService returns the axios body, then reads `.data`; the
// Laravel endpoint wraps the list as { data: [...] } (sometimes { success }).
type CategoriesResponse = { success?: boolean; data?: RawCategory[] } | RawCategory[];

/** GET /api/categories — the category options for the attraction form. */
export async function fetchCategories(token: string): Promise<Category[]> {
  const res = await apiRequest<CategoriesResponse>("/api/categories", { token });
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list
    .filter((c): c is RawCategory => !!c && typeof c.id === "number")
    .map((c) => ({ id: c.id, name: c.name?.trim() || "Unnamed" }));
}

type CreateCategoryResponse = {
  success?: boolean;
  data?: RawCategory;
};

/** POST /api/categories — create a category inline from the form. */
export async function createCategory(
  token: string,
  name: string,
): Promise<Category> {
  const res = await apiRequest<CreateCategoryResponse>("/api/categories", {
    method: "POST",
    token,
    body: { name: name.trim() },
  });
  const c = res.data;
  if (!c || typeof c.id !== "number") {
    throw new Error("Category creation returned an unexpected response.");
  }
  return { id: c.id, name: c.name?.trim() || name.trim() };
}
