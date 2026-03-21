"use client";

export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 20,
          padding: 24,
          background: "rgba(255,255,255,0.04)"
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{"{sovereign}"} error</h2>
        <p style={{ opacity: 0.8 }}>{props.error?.message || "Unknown error"}</p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            padding: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            background: "rgba(0,0,0,0.25)",
            overflowX: "auto"
          }}
        >
          {props.error?.stack}
        </pre>
        <p style={{ opacity: 0.8 }}>
          If this is a database error: start Postgres and run Prisma migrations. See
          {" "}
          <code>docs/SETUP.md</code>.
        </p>
        <button
          onClick={() => props.reset()}
          style={{
            marginTop: 8,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.08)",
            color: "inherit"
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
