import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Dunner — When payments fail, Dunner calls.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0F0F11",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(#2A2A2F 1px, transparent 1px), linear-gradient(90deg, #2A2A2F 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            opacity: 0.25,
          }}
        />

        {/* Glow spot top right */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-120px",
            width: "480px",
            height: "480px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)",
          }}
        />

        {/* Top — logo wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              fontSize: "48px",
              fontWeight: 800,
              color: "#FF1A1A",
              letterSpacing: "-1px",
            }}
          >
            dunner
          </span>
        </div>

        {/* Middle — headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 800,
              color: "#EEEEEF",
              lineHeight: 1.0,
              letterSpacing: "-2px",
            }}
          >
            When payments fail,
          </span>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 800,
              color: "#22D3EE",
              lineHeight: 1.0,
              letterSpacing: "-2px",
            }}
          >
            Dunner calls.
          </span>
        </div>

        {/* Bottom — subline + pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "24px",
              color: "#A0A0AB",
              maxWidth: "640px",
              lineHeight: 1.4,
            }}
          >
            The only recovery tool that sounds like you — and only charges when it works.
          </span>

          {/* Waveform bars */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "4px",
              opacity: 0.6,
            }}
          >
            {[20, 36, 52, 40, 64, 48, 32, 56, 44, 28, 48, 36].map(
              (h, i) => (
                <div
                  key={i}
                  style={{
                    width: "4px",
                    height: `${h}px`,
                    background: "#22D3EE",
                    borderRadius: "2px",
                  }}
                />
              )
            )}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
