"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: replaces the root layout itself when the shell fails.
 * Kept dependency-free and inline-styled so it can render even when the
 * token ladder is what broke.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0e0b",
          color: "#eceee4",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: "32rem", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Judgewright could not start
          </h1>
          <p style={{ color: "#a1a697", lineHeight: 1.6 }}>
            The shell itself failed. Reloading usually clears it — nothing was
            uploaded, so no data left your machine.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "2.25rem",
              padding: "0 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #2e3328",
              background: "#171a14",
              color: "#eceee4",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
