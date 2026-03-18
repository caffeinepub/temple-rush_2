import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { GameState } from "../GamePage";
import type { GameControls } from "./GameScene";

interface Props {
  gameState: GameState;
  score: number;
  coins: number;
  highScore: number;
  controlsRef: React.MutableRefObject<GameControls | null>;
  onStart: () => void;
  onRestart: () => void;
}

export function GameHUD({
  gameState,
  score,
  coins,
  highScore,
  controlsRef,
  onStart,
  onRestart,
}: Props) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (gameState !== "running") return;
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (gameState !== "running" || !touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 30) controlsRef.current?.moveRight();
        else if (dx < -30) controlsRef.current?.moveLeft();
      } else if (dy < -30) {
        controlsRef.current?.jump();
      }
      touchStartRef.current = null;
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [gameState, controlsRef]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        fontFamily: "Montserrat, sans-serif",
      }}
    >
      {/* ─── In-game HUD ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {gameState === "running" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "absolute", inset: 0 }}
          >
            {/* Score — top left */}
            <div
              data-ocid="game.score.panel"
              style={{ position: "absolute", top: 20, left: 20 }}
            >
              <div
                style={{
                  fontSize: "clamp(2rem,5vw,3.5rem)",
                  fontWeight: 900,
                  color: "#FFB347",
                  lineHeight: 1,
                  textShadow:
                    "0 2px 12px rgba(0,0,0,.8),0 0 30px rgba(255,152,50,.4)",
                  letterSpacing: "-0.02em",
                }}
              >
                {score.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  color: "#C6CED0",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                Score
              </div>
            </div>

            {/* High score + coins — top right */}
            <div
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    color: "#C6CED0",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Best
                </span>
                <span
                  style={{
                    fontSize: "1.3rem",
                    fontWeight: 800,
                    color: "#fff",
                    textShadow: "0 2px 8px rgba(0,0,0,.8)",
                  }}
                >
                  {highScore.toLocaleString()}
                </span>
              </div>
              <div
                data-ocid="game.coins.panel"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span style={{ fontSize: "1.1rem" }}>🪙</span>
                <span
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    color: "#FFD700",
                    textShadow:
                      "0 2px 8px rgba(0,0,0,.8),0 0 20px rgba(255,200,0,.4)",
                  }}
                >
                  {coins}
                </span>
              </div>
            </div>

            {/* Mobile touch buttons */}
            <div
              style={{
                position: "absolute",
                bottom: 40,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "space-between",
                padding: "0 30px",
                pointerEvents: "auto",
              }}
              className="md:hidden"
            >
              <button
                type="button"
                data-ocid="game.left.button"
                className="touch-btn"
                onTouchStart={(e) => {
                  e.stopPropagation();
                  controlsRef.current?.moveLeft();
                }}
              >
                ◀
              </button>
              <button
                type="button"
                data-ocid="game.jump.button"
                className="touch-btn"
                style={{ width: 96, height: 96, fontSize: "2rem" }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  controlsRef.current?.jump();
                }}
              >
                ▲
              </button>
              <button
                type="button"
                data-ocid="game.right.button"
                className="touch-btn"
                onTouchStart={(e) => {
                  e.stopPropagation();
                  controlsRef.current?.moveRight();
                }}
              >
                ▶
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Start Screen ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {gameState === "idle" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(7,17,18,0.85)",
              backdropFilter: "blur(4px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
          >
            <motion.div
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                delay: 0.1,
                duration: 0.6,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ textAlign: "center", marginBottom: 8 }}
            >
              <div
                style={{
                  fontSize: "clamp(3rem,10vw,6.5rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                  background:
                    "linear-gradient(135deg,#FFD166 0%,#FFB347 40%,#E7771E 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "drop-shadow(0 4px 20px rgba(255,152,50,.5))",
                  lineHeight: 0.95,
                }}
              >
                TEMPLE
              </div>
              <div
                style={{
                  fontSize: "clamp(3rem,10vw,6.5rem)",
                  fontWeight: 900,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#fff",
                  filter: "drop-shadow(0 4px 20px rgba(0,0,0,.8))",
                  lineHeight: 0.95,
                  marginBottom: 8,
                }}
              >
                RUSH
              </div>
            </motion.div>

            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              style={{
                color: "#C6CED0",
                fontSize: "clamp(.85rem,2vw,1rem)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                textAlign: "center",
                marginBottom: 36,
                maxWidth: 400,
                padding: "0 20px",
              }}
            >
              Dodge obstacles · Collect coins · Survive the ruins
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              style={{
                display: "flex",
                gap: 24,
                marginBottom: 48,
                flexWrap: "wrap",
                justifyContent: "center",
                padding: "0 20px",
              }}
            >
              {[
                { icon: "⬅ ➡", label: "Change Lane" },
                { icon: "⬆ / Space", label: "Jump" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: "rgba(26,36,38,.8)",
                    border: "1px solid rgba(255,179,71,.25)",
                    borderRadius: 8,
                    padding: "10px 18px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      color: "#FFB347",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      marginBottom: 2,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div
                    style={{
                      color: "#C6CED0",
                      fontSize: "0.7rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </motion.div>

            <motion.button
              type="button"
              data-ocid="game.play.button"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4, type: "spring" }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={onStart}
              style={{
                background: "linear-gradient(135deg,#FFB347 0%,#E7771E 100%)",
                color: "#0B1416",
                fontWeight: 900,
                fontSize: "1.1rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                border: "none",
                borderRadius: 9999,
                padding: "18px 56px",
                cursor: "pointer",
                boxShadow:
                  "0 0 32px rgba(255,152,50,.5),0 8px 24px rgba(0,0,0,.5)",
              }}
            >
              PLAY
            </motion.button>

            {highScore > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                style={{
                  marginTop: 24,
                  color: "#C6CED0",
                  fontSize: "0.8rem",
                  letterSpacing: "0.1em",
                }}
              >
                BEST:{" "}
                <span style={{ color: "#FFB347", fontWeight: 700 }}>
                  {highScore.toLocaleString()}
                </span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Game Over Screen ────────────────────────────────────────────── */}
      <AnimatePresence>
        {gameState === "gameover" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(7,17,18,.88)",
              backdropFilter: "blur(6px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
          >
            <motion.div
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontSize: "clamp(2.5rem,8vw,5rem)",
                fontWeight: 900,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "#fff",
                textAlign: "center",
                filter: "drop-shadow(0 4px 20px rgba(0,0,0,.8))",
                marginBottom: 8,
              }}
            >
              GAME OVER
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                marginBottom: 48,
                marginTop: 20,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  data-ocid="gameover.score.panel"
                  style={{
                    fontSize: "clamp(3rem,8vw,5rem)",
                    fontWeight: 900,
                    color: "#FFB347",
                    lineHeight: 1,
                    textShadow: "0 0 30px rgba(255,152,50,.5)",
                  }}
                >
                  {score.toLocaleString()}
                </div>
                <div
                  style={{
                    color: "#C6CED0",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginTop: 4,
                  }}
                >
                  Final Score
                </div>
              </div>
              <div style={{ display: "flex", gap: 32, marginTop: 8 }}>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      color: "#FFD700",
                      fontWeight: 800,
                      fontSize: "1.5rem",
                    }}
                  >
                    🪙 {coins}
                  </div>
                  <div
                    style={{
                      color: "#C6CED0",
                      fontSize: "0.65rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      marginTop: 2,
                    }}
                  >
                    Coins
                  </div>
                </div>
                <div style={{ width: 1, background: "rgba(255,255,255,.1)" }} />
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: "1.5rem",
                    }}
                  >
                    {highScore.toLocaleString()}
                  </div>
                  <div
                    style={{
                      color: "#C6CED0",
                      fontSize: "0.65rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      marginTop: 2,
                    }}
                  >
                    Best
                  </div>
                </div>
              </div>
              {score > 0 && score >= highScore && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, type: "spring" }}
                  style={{
                    background: "linear-gradient(135deg,#FFB347,#E7771E)",
                    color: "#0B1416",
                    fontWeight: 800,
                    fontSize: "0.75rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    padding: "6px 18px",
                    borderRadius: 9999,
                  }}
                >
                  🏆 New High Score!
                </motion.div>
              )}
            </motion.div>

            <motion.button
              type="button"
              data-ocid="gameover.restart.button"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={onRestart}
              style={{
                background: "linear-gradient(135deg,#FFB347 0%,#E7771E 100%)",
                color: "#0B1416",
                fontWeight: 900,
                fontSize: "1.1rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                border: "none",
                borderRadius: 9999,
                padding: "18px 48px",
                cursor: "pointer",
                boxShadow:
                  "0 0 32px rgba(255,152,50,.5),0 8px 24px rgba(0,0,0,.5)",
              }}
            >
              PLAY AGAIN
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(198,206,208,.35)",
          fontSize: "0.65rem",
          letterSpacing: "0.08em",
          pointerEvents: "auto",
        }}
      >
        © {new Date().getFullYear()} · Built with ♥ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(255,179,71,.5)", textDecoration: "none" }}
        >
          caffeine.ai
        </a>
      </div>
    </div>
  );
}
