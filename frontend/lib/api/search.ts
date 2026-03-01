import api from "@/lib/api";
import type { GlobalSearchResult } from "@/types";

export async function globalSearch(
  orgSlug: string,
  query: string
): Promise<GlobalSearchResult> {
  const { data } = await api.get<GlobalSearchResult>(
    `/organizations/${orgSlug}/search/`,
    { params: { q: query } }
  );
  return data;
}
