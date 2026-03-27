/**
 * Fuzzy path-segment filter for file autocomplete.
 *
 * Matches a query against a file path using two strategies:
 * 1. Simple substring match (fast path)
 * 2. Fuzzy segment match: splits query by "/" and checks that each segment
 *    appears in order within the path segments. This allows skipping
 *    intermediate directories, e.g. "frontend/artifacts" matches
 *    "frontend/app/(dashboard)/artifacts/page.tsx".
 */
export function fuzzyPathMatch(filePath: string, query: string): boolean {
  const lowerPath = filePath.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Fast path: simple substring match
  if (lowerPath.includes(lowerQuery)) return true;

  // Fuzzy: split query by "/" and match segments in order
  if (!lowerQuery.includes("/")) return false;

  const queryParts = lowerQuery.split("/").filter(Boolean);
  const pathParts = lowerPath.split("/");

  let pi = 0;
  for (const qp of queryParts) {
    while (pi < pathParts.length && !pathParts[pi].includes(qp)) pi++;
    if (pi >= pathParts.length) return false;
    pi++;
  }
  return true;
}

/**
 * Filter a list of file paths using fuzzy path matching.
 */
export function filterFileTree(
  fileTree: string[],
  query: string,
  limit: number = 20,
): string[] {
  return fileTree.filter((f) => fuzzyPathMatch(f, query)).slice(0, limit);
}
