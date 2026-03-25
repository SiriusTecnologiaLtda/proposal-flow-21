import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from "remotion";

export const SceneGeracao = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badgeScale = spring({ frame, fps, config: { damping: 12 } });
  const titleOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });
  const titleX = interpolate(
    spring({ frame: frame - 5, fps, config: { damping: 20, stiffness: 150 } }),
    [0, 1], [60, 0]
  );

  const imgScale = interpolate(
    spring({ frame: frame - 25, fps, config: { damping: 15, stiffness: 80 } }),
    [0, 1], [0.85, 1]
  );
  const imgOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" });

  const bullets = [
    "Documento gerado automaticamente",
    "Valores e escopo preenchidos",
    "PDF pronto para envio",
  ];

  // Simulate a "generating" progress bar
  const progressWidth = interpolate(frame, [50, 120], [0, 100], {
    extrapolateRight: "clamp", extrapolateLeft: "clamp",
  });
  const progressOpacity = interpolate(frame, [45, 55, 130, 145], [0, 1, 1, 0], {
    extrapolateRight: "clamp", extrapolateLeft: "clamp",
  });

  // Checkmark after generation
  const checkScale = spring({ frame: frame - 130, fps, config: { damping: 10 } });
  const checkOpacity = interpolate(frame, [128, 135], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      {/* Left side: mockup */}
      <div style={{
        position: "absolute", left: 40, top: 60,
        width: 1100, height: 660,
        opacity: imgOpacity,
        transform: `scale(${imgScale})`,
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 25px 80px rgba(0,0,0,0.5)",
      }}>
        <Img src={staticFile("images/mockup-geracao.jpg")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Right side: text */}
      <div style={{
        position: "absolute", right: 80, top: 100, width: 550,
        display: "flex", flexDirection: "column", gap: 24,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          transform: `scale(${badgeScale})`,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "linear-gradient(135deg, #10b981, #059669)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "sans-serif", fontSize: 22, fontWeight: 700, color: "white",
            boxShadow: "0 4px 20px rgba(16,185,129,0.4)",
          }}>2</div>
          <span style={{
            fontFamily: "sans-serif", fontSize: 16, fontWeight: 600,
            color: "#10b981", letterSpacing: 3, textTransform: "uppercase",
          }}>Etapa</span>
        </div>

        <h2 style={{
          fontFamily: "sans-serif", fontSize: 56, fontWeight: 800,
          color: "white", opacity: titleOpacity,
          transform: `translateX(${titleX}px)`,
          lineHeight: 1.1,
        }}>
          Geração do<br />Documento
        </h2>

        {bullets.map((text, i) => {
          const delay = 40 + i * 15;
          const opacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: "clamp" });
          const x = interpolate(frame, [delay, delay + 15], [30, 0], { extrapolateRight: "clamp" });
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              opacity, transform: `translateX(${x}px)`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
              <span style={{
                fontFamily: "sans-serif", fontSize: 20, color: "rgba(255,255,255,0.8)",
              }}>{text}</span>
            </div>
          );
        })}

        {/* Progress indicator */}
        <div style={{ opacity: progressOpacity, marginTop: 20 }}>
          <div style={{
            width: 300, height: 6, borderRadius: 3,
            background: "rgba(255,255,255,0.1)",
          }}>
            <div style={{
              width: `${progressWidth}%`, height: "100%", borderRadius: 3,
              background: "linear-gradient(90deg, #3b82f6, #10b981)",
            }} />
          </div>
          <span style={{
            fontFamily: "sans-serif", fontSize: 14, color: "rgba(255,255,255,0.5)",
            marginTop: 8, display: "block",
          }}>Gerando documento...</span>
        </div>

        {/* Checkmark */}
        <div style={{
          opacity: checkOpacity,
          transform: `scale(${checkScale})`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "#10b981",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, color: "white",
          }}>✓</div>
          <span style={{
            fontFamily: "sans-serif", fontSize: 18, color: "#10b981", fontWeight: 600,
          }}>Documento pronto!</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
