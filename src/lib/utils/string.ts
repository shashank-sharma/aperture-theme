export const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[-]+|[-]+$/g, "");

export const normalize = (value: string): string => value.trim().toLowerCase();

