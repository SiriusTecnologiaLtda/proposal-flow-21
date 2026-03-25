import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from "remotion";

export const SceneDashboard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badgeScale = spring({ frame, fps, config: { damping: 12 } });
  const titleOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });

  const imgScale = interpolate(
    spring({ frame: frame - 20, fps, config: { damping: 15, stiffness: 80 } }),
    [0, 1], [0.9, 1]
  );
  const imgOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });

  // KPI cards animation
  const kpis = [
    { label: "Propostas Ganhas", value: "127", color: "#3b82f6" },
    { label: "Valor Total", value: "R$ 2.4M", color: "#10b981" },
    { label: "Taxa de Conversão", value: "68%", color: "#f59e0b" },
  ];

  // Final CTA
  const ctaOpacity = interpolate(frame, [160, 180], [0, 1], { extrapolateRight: "clamp" });
  const ctaScale = spring({ frame: frame - 160, fps, config: { damping: 12 } });

  // Fade out at end
  const fadeOut = interpolate(frame, [190, 210], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 80, opacity: fadeOut }}>
      {/* Top: badge + title */}
      <div style={{
        position: "absolute", left: 80, top: 60,
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          transform: `scale(${badgeScale})`,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "sans-serif", fontSize: 22, fontWeight: 700, color: "white",
            boxShadow: "0 4px 20px rgba(139,92,246,0.4)",
          }}>4</div>
          <span style={{
            fontFamily: "sans-serif", fontSize: 16, fontWeight: 600,
            color: "#8b5cf6", letterSpacing: 3, textTransform: "uppercase",
          }}>Visão Geral</span>
        </div>

        <h2 style={{
          fontFamily: "sans-serif", fontSize: 52, fontWeight: 800,
          color: "white", opacity: titleOpacity, lineHeight: 1.1,
        }}>
          Dashboard &<br />Indicadores
        </h2>
      </div>

      {/* KPI cards */}
      <div style={{
        position: "absolute", right: 80, top: 70,
        display: "flex", gap: 20,
      }}>
        {kpis.map((kpi, i) => {
          const delay = 30 + i * 12;
          const scale = spring({ frame: frame - delay, fps, config: { damping: 12 } });
          const opacity = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div key={i} style={{
              opacity, transform: `scale(${scale})`,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${kpi.color}30`,
              borderRadius: 16, padding: "24px 32px",
              display: "flex", flexDirection: "column", gap: 8,
              minWidth: 200,
            }}>
              <span style={{
                fontFamily: "sans-serif", fontSize: 14, color: "rgba(255,255,255,0.5)",
                fontWeight: 500,
              }}>{kpi.label}</span>
              <span style={{
                fontFamily: "sans-serif", fontSize: 36, fontWeight: 800,
                color: kpi.color,
              }}>{kpi.value}</span>
            </div>
          );
        })}
      </div>

      {/* Dashboard mockup */}
      <div style={{
        position: "absolute", left: "50%", top: 240,
        transform: `translateX(-50%) scale(${imgScale})`,
        width: 1400, height: 580,
        opacity: imgOpacity,
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 25px 80px rgba(0,0,0,0.5)",
      }}>
        <Img src={staticFile("images/mockup-dashboard.jpg")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Final CTA */}
      <div style={{
        position: "absolute", bottom: 40, left: "50%",
        transform: `translateX(-50%) scale(${ctaScale})`,
        opacity: ctaOpacity,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      }}>
        <span style={{
          fontFamily: "sans-serif", fontSize: 24, fontWeight: 700,
          color: "white",
          background: "linear-gradient(90deg, #3b82f6, #10b981)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Tudo em um só lugar.
        </span>
      </div>
    </AbsoluteFill>
  );
};
