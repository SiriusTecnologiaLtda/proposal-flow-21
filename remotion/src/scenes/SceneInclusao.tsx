import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from "remotion";

export const SceneInclusao = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Step badge
  const badgeScale = spring({ frame, fps, config: { damping: 12 } });

  // Title
  const titleOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });
  const titleX = interpolate(
    spring({ frame: frame - 5, fps, config: { damping: 20, stiffness: 150 } }),
    [0, 1], [-60, 0]
  );

  // Mockup image
  const imgScale = interpolate(
    spring({ frame: frame - 20, fps, config: { damping: 15, stiffness: 80 } }),
    [0, 1], [0.85, 1]
  );
  const imgOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });

  // Description bullets
  const bullets = [
    "Selecione o cliente e tipo de proposta",
    "Configure escopo com templates prontos",
    "Defina valores e condições de pagamento",
  ];

  // Floating highlight on mockup
  const highlightY = interpolate(frame, [60, 120, 180], [200, 350, 500], {
    extrapolateRight: "clamp", extrapolateLeft: "clamp",
  });
  const highlightOpacity = interpolate(frame, [50, 65, 170, 185], [0, 0.6, 0.6, 0], {
    extrapolateRight: "clamp", extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      {/* Left side: text */}
      <div style={{
        position: "absolute", left: 80, top: 100, width: 550,
        display: "flex", flexDirection: "column", gap: 24,
      }}>
        {/* Step badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          transform: `scale(${badgeScale})`,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "sans-serif", fontSize: 22, fontWeight: 700, color: "white",
            boxShadow: "0 4px 20px rgba(59,130,246,0.4)",
          }}>1</div>
          <span style={{
            fontFamily: "sans-serif", fontSize: 16, fontWeight: 600,
            color: "#3b82f6", letterSpacing: 3, textTransform: "uppercase",
          }}>Etapa</span>
        </div>

        {/* Title */}
        <h2 style={{
          fontFamily: "sans-serif", fontSize: 56, fontWeight: 800,
          color: "white", opacity: titleOpacity,
          transform: `translateX(${titleX}px)`,
          lineHeight: 1.1,
        }}>
          Inclusão da<br />Proposta
        </h2>

        {/* Bullets */}
        {bullets.map((text, i) => {
          const delay = 35 + i * 15;
          const opacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: "clamp" });
          const x = interpolate(frame, [delay, delay + 15], [-30, 0], { extrapolateRight: "clamp" });
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              opacity, transform: `translateX(${x}px)`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#10b981",
              }} />
              <span style={{
                fontFamily: "sans-serif", fontSize: 20, color: "rgba(255,255,255,0.8)",
              }}>{text}</span>
            </div>
          );
        })}
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
        <Img src={staticFile("images/mockup-inclusao.jpg")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        
        {/* Scanning highlight */}
        <div style={{
          position: "absolute", left: 0, top: highlightY, width: "100%", height: 60,
          background: "linear-gradient(180deg, transparent, rgba(59,130,246,0.15), transparent)",
          opacity: highlightOpacity,
        }} />
      </div>
    </AbsoluteFill>
  );
};
