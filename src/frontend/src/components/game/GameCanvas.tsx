import { Canvas } from "@react-three/fiber";
import { memo } from "react";
import type { GameState } from "../GamePage";
import { type GameControls, GameScene } from "./GameScene";

interface Props {
  gameState: GameState;
  controlsRef: React.MutableRefObject<GameControls | null>;
  onGameOver: (score: number, coins: number) => void;
  onScoreUpdate: (score: number, coins: number) => void;
}

export const GameCanvas = memo(function GameCanvas({
  gameState,
  controlsRef,
  onGameOver,
  onScoreUpdate,
}: Props) {
  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{ position: [0, 4.5, -10], fov: 70, near: 0.1, far: 500 }}
      shadows
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.5]}
    >
      <GameScene
        gameState={gameState}
        controlsRef={controlsRef}
        onGameOver={onGameOver}
        onScoreUpdate={onScoreUpdate}
      />
    </Canvas>
  );
});
