import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const SceneIntro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = interpolate(
    spring({ frame, fps, config: { damping: 15, stiffness: 80 } }),
    [0, 1], [80, 0]
  );
  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  const subtitleOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const subtitleY = interpolate(
    spring({ frame: frame - 30, fps, config: { damping: 20, stiffness: 100 } }),
    [0, 1], [40, 0]
  );

  const lineWidth = interpolate(frame, [20, 60], [0, 200], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const badgeScale = spring({ frame: frame - 50, fps, config: { damping: 12 } });
  const badgeOpacity = interpolate(frame, [50, 60], [0, 1], { extrapolateRight: "clamp" });

  // Pulsing glow
  const glowOpacity = 0.3 + Math.sin(frame * 0.08) * 0.15;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Center glow */}
      <div style={{
        position: "absolute",
        width: 600, height: 600,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(59,130,246,${glowOpacity}) 0%, transparent 60%)`,
      }} />

      {/* Title */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        transform: `translateY(${titleY}px)`,
        opacity: titleOpacity,
      }}>
        <h1 style={{
          fontFamily: "sans-serif", fontSize: 72, fontWeight: 800,
          color: "white", letterSpacing: -2, textAlign: "center",
          lineHeight: 1.1,
        }}>
          Fluxo de Propostas
        </h1>

        {/* Accent line */}
        <div style={{
          width: lineWidth, height: 4,
          background: "linear-gradient(90deg, #3b82f6, #10b981)",
          borderRadius: 2,
        }} />

        {/* Subtitle */}
        <p style={{
          fontFamily: "sans-serif", fontSize: 28, color: "rgba(255,255,255,0.7)",
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
          textAlign: "center", maxWidth: 700,
        }}>
          Do cadastro à assinatura digital, conheça cada etapa do processo comercial
        </p>
      </div>

      {/* Step badges */}
      <div style={{
        position: "absolute", bottom: 120,
        display: "flex", gap: 40,
        opacity: badgeOpacity,
        transform: `scale(${badgeScale})`,
      }}>
        {["Inclusão", "Geração", "Assinatura", "Dashboard"].map((label, i) => {
          const delay = i * 8;
          const itemOpacity = interpolate(frame, [55 + delay, 70 + delay], [0, 1], { extrapolateRight: "clamp" });
          const itemY = interpolate(frame, [55 + delay, 70 + delay], [20, 0], { extrapolateRight: "clamp" });
          return (
            <div key={label} style={{
              opacity: itemOpacity,
              transform: `translateY(${itemY}px)`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6, #10b981)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "sans-serif", fontSize: 16, fontWeight: 700, color: "white",
              }}>
                {i + 1}
              </div>
              <span style={{
                fontFamily: "sans-serif", fontSize: 18, color: "rgba(255,255,255,0.8)",
                fontWeight: 500,
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
