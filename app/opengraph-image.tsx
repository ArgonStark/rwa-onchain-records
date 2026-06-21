import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "RWA Onchain Records — on-chain analytics for tokenized real-world assets";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0F172A",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle grid lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(51,65,85,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(51,65,85,0.3) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "linear-gradient(90deg, #8B5CF6, #FBBF24, #38BDF8)",
          }}
        />

        {/* Logo + wordmark row */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: 36 }}>
          {/* Isometric cube mark */}
          <svg width="72" height="72" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
            <polygon points="16,4 28,10 16,16 4,10" fill="#8B5CF6" />
            <polygon points="4,10 16,16 16,28 4,22" fill="#5B21B6" />
            <polygon points="16,16 28,10 28,22 16,28" fill="#FBBF24" />
            <line x1="4" y1="10" x2="16" y2="16" stroke="#0F172A" strokeWidth="1" />
            <line x1="28" y1="10" x2="16" y2="16" stroke="#0F172A" strokeWidth="1" />
            <line x1="16" y1="16" x2="16" y2="28" stroke="#0F172A" strokeWidth="1" />
          </svg>

          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 52, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-1px", lineHeight: 1 }}>
              RWA
            </span>
            <span style={{ fontSize: 52, fontWeight: 800, color: "#8B5CF6", letterSpacing: "-1px", lineHeight: 1 }}>
              ONCHAIN
            </span>
            <span style={{ fontSize: 52, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-1px", lineHeight: 1 }}>
              RECORDS
            </span>
          </div>
        </div>

        {/* Description */}
        <p
          style={{
            fontSize: 26,
            color: "#94A3B8",
            lineHeight: 1.5,
            maxWidth: 900,
            margin: 0,
          }}
        >
          Cross-venue on-chain analytics for tokenized real-world assets — perp OI,
          funding rates, spot-token premiums, and perp–spot basis. Public data only.
        </p>

        {/* Metric pills */}
        <div style={{ display: "flex", gap: 16, marginTop: 48 }}>
          {[
            { label: "Perp OI & Funding", color: "#34D399" },
            { label: "Spot Token Premium", color: "#FBBF24" },
            { label: "Perp–Spot Basis", color: "#8B5CF6" },
            { label: "Gold · Equities · Forex", color: "#38BDF8" },
          ].map(({ label, color }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(30,41,59,0.8)",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "10px 18px",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 18, color: "#CBD5E1", fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Bottom right: URL */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            right: 80,
            fontSize: 18,
            color: "#475569",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          rwa-onchain-records.vercel.app
        </div>
      </div>
    ),
    { ...size },
  );
}
