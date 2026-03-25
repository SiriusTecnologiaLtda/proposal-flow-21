import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { SceneIntro } from "./scenes/SceneIntro";
import { SceneInclusao } from "./scenes/SceneInclusao";
import { SceneGeracao } from "./scenes/SceneGeracao";
import { SceneAssinatura } from "./scenes/SceneAssinatura";
import { SceneDashboard } from "./scenes/SceneDashboard";

const TRANSITION_DURATION = 20;
const springConfig = { damping: 200 };

export const MainVideo = () => {
  const frame = useCurrentFrame();

  // Persistent animated gradient background
  const gradientAngle = interpolate(frame, [0, 900], [135, 225]);
  
  return (
    <AbsoluteFill>
      {/* Animated gradient base */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${gradientAngle}deg, #0a1628 0%, #1a2744 30%, #0d1f3c 60%, #0a1628 100%)`,
        }}
      />

      {/* Floating accent shapes */}
      <FloatingAccents frame={frame} />

      {/* Scene transitions */}
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={150}>
          <SceneIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />
        <TransitionSeries.Sequence durationInFrames={200}>
          <SceneInclusao />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />
        <TransitionSeries.Sequence durationInFrames={200}>
          <SceneGeracao />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />
        <TransitionSeries.Sequence durationInFrames={200}>
          <SceneAssinatura />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />
        <TransitionSeries.Sequence durationInFrames={210}>
          <SceneDashboard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

const FloatingAccents = ({ frame }: { frame: number }) => {
  const y1 = Math.sin(frame * 0.02) * 30;
  const y2 = Math.cos(frame * 0.015) * 40;
  const x1 = Math.cos(frame * 0.01) * 20;

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 100 + y1,
          right: 100 + x1,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 200 + y2,
          left: 150,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)",
        }}
      />
    </>
  );
};
