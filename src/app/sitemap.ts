import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://augustasarmalis.com/", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://augustasarmalis.com/work/", lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];
}
