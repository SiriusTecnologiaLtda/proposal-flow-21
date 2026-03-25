import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from "remotion";

export const SceneAssinatura = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badgeScale = spring({ frame, fps, config: { damping: 12 } });
  const titleOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });
  const titleX = interpolate(
    spring({ frame: frame - 5, fps, config: { damping: 20, stiffness: 150 } }),
    [0, 1], [-60, 0]
  );

  const imgScale = interpolate(
    spring({ frame: frame - 20, fps, config: { damping: 15, stiffness: 80 } }),
    [0, 1], [0.85, 1]
  );
  const imgOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });

  const bullets = [
    "Envio para assinatura digital",
    "Acompanhamento em tempo real",
    "Notificações automáticas",
  ];

  // Signature animation - pen stroke
  const strokeProgress = interpolate(frame, [80, 150], [0, 1], {
    extrapolateRight: "clamp", extrapolateLeft: "clamp",
  });

  // Status badges animating
  const status1Opacity = interpolate(frame, [100, 115], [0, 1], { extrapolateRight: "clamp" });
  const status2Opacity = interpolate(frame, [140, 155], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      {/* Left side: text */}
      <div style={{
        position: "absolute", left: 80, top: 100, width: 550,
        display: "flex", flexDirection: "column", gap: 24,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          transform: `scale(${badgeScale})`,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "sans-serif", fontSize: 22, fontWeight: 700, color: "white",
            boxShadow: "0 4px 20px rgba(245,158,11,0.4)",
          }}>3</div>
          <span style={{
            fontFamily: "sans-serif", fontSize: 16, fontWeight: 600,
            color: "#f59e0b", letterSpacing: 3, textTransform: "uppercase",
          }}>Etapa</span>
        </div>

        <h2 style={{
          fontFamily: "sans-serif", fontSize: 56, fontWeight: 800,
          color: "white", opacity: titleOpacity,
          transform: `translateX(${titleX}px)`,
          lineHeight: 1.1,
        }}>
          Assinatura<br />Digital
        </h2>

        {bullets.map((text, i) => {
          const delay = 35 + i * 15;
          const opacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: "clamp" });
          const x = interpolate(frame, [delay, delay + 15], [-30, 0], { extrapolateRight: "clamp" });
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              opacity, transform: `translateX(${x}px)`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
              <span style={{
                fontFamily: "sans-serif", fontSize: 20, color: "rgba(255,255,255,0.8)",
              }}>{text}</span>
            </div>
          );
        })}

        {/* Animated status cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          <div style={{
            opacity: status1Opacity,
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 20px", borderRadius: 10,
            background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
          }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#10b981",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: "white" }}>✓</div>
            <span style={{ fontFamily: "sans-serif", fontSize: 16, color: "#10b981" }}>
              João Silva — Assinado
            </span>
          </div>
          <div style={{
            opacity: status2Opacity,
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 20px", borderRadius: 10,
            background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)",
          }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#f59e0b",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: "white" }}>⏳</div>
            <span style={{ fontFamily: "sans-serif", fontSize: 16, color: "#f59e0b" }}>
              Maria Santos — Pendente
            </span>
          </div>
        </div>
      </div>

      {/* Right side: mockup */}
      <div style={{
        position: "absolute", right: 40, top: 60,
        width: 1100, height: 660,
        opacity: imgOpacity,
        transform: `scale(${imgScale})`,
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 25px 80px rgba(0,0,0,0.5)",
      }}>
        <Img src={staticFile("images/mockup-assinatura.jpg")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    </AbsoluteFill>
  );
};
