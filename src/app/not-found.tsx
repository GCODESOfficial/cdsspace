"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

interface FallingItem {
  id: number;
  x: number;
  y: number;
  speed: number;
  type: "logo" | "bomb" | "star";
  rotation: number;
}

const GAME_WIDTH = 800;
const GAME_HEIGHT = 500;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 14;

export default function NotFound() {
  const [gameState, setGameState] = useState<"intro" | "playing" | "gameover">("intro");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [items, setItems] = useState<FallingItem[]>([]);
  const [paddleX, setPaddleX] = useState(GAME_WIDTH / 2 - PADDLE_WIDTH / 2);
  const [floatingScore, setFloatingScore] = useState<{ id: number; x: number; y: number; value: string; color: string }[]>([]);

  const gameAreaRef = useRef<HTMLDivElement>(null);
  const itemIdRef = useRef(0);
  const floatIdRef = useRef(0);
  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const animRef = useRef<number>(0);

  // Load high score
  useEffect(() => {
    const stored = localStorage.getItem("cds-404-highscore");
    if (stored) setHighScore(parseInt(stored));
  }, []);

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem("cds-404-highscore", score.toString());
    }
  }, [score, highScore]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = true;
      if (e.key === " " && gameState !== "playing") {
        e.preventDefault();
        startGame();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [gameState]);

  // Mouse / touch controls
  const handlePointerMove = (e: React.PointerEvent) => {
    if (gameState !== "playing" || !gameAreaRef.current) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const scale = GAME_WIDTH / rect.width;
    const relX = (e.clientX - rect.left) * scale;
    setPaddleX(Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, relX - PADDLE_WIDTH / 2)));
  };

  const startGame = useCallback(() => {
    setGameState("playing");
    setScore(0);
    setLives(3);
    setCombo(0);
    setItems([]);
    setPaddleX(GAME_WIDTH / 2 - PADDLE_WIDTH / 2);
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState !== "playing") return;

    let lastSpawn = Date.now();
    let lastFrame = Date.now();

    const loop = () => {
      const now = Date.now();
      const dt = (now - lastFrame) / 16;
      lastFrame = now;

      // Spawn items based on score difficulty
      const spawnRate = Math.max(400, 1000 - score * 5);
      if (now - lastSpawn > spawnRate) {
        lastSpawn = now;
        const rand = Math.random();
        const type: FallingItem["type"] = rand > 0.85 ? "bomb" : rand > 0.7 ? "star" : "logo";
        setItems((prev) => [
          ...prev,
          {
            id: itemIdRef.current++,
            x: Math.random() * (GAME_WIDTH - 40),
            y: -40,
            speed: 2 + Math.random() * 2 + score * 0.02,
            type,
            rotation: Math.random() * 360,
          },
        ]);
      }

      // Move paddle (keyboard)
      if (keysRef.current.left) {
        setPaddleX((p) => Math.max(0, p - 8 * dt));
      }
      if (keysRef.current.right) {
        setPaddleX((p) => Math.min(GAME_WIDTH - PADDLE_WIDTH, p + 8 * dt));
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState, score]);

  // Item physics & collision
  useEffect(() => {
    if (gameState !== "playing") return;

    const interval = setInterval(() => {
      setItems((prev) => {
        const updated: FallingItem[] = [];
        let scoreDelta = 0;
        let lifeDelta = 0;
        let comboBoost = false;
        const newFloats: typeof floatingScore = [];

        for (const item of prev) {
          const newY = item.y + item.speed;
          const newRotation = item.rotation + 2;

          // Collision with paddle
          const paddleY = GAME_HEIGHT - 30;
          if (
            newY + 32 >= paddleY &&
            newY < paddleY + PADDLE_HEIGHT &&
            item.x + 32 > paddleX &&
            item.x < paddleX + PADDLE_WIDTH
          ) {
            if (item.type === "bomb") {
              lifeDelta -= 1;
              newFloats.push({
                id: floatIdRef.current++,
                x: item.x,
                y: newY,
                value: "-1 LIFE",
                color: "#ef4444",
              });
            } else if (item.type === "star") {
              scoreDelta += 10;
              comboBoost = true;
              newFloats.push({
                id: floatIdRef.current++,
                x: item.x,
                y: newY,
                value: "+10 ⭐",
                color: "#fbbf24",
              });
            } else {
              scoreDelta += 1;
              comboBoost = true;
              newFloats.push({
                id: floatIdRef.current++,
                x: item.x,
                y: newY,
                value: "+1",
                color: "#60a5fa",
              });
            }
            continue; // remove caught item
          }

          // Off screen
          if (newY > GAME_HEIGHT) {
            if (item.type === "logo" || item.type === "star") {
              // Missed a good one - reset combo
              if (item.type === "logo") {
                newFloats.push({
                  id: floatIdRef.current++,
                  x: item.x,
                  y: GAME_HEIGHT - 60,
                  value: "MISS",
                  color: "#6b7280",
                });
              }
            }
            continue;
          }

          updated.push({ ...item, y: newY, rotation: newRotation });
        }

        if (scoreDelta !== 0) {
          setScore((s) => s + scoreDelta * (combo > 5 ? 2 : 1));
        }
        if (lifeDelta !== 0) {
          setLives((l) => {
            const next = l + lifeDelta;
            if (next <= 0) {
              setGameState("gameover");
            }
            return Math.max(0, next);
          });
          setCombo(0);
        } else if (comboBoost) {
          setCombo((c) => c + 1);
        }

        if (newFloats.length > 0) {
          setFloatingScore((f) => [...f, ...newFloats]);
          setTimeout(() => {
            setFloatingScore((f) => f.filter((fs) => !newFloats.some((nf) => nf.id === fs.id)));
          }, 800);
        }

        return updated;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [gameState, paddleX, combo]);

  return (
    <div className="min-h-screen bg-[#000C17] text-white flex flex-col items-center justify-center p-4 font-inter overflow-hidden relative">
      {/* Background stars */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
              opacity: Math.random() * 0.6 + 0.2,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="text-center mb-4 relative z-10">
        <h1
          className="text-transparent bg-clip-text text-5xl md:text-7xl font-bold leading-none"
          style={{ backgroundImage: "linear-gradient(135deg, #040b37 20%, #8AADFF 60%, #5BA8FF 100%)" }}
        >
          404
        </h1>
        <p className="text-lg md:text-xl mt-1 text-white/80">Lost in space? Catch the logos to find your way home.</p>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 md:gap-6 mb-3 relative z-10 text-sm md:text-base">
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs uppercase tracking-wider">Score</span>
          <span className="font-bold text-blue-300 text-lg tabular-nums">{score}</span>
        </div>
        <div className="w-px h-5 bg-white/20" />
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={`text-xl transition-all ${i < lives ? "text-red-400" : "text-white/10"}`}>♥</span>
          ))}
        </div>
        <div className="w-px h-5 bg-white/20" />
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs uppercase tracking-wider">Best</span>
          <span className="font-bold text-amber-400 text-lg tabular-nums">{highScore}</span>
        </div>
        {combo > 2 && (
          <>
            <div className="w-px h-5 bg-white/20" />
            <div className="flex items-center gap-1 animate-pulse">
              <span className="text-amber-400 font-bold text-base">{combo}× COMBO!</span>
            </div>
          </>
        )}
      </div>

      {/* Game Area */}
      <div
        ref={gameAreaRef}
        onPointerMove={handlePointerMove}
        className="relative bg-gradient-to-b from-[#040b37]/60 to-[#000C17] border border-blue-500/20 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(40,80,255,0.2)] cursor-none touch-none"
        style={{
          width: "min(800px, 95vw)",
          aspectRatio: `${GAME_WIDTH} / ${GAME_HEIGHT}`,
        }}
      >
        {/* Inner game scaled to GAME_WIDTH */}
        <div
          className="absolute inset-0 origin-top-left"
          style={{
            width: `${GAME_WIDTH}px`,
            height: `${GAME_HEIGHT}px`,
            transform: `scale(min(1, calc(100% / ${GAME_WIDTH} * var(--scale, 100))))`,
            transformOrigin: "top left",
          }}
        >
          {/* Grid lines */}
          <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#5BA8FF" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Falling Items */}
          {items.map((item) => (
            <div
              key={item.id}
              className="absolute w-10 h-10 flex items-center justify-center"
              style={{
                left: `${item.x}px`,
                top: `${item.y}px`,
                transform: `rotate(${item.rotation}deg)`,
              }}
            >
              {item.type === "logo" && (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0035C1] to-[#5BA8FF] flex items-center justify-center text-white text-xs font-black shadow-[0_0_20px_rgba(91,168,255,0.6)]">
                  CDS
                </div>
              )}
              {item.type === "star" && (
                <div className="text-3xl drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]">⭐</div>
              )}
              {item.type === "bomb" && (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(239,68,68,0.6)] border border-red-400/40">
                  💣
                </div>
              )}
            </div>
          ))}

          {/* Floating score popups */}
          {floatingScore.map((f) => (
            <div
              key={f.id}
              className="absolute font-bold text-sm pointer-events-none animate-float-up"
              style={{ left: `${f.x}px`, top: `${f.y}px`, color: f.color }}
            >
              {f.value}
            </div>
          ))}

          {/* Paddle */}
          {gameState === "playing" && (
            <div
              className="absolute bg-gradient-to-r from-[#0035C1] via-[#5BA8FF] to-[#0035C1] rounded-full shadow-[0_0_20px_rgba(91,168,255,0.6)] transition-none"
              style={{
                left: `${paddleX}px`,
                bottom: "16px",
                width: `${PADDLE_WIDTH}px`,
                height: `${PADDLE_HEIGHT}px`,
              }}
            />
          )}
        </div>

        {/* Intro Overlay */}
        {gameState === "intro" && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center z-20 p-6">
            <h2 className="text-3xl md:text-4xl font-bold mb-3 text-center">Catch the CDS Logos</h2>
            <p className="text-white/70 text-center max-w-md mb-6 text-sm md:text-base">
              Move with <kbd className="px-2 py-0.5 bg-white/10 rounded text-xs">←</kbd> <kbd className="px-2 py-0.5 bg-white/10 rounded text-xs">→</kbd>, mouse, or touch.
              Catch <span className="text-blue-300 font-semibold">CDS logos</span> for points,
              grab <span className="text-amber-400 font-semibold">⭐ stars</span> for bonus,
              and avoid <span className="text-red-400 font-semibold">💣 bombs</span>.
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-[#0035C1] to-[#5BA8FF] rounded-full font-semibold text-white shadow-[0_0_30px_rgba(91,168,255,0.5)] hover:scale-105 transition-transform"
            >
              ▶ Play
            </button>
            <p className="text-white/30 text-xs mt-4">Press SPACE to start</p>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState === "gameover" && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 p-6">
            <h2 className="text-3xl md:text-4xl font-bold mb-2">Game Over</h2>
            <p className="text-white/60 mb-6 text-center">
              You scored <span className="font-bold text-blue-300 text-xl">{score}</span> points
              {score === highScore && score > 0 && <span className="block text-amber-400 text-sm mt-1">🏆 New High Score!</span>}
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              <button
                onClick={startGame}
                className="px-6 py-2.5 bg-gradient-to-r from-[#0035C1] to-[#5BA8FF] rounded-full font-semibold text-white shadow-lg hover:scale-105 transition-transform"
              >
                ▶ Play Again
              </button>
              <Link
                href="/"
                className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full font-medium text-white transition"
              >
                Go Home
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="mt-4 flex items-center gap-3 relative z-10">
        <Link
          href="/"
          className="px-5 py-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/80 hover:text-white transition flex items-center gap-2"
        >
          ← Back to CDS Space
        </Link>
        <span className="text-white/30 text-xs hidden md:inline">A 404 by CDS Space - even our missing pages are unicorns 🦄</span>
      </div>

      <style jsx>{`
        @keyframes float-up {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-40px); }
        }
        .animate-float-up { animation: float-up 0.8s ease-out forwards; }

        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; }
        }
        .animate-twinkle { animation: twinkle 3s ease-in-out infinite; }

        kbd {
          font-family: ui-monospace, monospace;
          border: 1px solid rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}
