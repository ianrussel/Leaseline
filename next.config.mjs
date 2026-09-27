/** @type {import('next').NextConfig} */
const nextConfig = {
  // app/api/chat/route.js reads docs/knowledge-base.md with fs at runtime - file tracing can't see
  // a path built from process.cwd(), so without this the file is missing from the deployed
  // function and every chat request fails on a cold start.
  outputFileTracingIncludes: {
    "/api/chat": ["./docs/knowledge-base.md"],
  },

  // The pages used to be plain .html files - keep old bookmarks and links in sent emails working.
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/dashboard.html", destination: "/dashboard", permanent: true },
      { source: "/admin.html", destination: "/admin", permanent: true },
    ];
  },
};

export default nextConfig;
