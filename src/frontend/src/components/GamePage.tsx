import { useCallback, useEffect, useRef, useState } from "react";
import { useGetHighScore, useSubmitScore } from "../hooks/useQueries";
import { GameCanvas } from "./game/GameCanvas";
import { GameHUD } from "./game/GameHUD";
import type { GameControls } from "./game/GameScene";

export type GameState = "idle" | "running" | "gameover";

export default function GamePage() {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [localHighScore, setLocalHighScore] = useState(() => {
    const saved = localStorage.getItem("temple_rush_hs");
    return saved ? Number.parseInt(saved, 10) : 0;
  });

  const controlsRef = useRef<GameControls | null>(null);

  const { data: backendHighScore } = useGetHighScore();
  const submitScore = useSubmitScore();

  // Merge backend high score with local
  const highScore = Math.max(localHighScore, backendHighScore ?? 0);

  const handleScoreUpdate = useCallback((s: number, c: number) => {
    setScore(s);
    setCoins(c);
  }, []);

  const handleGameOver = useCallback(
    (finalScore: number, finalCoins: number) => {
      setScore(finalScore);
      setCoins(finalCoins);
      setGameState("gameover");

      if (finalScore > localHighScore) {
        setLocalHighScore(finalScore);
        localStorage.setItem("temple_rush_hs", String(finalScore));
        submitScore.mutate(finalScore);
      }
    },
    [localHighScore, submitScore],
  );

  const handleStart = useCallback(() => {
    setScore(0);
    setCoins(0);
    setGameState("running");
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (gameState !== "running") return;
      if (e.key === "ArrowLeft") controlsRef.current?.moveLeft();
      else if (e.key === "ArrowRight") controlsRef.current?.moveRight();
      else if (e.key === "ArrowUp" || e.key === " ") {
        e.preventDefault();
        controlsRef.current?.jump();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [gameState]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: "#071112",
      }}
    >
      <GameCanvas
        gameState={gameState}
        controlsRef={controlsRef}
        onGameOver={handleGameOver}
        onScoreUpdate={handleScoreUpdate}
      />
      <GameHUD
        gameState={gameState}
        score={score}
        coins={coins}
        highScore={highScore}
        controlsRef={controlsRef}
        onStart={handleStart}
        onRestart={handleStart}
      />
    </div>
  );
}
