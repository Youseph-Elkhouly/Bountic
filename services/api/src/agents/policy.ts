const allowedCategories = new Set(["writing", "research", "content", "marketing", "summary", "analysis"]);

export function supportsAutonomousTextCategory(category: string): boolean {
  return allowedCategories.has(category.trim().toLowerCase());
}
