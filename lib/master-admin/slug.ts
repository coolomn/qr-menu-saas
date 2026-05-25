export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function normalizeSlugInput(slug: string): string {
  return slugifyName(slug.replace(/\s+/g, "-"));
}
