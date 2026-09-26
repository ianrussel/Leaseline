"use client";

import { useEffect } from "react";

const GA_ID = "G-RL9HYB8TX8";

// Google Analytics (GA4) - skipped entirely on localhost so local dev/testing traffic never
// reaches it. Not tied to a specific domain: this keeps working as-is whether the site is on a
// vercel.app subdomain (now) or a custom domain (later) - no code change needed when that move
// happens. Landing page only, same as before the Next.js move - the dashboard/admin pages are
// internal tools and were never tracked.
export default function Analytics() {
  useEffect(() => {
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/.test(location.hostname);
    if (isLocal || window.gtag) return;

    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", GA_ID);
  }, []);

  return null;
}
