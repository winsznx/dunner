import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Dunner — When payments fail, Dunner calls.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  // Fetch Syne ExtraBold from Google Fonts
  const syneFont = await fetch(
    "https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_04uQ6fWp-R.woff2"
  ).then((res) => res.arrayBuffer());

  // Fetch Space Grotesk from Google Fonts
  const spaceFont = await fetch(
    "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gozuPTPTg.woff2"
  ).then((res) => res.arrayBuffer());

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
          fontFamily: "Space Grotesk",
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
            display: "flex",
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
            display: "flex",
          }}
        />

        {/* Top — logo wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              fontSize: "44px",
              fontWeight: 800,
              color: "#FF1A1A",
              letterSpacing: "-1px",
              fontFamily: "Syne",
            }}
          >
            dunner
          </span>
        </div>

        {/* Middle — headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span
            style={{
              fontSize: "80px",
              fontWeight: 800,
              color: "#EEEEEF",
              lineHeight: 1.0,
              letterSpacing: "-3px",
              fontFamily: "Syne",
            }}
          >
            When payments fail,
          </span>
          <span
            style={{
              fontSize: "80px",
              fontWeight: 800,
              color: "#FF1A1A",
              lineHeight: 1.0,
              letterSpacing: "-3px",
              fontFamily: "Syne",
            }}
          >
            Dunner calls.
          </span>
        </div>

        {/* Bottom — subline + waveform */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "22px",
              color: "#A0A0AB",
              maxWidth: "680px",
              lineHeight: 1.5,
              fontFamily: "Space Grotesk",
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
              opacity: 0.7,
            }}
          >
            {[20, 36, 52, 40, 64, 48, 32, 56, 44, 28, 48, 36].map((h, i) => (
              <div
                key={i}
                style={{
                  width: "4px",
                  height: `${h}px`,
                  background: "#22D3EE",
                  borderRadius: "2px",
                  display: "flex",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Syne",
          data: syneFont,
          weight: 800,
          style: "normal",
        },
        {
          name: "Space Grotesk",
          data: spaceFont,
          weight: 400,
          style: "normal",
        },
      ],
    }
  );
}
