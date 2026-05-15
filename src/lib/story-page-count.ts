export const MIN_STORY_PAGES = 6;
export const MAX_STORY_PAGES = 800;

export function isValidStoryPageCount(pageCount: number): boolean {
  return pageCount >= MIN_STORY_PAGES && pageCount <= MAX_STORY_PAGES;
}
