import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/work/qa/", "/work/system/"] }],
    sitemap: "https://augustasarmalis.com/sitemap.xml",
    host: "https://augustasarmalis.com",
  };
}
