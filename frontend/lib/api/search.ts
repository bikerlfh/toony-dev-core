import api from "@/lib/api";
import type { GlobalSearchResult } from "@/types";

export async function globalSearch(
  query: string
): Promise<GlobalSearchResult> {
  const { data } = await api.get<GlobalSearchResult>(
    `/search/`,
    { params: { q: query } }
  );
  return data;
}
