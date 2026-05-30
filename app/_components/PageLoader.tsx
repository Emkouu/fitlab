"use client";

import { AppProgressBar } from "next-nprogress-bar";

export function PageLoader() {
  return (
    <AppProgressBar
      height="3px"
      color="var(--brand-magenta)"
      options={{ showSpinner: false }}
      shallowRouting
    />
  );
}
