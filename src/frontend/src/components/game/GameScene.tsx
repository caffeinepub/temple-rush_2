import { useFrame } from "@react-three/fiber";
import type React from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GameState } from "../GamePage";

// ─── Constants ───────────────────────────────────────────────────────────────
const TILE_LENGTH = 20;
const TILE_WIDTH = 5;
const TILE_COUNT = 12;
const LANE_X: [number, number, number] = [-1.5, 0, 1.5];
const COIN_POOL = 40;
const HOLE_POOL = 20;
const BOOST_POOL = 10;
const ROCK_POOL = 15;
const BRIDGE_POOL = 4;
const BRIDGE_GAP_HALF = 4.0;
const BRIDGE_PLAT_LEN = 8;
const JUMP_VELOCITY = 16;
const GRAVITY = 22;
const INITIAL_SPEED = 16;
const MAX_SPEED = 50;
const SPEED_RAMP = 1.2;
const BOOST_MULTIPLIER = 1.5;
const BOOST_DURATION = 3.0;
const TILE_KEYS = Array.from({ length: TILE_COUNT }, (_, i) => `tile-${i}`);
const BRIDGE_KEYS = Array.from(
  { length: BRIDGE_POOL },
  (_, i) => `bridge-slot-${i}`,
);
const BUILDING_COUNT_PER_SIDE = 8;
const BUILDING_CYCLE = 200;
const WATERFALL_ZS = [30, 110, 190, 270] as const;
const SPLASH_OFFSETS = [
  { ox: 0.3, key: "s0" },
  { ox: -0.25, key: "s1" },
  { ox: 0.5, key: "s2" },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────
export interface GameControls {
  moveLeft: () => void;
  moveRight: () => void;
  jump: () => void;
}

interface CoinData {
  wz: number;
  lane: number;
  active: boolean;
}

interface HoleData {
  wz: number;
  lane: number;
  active: boolean;
}

interface BoostData {
  wz: number;
  active: boolean;
}

interface RockData {
  wz: number;
  lane: number;
  active: boolean;
  fallY: number;
  landed: boolean;
  landedTimer: number;
}

interface BridgeData {
  wz: number;
  active: boolean;
}

interface Props {
  gameState: GameState;
  controlsRef: React.MutableRefObject<GameControls | null>;
  onGameOver: (score: number, coins: number) => void;
  onScoreUpdate: (score: number, coins: number) => void;
}

const _tm = new THREE.Matrix4();
const _tv = new THREE.Vector3();
const _tq = new THREE.Quaternion();
const _ts = new THREE.Vector3(1, 1, 1);
const _offMatrix = new THREE.Matrix4().makeTranslation(0, -1000, 0);
const _euler = new THREE.Euler();
const _holeScale = new THREE.Vector3(2.5, 1, 10);
const _boostScale = new THREE.Vector3(TILE_WIDTH, 1, 6);
const _identityQ = new THREE.Quaternion();
const _rockScale = new THREE.Vector3(1, 1, 1);

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TreeDef {
  treeKey: string;
  side: 1 | -1;
  x: number;
  z: number;
  height: number;
  trunkRadius: number;
  canopyRadius: number;
}

function buildTrees(tileIndex: number): TreeDef[] {
  const rng = seededRng(tileIndex * 1000 + 42);
  const count = 3 + Math.floor(rng() * 3);
  const trees: TreeDef[] = [];
  for (let i = 0; i < count; i++) {
    const side = (i % 2 === 0 ? 1 : -1) as 1 | -1;
    const x = side * (3.5 + rng() * 2);
    const z = -TILE_LENGTH / 2 + rng() * TILE_LENGTH;
    const height = 1.4 + rng() * 1.2;
    const trunkRadius = 0.1 + rng() * 0.08;
    const canopyRadius = 0.7 + rng() * 0.6;
    trees.push({
      treeKey: `t${tileIndex}-${i}`,
      side,
      x,
      z,
      height,
      trunkRadius,
      canopyRadius,
    });
  }
  return trees;
}

const TILE_TREES = Array.from({ length: TILE_COUNT }, (_, i) => buildTrees(i));

function TileTree({ t }: { t: TreeDef }) {
  const trunkY = t.height / 2;
  const canopyLowY = t.height + t.canopyRadius * 0.55;
  const canopyHighY = t.height + t.canopyRadius * 0.95;
  return (
    <group position={[t.x, 0, t.z]}>
      <mesh position={[0, trunkY, 0]} castShadow>
        <cylinderGeometry
          args={[t.trunkRadius * 0.7, t.trunkRadius, t.height, 7]}
        />
        <meshStandardMaterial color="#6B3A1F" roughness={0.9} />
      </mesh>
      <mesh position={[0, canopyLowY, 0]} castShadow>
        <sphereGeometry args={[t.canopyRadius, 7, 6]} />
        <meshStandardMaterial color="#2D6A2D" roughness={0.85} />
      </mesh>
      <mesh position={[0, canopyHighY, 0]} castShadow>
        <sphereGeometry args={[t.canopyRadius * 0.72, 7, 6]} />
        <meshStandardMaterial color="#4A9A3A" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ─── Building definitions (static, seeded) ────────────────────────────────────
interface BuildingDef {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  windows: Array<{ id: string; wx: number; wy: number; wz: number }>;
}

function buildBuildingDefs(): BuildingDef[] {
  const rng = seededRng(9999);
  const defs: BuildingDef[] = [];
  const sides = [
    { xMin: -30, xMax: -22 },
    { xMin: 22, xMax: 30 },
  ];
  let bIdx = 0;
  for (const side of sides) {
    for (let i = 0; i < BUILDING_COUNT_PER_SIDE; i++) {
      const bi = bIdx++;
      const x = side.xMin + rng() * (side.xMax - side.xMin);
      const z = rng() * BUILDING_CYCLE;
      const width = 2 + rng() * 3;
      const depth = 3 + rng() * 3;
      const height = 6 + rng() * 14;
      const grayVal = Math.floor(30 + rng() * 40);
      const color = `rgb(${grayVal},${grayVal + 5},${grayVal + 10})`;
      // Generate window positions
      const windows: Array<{ id: string; wx: number; wy: number; wz: number }> =
        [];
      const floorsCount = Math.floor(height / 2.5);
      for (let f = 0; f < floorsCount; f++) {
        const wCount = Math.floor(1 + rng() * 2);
        for (let w = 0; w < wCount; w++) {
          windows.push({
            id: `w-f${f}-${w}`,
            wx: (rng() - 0.5) * width * 0.7,
            wy: 1.2 + f * 2.4,
            wz: depth / 2 + 0.02,
          });
        }
      }
      defs.push({ id: `b${bi}`, x, z, width, depth, height, color, windows });
    }
  }
  return defs;
}

const BUILDING_DEFS = buildBuildingDefs();

export function GameScene({
  gameState,
  controlsRef,
  onGameOver,
  onScoreUpdate,
}: Props) {
  const gameStateRef = useRef<GameState>(gameState);
  const worldOffsetRef = useRef(0);
  const speedRef = useRef(INITIAL_SPEED);
  const playerLaneRef = useRef(1);
  const playerXRef = useRef(LANE_X[1]);
  const playerYRef = useRef(0);
  const jumpVelRef = useRef(0);
  const isJumpingRef = useRef(false);
  const scoreRef = useRef(0);
  const coinsCountRef = useRef(0);
  const timeRef = useRef(0);
  const nextSpawnWZRef = useRef(60);
  const nextHoleWZRef = useRef(80);
  const nextBoostWZRef = useRef(150);
  const nextRockWZRef = useRef(120);
  const nextBridgeWZRef = useRef(200);
  const boostTimeRef = useRef(0);
  const baseSpeedRef = useRef(INITIAL_SPEED);
  const cameraXRef = useRef(0);
  const lastScoreReportRef = useRef(0);

  const cbRef = useRef({ onGameOver, onScoreUpdate });
  useEffect(() => {
    cbRef.current = { onGameOver, onScoreUpdate };
  });

  const tileWZRef = useRef<number[]>(
    Array.from({ length: TILE_COUNT }, (_, i) => i * TILE_LENGTH),
  );
  const tileMaxWZRef = useRef((TILE_COUNT - 1) * TILE_LENGTH);

  const coinDataRef = useRef<CoinData[]>(
    Array.from({ length: COIN_POOL }, () => ({
      wz: -1000,
      lane: 0,
      active: false,
    })),
  );
  const holeDataRef = useRef<HoleData[]>(
    Array.from({ length: HOLE_POOL }, () => ({
      wz: -1000,
      lane: 0,
      active: false,
    })),
  );
  const boostDataRef = useRef<BoostData[]>(
    Array.from({ length: BOOST_POOL }, () => ({ wz: -1000, active: false })),
  );
  const rockDataRef = useRef<RockData[]>(
    Array.from({ length: ROCK_POOL }, () => ({
      wz: -1000,
      lane: 0,
      active: false,
      fallY: 8,
      landed: false,
      landedTimer: 0,
    })),
  );
  const bridgeDataRef = useRef<BridgeData[]>(
    Array.from({ length: BRIDGE_POOL }, () => ({ wz: -1000, active: false })),
  );

  const playerGroupRef = useRef<THREE.Group>(null!);
  const playerMeshRef = useRef<THREE.Group>(null!);
  const torsoGroupRef = useRef<THREE.Group>(null!);
  const legLeftRef = useRef<THREE.Mesh>(null!);
  const legRightRef = useRef<THREE.Mesh>(null!);
  const armLeftRef = useRef<THREE.Mesh>(null!);
  const armRightRef = useRef<THREE.Mesh>(null!);
  const walkingStickRef = useRef<THREE.Group>(null!);
  const tileGroupRefs = useRef<Array<THREE.Group | null>>(
    Array(TILE_COUNT).fill(null),
  );
  const coinInstanceRef = useRef<THREE.InstancedMesh>(null!);
  const holeInstanceRef = useRef<THREE.InstancedMesh>(null!);
  const boostInstanceRef = useRef<THREE.InstancedMesh>(null!);
  const rockInstanceRef = useRef<THREE.InstancedMesh>(null!);
  const bridgeGroupRefs = useRef<Array<THREE.Group | null>>(
    Array(BRIDGE_POOL).fill(null),
  );

  // Waterfall animation refs — 3 planes, each with its own mesh ref
  const wfPlane0Ref = useRef<THREE.Mesh>(null!);
  const wfPlane1Ref = useRef<THREE.Mesh>(null!);
  const wfPlane2Ref = useRef<THREE.Mesh>(null!);

  // Buildings group ref for parallax scrolling
  const buildingGroupRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    if (coinInstanceRef.current) {
      for (let i = 0; i < COIN_POOL; i++)
        coinInstanceRef.current.setMatrixAt(i, _offMatrix);
      coinInstanceRef.current.instanceMatrix.needsUpdate = true;
    }
    if (holeInstanceRef.current) {
      for (let i = 0; i < HOLE_POOL; i++)
        holeInstanceRef.current.setMatrixAt(i, _offMatrix);
      holeInstanceRef.current.instanceMatrix.needsUpdate = true;
    }
    if (boostInstanceRef.current) {
      for (let i = 0; i < BOOST_POOL; i++)
        boostInstanceRef.current.setMatrixAt(i, _offMatrix);
      boostInstanceRef.current.instanceMatrix.needsUpdate = true;
    }
    if (rockInstanceRef.current) {
      for (let i = 0; i < ROCK_POOL; i++)
        rockInstanceRef.current.setMatrixAt(i, _offMatrix);
      rockInstanceRef.current.instanceMatrix.needsUpdate = true;
    }
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
    if (gameState === "running") {
      worldOffsetRef.current = 0;
      speedRef.current = INITIAL_SPEED;
      baseSpeedRef.current = INITIAL_SPEED;
      boostTimeRef.current = 0;
      playerLaneRef.current = 1;
      playerXRef.current = LANE_X[1];
      playerYRef.current = 0;
      jumpVelRef.current = 0;
      isJumpingRef.current = false;
      scoreRef.current = 0;
      coinsCountRef.current = 0;
      timeRef.current = 0;
      nextSpawnWZRef.current = 60;
      nextHoleWZRef.current = 80;
      nextBoostWZRef.current = 150;
      nextRockWZRef.current = 120;
      nextBridgeWZRef.current = 200;
      cameraXRef.current = 0;
      lastScoreReportRef.current = 0;

      const newWZs = Array.from(
        { length: TILE_COUNT },
        (_, i) => i * TILE_LENGTH,
      );
      tileWZRef.current = newWZs;
      tileMaxWZRef.current = (TILE_COUNT - 1) * TILE_LENGTH;
      for (let i = 0; i < TILE_COUNT; i++) {
        const g = tileGroupRefs.current[i];
        if (g) g.position.z = newWZs[i];
      }

      for (const c of coinDataRef.current) {
        c.active = false;
        c.wz = -1000;
      }
      for (const h of holeDataRef.current) {
        h.active = false;
        h.wz = -1000;
      }
      for (const b of boostDataRef.current) {
        b.active = false;
        b.wz = -1000;
      }
      for (const r of rockDataRef.current) {
        r.active = false;
        r.wz = -1000;
        r.fallY = 8;
        r.landed = false;
        r.landedTimer = 0;
      }
      for (const b of bridgeDataRef.current) {
        b.active = false;
        b.wz = -1000;
      }
      for (let i = 0; i < BRIDGE_POOL; i++) {
        const g = bridgeGroupRefs.current[i];
        if (g) g.position.z = -1000;
      }

      if (coinInstanceRef.current) {
        for (let i = 0; i < COIN_POOL; i++)
          coinInstanceRef.current.setMatrixAt(i, _offMatrix);
        coinInstanceRef.current.instanceMatrix.needsUpdate = true;
      }
      if (holeInstanceRef.current) {
        for (let i = 0; i < HOLE_POOL; i++)
          holeInstanceRef.current.setMatrixAt(i, _offMatrix);
        holeInstanceRef.current.instanceMatrix.needsUpdate = true;
      }
      if (boostInstanceRef.current) {
        for (let i = 0; i < BOOST_POOL; i++)
          boostInstanceRef.current.setMatrixAt(i, _offMatrix);
        boostInstanceRef.current.instanceMatrix.needsUpdate = true;
      }
      if (rockInstanceRef.current) {
        for (let i = 0; i < ROCK_POOL; i++)
          rockInstanceRef.current.setMatrixAt(i, _offMatrix);
        rockInstanceRef.current.instanceMatrix.needsUpdate = true;
      }
      if (playerGroupRef.current)
        playerGroupRef.current.position.set(LANE_X[1], 0, 0);
    }
  }, [gameState]);

  useEffect(() => {
    controlsRef.current = {
      moveLeft: () => {
        if (gameStateRef.current !== "running") return;
        playerLaneRef.current = Math.max(0, playerLaneRef.current - 1);
      },
      moveRight: () => {
        if (gameStateRef.current !== "running") return;
        playerLaneRef.current = Math.min(2, playerLaneRef.current + 1);
      },
      jump: () => {
        if (gameStateRef.current !== "running") return;
        if (!isJumpingRef.current) {
          isJumpingRef.current = true;
          jumpVelRef.current = JUMP_VELOCITY;
        }
      },
    };
  }, [controlsRef]);

  const spawnRow = (wz: number) => {
    for (let lane = 0; lane < 3; lane++) {
      if (Math.random() < 0.65) {
        const count = 1 + Math.floor(Math.random() * 3);
        for (let j = 0; j < count; j++) {
          const slot = coinDataRef.current.findIndex((c) => !c.active);
          if (slot >= 0)
            coinDataRef.current[slot] = { wz: wz - j * 3, lane, active: true };
        }
      }
    }
  };

  const spawnHole = (wz: number) => {
    const lane = Math.floor(Math.random() * 3);
    const slot = holeDataRef.current.findIndex((h) => !h.active);
    if (slot >= 0) holeDataRef.current[slot] = { wz, lane, active: true };
  };

  const spawnBoost = (wz: number) => {
    const slot = boostDataRef.current.findIndex((b) => !b.active);
    if (slot >= 0) boostDataRef.current[slot] = { wz, active: true };
  };

  const spawnRock = (wz: number) => {
    const lane = Math.floor(Math.random() * 3);
    const slot = rockDataRef.current.findIndex((r) => !r.active);
    if (slot >= 0) {
      rockDataRef.current[slot] = {
        wz,
        lane,
        active: true,
        fallY: 8,
        landed: false,
        landedTimer: 0,
      };
    }
  };

  const spawnBridge = (wz: number) => {
    const slot = bridgeDataRef.current.findIndex((b) => !b.active);
    if (slot >= 0) bridgeDataRef.current[slot] = { wz, active: true };
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    timeRef.current += dt;
    const t = timeRef.current;

    if (gameStateRef.current !== "running") {
      if (playerMeshRef.current) {
        playerMeshRef.current.position.y = Math.sin(t * 2) * 0.1;
        playerMeshRef.current.rotation.y = Math.sin(t * 0.4) * 0.3;
      }
      if (legLeftRef.current)
        legLeftRef.current.rotation.x = Math.sin(t * 2) * 0.2;
      if (legRightRef.current)
        legRightRef.current.rotation.x = -Math.sin(t * 2) * 0.2;
      // Animate waterfall even when not running
      animateWaterfalls(t);
      return;
    }

    baseSpeedRef.current = Math.min(INITIAL_SPEED + t * SPEED_RAMP, MAX_SPEED);

    if (boostTimeRef.current > 0) {
      boostTimeRef.current -= dt;
      speedRef.current = Math.min(
        baseSpeedRef.current * BOOST_MULTIPLIER,
        MAX_SPEED,
      );
    } else {
      boostTimeRef.current = 0;
      speedRef.current = baseSpeedRef.current;
    }

    worldOffsetRef.current += speedRef.current * dt;
    const wo = worldOffsetRef.current;

    const targetX = LANE_X[playerLaneRef.current];
    playerXRef.current += (targetX - playerXRef.current) * Math.min(12 * dt, 1);

    if (isJumpingRef.current) {
      playerYRef.current += jumpVelRef.current * dt;
      jumpVelRef.current -= GRAVITY * dt;
      if (playerYRef.current <= 0) {
        playerYRef.current = 0;
        isJumpingRef.current = false;
        jumpVelRef.current = 0;
      }
    }

    if (playerGroupRef.current) {
      playerGroupRef.current.position.x = playerXRef.current;
      playerGroupRef.current.position.y = playerYRef.current;
    }

    if (playerMeshRef.current) {
      playerMeshRef.current.position.y = Math.sin(t * 14) * 0.04;
      playerMeshRef.current.rotation.z = -(targetX - playerXRef.current) * 0.25;
      if (isJumpingRef.current) {
        const stretch = 1 + jumpVelRef.current * 0.025;
        playerMeshRef.current.scale.y = Math.max(0.85, Math.min(1.25, stretch));
        playerMeshRef.current.scale.x =
          1 / Math.max(0.85, playerMeshRef.current.scale.y);
      } else {
        playerMeshRef.current.scale.y +=
          (1 - playerMeshRef.current.scale.y) * 12 * dt;
        playerMeshRef.current.scale.x +=
          (1 - playerMeshRef.current.scale.x) * 12 * dt;
      }
    }

    const runCycle = t * 10;
    const legSwing = Math.sin(runCycle) * 0.55;
    if (legLeftRef.current) legLeftRef.current.rotation.x = legSwing;
    if (legRightRef.current) legRightRef.current.rotation.x = -legSwing;

    const armSwing = Math.sin(runCycle) * 0.4;
    if (armLeftRef.current) armLeftRef.current.rotation.x = -armSwing;
    if (armRightRef.current) armRightRef.current.rotation.x = armSwing;

    const tileWZs = tileWZRef.current;
    for (let i = 0; i < TILE_COUNT; i++) {
      if (tileWZs[i] - wo < -TILE_LENGTH * 1.5) {
        tileMaxWZRef.current += TILE_LENGTH;
        tileWZs[i] = tileMaxWZRef.current;
      }
      const g = tileGroupRefs.current[i];
      if (g) g.position.z = tileWZs[i] - wo;
    }

    while (wo + 220 > nextSpawnWZRef.current) {
      spawnRow(nextSpawnWZRef.current);
      nextSpawnWZRef.current += 10 + Math.random() * 10;
    }
    while (wo + 220 > nextHoleWZRef.current) {
      spawnHole(nextHoleWZRef.current);
      nextHoleWZRef.current += 40 + Math.random() * 20;
    }
    while (wo + 220 > nextBoostWZRef.current) {
      spawnBoost(nextBoostWZRef.current);
      nextBoostWZRef.current += 80 + Math.random() * 40;
    }
    // Rock spawning
    while (wo + 220 > nextRockWZRef.current) {
      spawnRock(nextRockWZRef.current);
      nextRockWZRef.current += 35 + Math.random() * 25;
    }
    // Bridge spawning
    while (wo + 250 > nextBridgeWZRef.current) {
      spawnBridge(nextBridgeWZRef.current);
      nextBridgeWZRef.current += 180 + Math.random() * 80;
    }
    // Update bridge group positions
    for (let i = 0; i < BRIDGE_POOL; i++) {
      const b = bridgeDataRef.current[i];
      const g = bridgeGroupRefs.current[i];
      if (!g) continue;
      if (!b.active) {
        g.position.z = -1000;
        continue;
      }
      const sz = b.wz - wo;
      if (sz < -(BRIDGE_PLAT_LEN + BRIDGE_GAP_HALF + 12)) {
        b.active = false;
        g.position.z = -1000;
      } else {
        g.position.z = sz;
      }
    }
    // Bridge gap collision — full width, player must jump
    for (let i = 0; i < BRIDGE_POOL; i++) {
      const b = bridgeDataRef.current[i];
      if (!b.active) continue;
      const sz = b.wz - wo;
      const py = playerYRef.current;
      if (Math.abs(sz) < BRIDGE_GAP_HALF - 0.5 && py < 0.25) {
        cbRef.current.onGameOver(scoreRef.current, coinsCountRef.current);
        return;
      }
    }

    if (coinInstanceRef.current) {
      _euler.set(t * 3, t * 2, 0);
      const coinQ = _tq.setFromEuler(_euler);
      for (let i = 0; i < COIN_POOL; i++) {
        const c = coinDataRef.current[i];
        if (c.active) {
          const sz = c.wz - wo;
          if (sz < -8) {
            c.active = false;
            coinInstanceRef.current.setMatrixAt(i, _offMatrix);
          } else {
            _tv.set(LANE_X[c.lane], 0.9 + Math.sin(t * 4 + i * 1.3) * 0.12, sz);
            _tm.compose(_tv, coinQ, _ts);
            coinInstanceRef.current.setMatrixAt(i, _tm);
          }
        } else {
          coinInstanceRef.current.setMatrixAt(i, _offMatrix);
        }
      }
      coinInstanceRef.current.instanceMatrix.needsUpdate = true;
    }

    if (holeInstanceRef.current) {
      for (let i = 0; i < HOLE_POOL; i++) {
        const h = holeDataRef.current[i];
        if (h.active) {
          const sz = h.wz - wo;
          if (sz < -8) {
            h.active = false;
            holeInstanceRef.current.setMatrixAt(i, _offMatrix);
          } else {
            _tv.set(LANE_X[h.lane], 0.17, sz);
            _tm.compose(_tv, _identityQ, _holeScale);
            holeInstanceRef.current.setMatrixAt(i, _tm);
          }
        } else {
          holeInstanceRef.current.setMatrixAt(i, _offMatrix);
        }
      }
      holeInstanceRef.current.instanceMatrix.needsUpdate = true;
    }

    if (boostInstanceRef.current) {
      const boostPulse = 0.6 + Math.sin(t * 8) * 0.35;
      const mat = boostInstanceRef.current
        .material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = boostPulse;
      for (let i = 0; i < BOOST_POOL; i++) {
        const b = boostDataRef.current[i];
        if (b.active) {
          const sz = b.wz - wo;
          if (sz < -8) {
            b.active = false;
            boostInstanceRef.current.setMatrixAt(i, _offMatrix);
          } else {
            _tv.set(0, 0.18, sz);
            _tm.compose(_tv, _identityQ, _boostScale);
            boostInstanceRef.current.setMatrixAt(i, _tm);
          }
        } else {
          boostInstanceRef.current.setMatrixAt(i, _offMatrix);
        }
      }
      boostInstanceRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Rocks: fall, land, despawn ─────────────────────────────────────────
    if (rockInstanceRef.current) {
      for (let i = 0; i < ROCK_POOL; i++) {
        const r = rockDataRef.current[i];
        if (!r.active) {
          rockInstanceRef.current.setMatrixAt(i, _offMatrix);
          continue;
        }
        const sz = r.wz - wo;
        // Despawn if behind camera or timed out
        if (sz < -10) {
          r.active = false;
          rockInstanceRef.current.setMatrixAt(i, _offMatrix);
          continue;
        }
        if (!r.landed) {
          r.fallY -= 6 * dt;
          if (r.fallY <= 0.35) {
            r.fallY = 0.35;
            r.landed = true;
            r.landedTimer = 0;
          }
        } else {
          r.landedTimer += dt;
          if (r.landedTimer > 2.0) {
            r.active = false;
            rockInstanceRef.current.setMatrixAt(i, _offMatrix);
            continue;
          }
        }
        _tv.set(LANE_X[r.lane], r.fallY, sz);
        _tm.compose(_tv, _identityQ, _rockScale);
        rockInstanceRef.current.setMatrixAt(i, _tm);
      }
      rockInstanceRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Waterfall animation ───────────────────────────────────────────────────
    animateWaterfalls(t);

    // ── Buildings parallax ────────────────────────────────────────────────────
    if (buildingGroupRef.current) {
      const parallaxOffset = -(wo * 0.3) % BUILDING_CYCLE;
      buildingGroupRef.current.position.z = parallaxOffset;
    }

    scoreRef.current = Math.floor(wo * 0.6) + coinsCountRef.current * 10;
    if (scoreRef.current - lastScoreReportRef.current > 15) {
      cbRef.current.onScoreUpdate(scoreRef.current, coinsCountRef.current);
      lastScoreReportRef.current = scoreRef.current;
    }

    const px = playerXRef.current;
    const py = playerYRef.current;

    for (let i = 0; i < COIN_POOL; i++) {
      const c = coinDataRef.current[i];
      if (!c.active) continue;
      const cz = c.wz - wo;
      if (Math.abs(cz) < 1.0 && Math.abs(LANE_X[c.lane] - px) < 0.95) {
        c.active = false;
        coinsCountRef.current += 1;
        cbRef.current.onScoreUpdate(scoreRef.current, coinsCountRef.current);
      }
    }

    for (let i = 0; i < HOLE_POOL; i++) {
      const h = holeDataRef.current[i];
      if (!h.active) continue;
      const hz = h.wz - wo;
      if (
        Math.abs(LANE_X[h.lane] - px) < 1.1 &&
        Math.abs(hz) < 4.5 &&
        py < 0.3
      ) {
        cbRef.current.onGameOver(scoreRef.current, coinsCountRef.current);
        return;
      }
    }

    for (let i = 0; i < BOOST_POOL; i++) {
      const b = boostDataRef.current[i];
      if (!b.active) continue;
      const bz = b.wz - wo;
      if (Math.abs(bz) < 3) {
        boostTimeRef.current = BOOST_DURATION;
        b.active = false;
      }
    }

    // Rock collision
    for (let i = 0; i < ROCK_POOL; i++) {
      const r = rockDataRef.current[i];
      if (!r.active) continue;
      if (!r.landed) continue;
      const rz = r.wz - wo;
      if (
        Math.abs(LANE_X[r.lane] - px) < 0.7 &&
        Math.abs(rz) < 1.2 &&
        r.fallY < 0.5
      ) {
        cbRef.current.onGameOver(scoreRef.current, coinsCountRef.current);
        return;
      }
    }

    cameraXRef.current +=
      (playerXRef.current * 0.4 - cameraXRef.current) * 5 * dt;
    state.camera.position.x = cameraXRef.current;
    state.camera.position.y = 4.5 + playerYRef.current * 0.25;
    state.camera.lookAt(cameraXRef.current * 0.3, 1.2, 14);
  });

  // Waterfall animation helper — animates three stacked planes by shifting y
  const animateWaterfalls = (t: number) => {
    // Each plane loops its y offset at a slightly different speed/phase
    const cycleH = 5; // height of waterfall
    if (wfPlane0Ref.current) {
      wfPlane0Ref.current.position.y = 2 - ((t * 3.5) % cycleH);
    }
    if (wfPlane1Ref.current) {
      wfPlane1Ref.current.position.y = 2 - ((t * 3.5 + cycleH / 3) % cycleH);
    }
    if (wfPlane2Ref.current) {
      wfPlane2Ref.current.position.y =
        2 - ((t * 3.5 + (cycleH * 2) / 3) % cycleH);
    }
  };

  // City skyline buildings — static, far away
  const citySkyline = () => {
    const rng = seededRng(777);
    const items: React.ReactElement[] = [];
    const count = 20;
    for (let i = 0; i < count; i++) {
      const x = -40 + (80 / count) * i + rng() * 4 - 2;
      const height = 8 + rng() * 22;
      const width = 3 + rng() * 5;
      const depth = 3 + rng() * 4;
      const gv = Math.floor(20 + rng() * 30);
      items.push(
        <mesh
          key={`sky-x${Math.round(x * 10)}`}
          position={[x, height / 2, 180]}
        >
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial
            color={`rgb(${gv},${gv + 3},${gv + 8})`}
            roughness={0.95}
            metalness={0.05}
          />
        </mesh>,
      );
    }
    return items;
  };

  // Sagging rope segments spanning the bridge gap
  const ropeSegs = (rx: number, sag = 1.4): React.ReactElement[] => {
    const segs: React.ReactElement[] = [];
    const n = 6;
    const z1 = -BRIDGE_GAP_HALF - 0.3;
    const z2 = BRIDGE_GAP_HALF + 0.3;
    const total = z2 - z1;
    const postH = 2.2;
    for (let s = 0; s < n; s++) {
      const t0 = s / n;
      const t1 = (s + 1) / n;
      const tMid = (t0 + t1) / 2;
      const z0w = z1 + t0 * total;
      const z1w = z1 + t1 * total;
      const midZ = z1 + tMid * total;
      const y0 = postH - sag * 4 * t0 * (1 - t0);
      const y1 = postH - sag * 4 * t1 * (1 - t1);
      const midY = (y0 + y1) / 2;
      const dz = z1w - z0w;
      const dy = y1 - y0;
      const len = Math.sqrt(dz * dz + dy * dy);
      const pitch = Math.atan2(dy, dz);
      segs.push(
        <mesh
          key={`r${rx}-${s}`}
          position={[rx, midY, midZ]}
          rotation={[Math.PI / 2 + pitch, 0, 0]}
        >
          <cylinderGeometry args={[0.028, 0.028, len, 4]} />
          <meshStandardMaterial color="#7A5C2A" roughness={0.85} />
        </mesh>,
      );
    }
    return segs;
  };

  return (
    <>
      {/* Morning sky */}
      <color attach="background" args={["#87CEEB"]} />
      <fog attach="fog" args={["#FFC87A", 60, 200]} />
      <hemisphereLight args={["#87CEEB", "#A0C878", 0.8]} />
      <directionalLight
        position={[6, 10, -20]}
        intensity={2.5}
        color="#FFF0A0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={200}
      />
      <pointLight
        position={[0, 2, 80]}
        color="#FF8C3A"
        intensity={3}
        distance={120}
        decay={1.5}
      />
      <pointLight
        position={[0, 6, 160]}
        color="#FFB347"
        intensity={2}
        distance={80}
        decay={2}
      />

      {/* Ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.25, 60]}
        receiveShadow
      >
        <planeGeometry args={[80, 400]} />
        <meshStandardMaterial color="#6B9E4A" roughness={1} />
      </mesh>

      {/* River */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-10, -0.22, 100]}
        receiveShadow
      >
        <planeGeometry args={[4, 400]} />
        <meshStandardMaterial
          color="#2A9ED8"
          emissive="#0A5F9A"
          emissiveIntensity={0.35}
          transparent
          opacity={0.78}
          roughness={0.15}
          metalness={0.3}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-7.9, -0.24, 100]}
        receiveShadow
      >
        <planeGeometry args={[0.4, 400]} />
        <meshStandardMaterial color="#C8B870" roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-12.1, -0.24, 100]}
        receiveShadow
      >
        <planeGeometry args={[0.4, 400]} />
        <meshStandardMaterial color="#C8B870" roughness={1} />
      </mesh>

      {/* ── Waterfalls (3 per position, repeat every WATERFALL_SPACING) ── */}
      {WATERFALL_ZS.map((wfZ, wi) => {
        return (
          <group key={`wf-z${wfZ}`} position={[-7.8, 0, wfZ]}>
            {/* Cliff face behind waterfall */}
            <mesh position={[0, 2, -0.3]}>
              <boxGeometry args={[1.2, 5, 0.4]} />
              <meshStandardMaterial color="#8B7355" roughness={0.95} />
            </mesh>
            {/* Waterfall plane 0 — only first waterfall group gets animated refs */}
            {wi === 0 ? (
              <>
                <mesh
                  ref={wfPlane0Ref}
                  position={[0, 2, 0]}
                  rotation={[0, 0, 0]}
                >
                  <planeGeometry args={[0.9, 5]} />
                  <meshStandardMaterial
                    color="#A8D8F0"
                    emissive="#5AB0E0"
                    emissiveIntensity={0.4}
                    transparent
                    opacity={0.72}
                    roughness={0.1}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                <mesh
                  ref={wfPlane1Ref}
                  position={[0.15, 2, 0.05]}
                  rotation={[0, 0.1, 0]}
                >
                  <planeGeometry args={[0.7, 5]} />
                  <meshStandardMaterial
                    color="#C8E8F8"
                    emissive="#80C8F0"
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.55}
                    roughness={0.08}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                <mesh
                  ref={wfPlane2Ref}
                  position={[-0.1, 2, 0.1]}
                  rotation={[0, -0.1, 0]}
                >
                  <planeGeometry args={[0.6, 5]} />
                  <meshStandardMaterial
                    color="#E0F4FF"
                    emissive="#A0D8FF"
                    emissiveIntensity={0.6}
                    transparent
                    opacity={0.45}
                    roughness={0.05}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </>
            ) : (
              // Non-animated copies for other waterfall positions
              <>
                <mesh position={[0, 0, 0]}>
                  <planeGeometry args={[0.9, 5]} />
                  <meshStandardMaterial
                    color="#A8D8F0"
                    emissive="#5AB0E0"
                    emissiveIntensity={0.4}
                    transparent
                    opacity={0.72}
                    roughness={0.1}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                <mesh position={[0.15, 0, 0.05]} rotation={[0, 0.1, 0]}>
                  <planeGeometry args={[0.7, 5]} />
                  <meshStandardMaterial
                    color="#C8E8F8"
                    emissive="#80C8F0"
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.55}
                    roughness={0.08}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </>
            )}
            {/* Mist/foam base disc */}
            <mesh position={[0, -2.25, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.8, 12]} />
              <meshStandardMaterial
                color="#FFFFFF"
                transparent
                opacity={0.55}
                roughness={0.3}
              />
            </mesh>
            {/* Splash particles — small discs */}
            {SPLASH_OFFSETS.map(({ ox, key }, si) => (
              <mesh
                key={`splash-${key}`}
                position={[ox, -2.1, 0.2 + si * 0.1]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <circleGeometry args={[0.18, 7]} />
                <meshStandardMaterial
                  color="#DDEEFF"
                  transparent
                  opacity={0.5}
                  roughness={0.1}
                />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* ── Background buildings (parallax) ───────────────────────────────── */}
      <group ref={buildingGroupRef}>
        {BUILDING_DEFS.map((b) => (
          <group key={b.id} position={[b.x, 0, b.z]}>
            <mesh position={[0, b.height / 2, 0]} castShadow>
              <boxGeometry args={[b.width, b.height, b.depth]} />
              <meshStandardMaterial
                color={b.color}
                roughness={0.9}
                metalness={0.1}
              />
            </mesh>
            {/* Windows */}
            {b.windows.map((w) => (
              <mesh key={w.id} position={[w.wx, w.wy, w.wz]}>
                <planeGeometry args={[0.35, 0.4]} />
                <meshStandardMaterial
                  color="#FFDD88"
                  emissive="#FFAA00"
                  emissiveIntensity={1.2}
                  roughness={0.05}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* ── City skyline (static, distant horizon) ───────────────────────── */}
      {citySkyline()}

      {/* Tile pool — all stone path tiles */}
      {TILE_KEYS.map((key, i) => (
        <group
          key={key}
          ref={(el) => {
            tileGroupRefs.current[i] = el;
          }}
          position={[0, 0, i * TILE_LENGTH]}
        >
          <mesh receiveShadow>
            <boxGeometry args={[TILE_WIDTH, 0.3, TILE_LENGTH - 0.15]} />
            <meshStandardMaterial
              color="#C8B89A"
              roughness={0.9}
              metalness={0.02}
            />
          </mesh>
          <mesh position={[-TILE_WIDTH / 6, 0.16, 0]}>
            <boxGeometry args={[0.06, 0.05, TILE_LENGTH - 0.15]} />
            <meshStandardMaterial color="#A89070" roughness={0.7} />
          </mesh>
          <mesh position={[TILE_WIDTH / 6, 0.16, 0]}>
            <boxGeometry args={[0.06, 0.05, TILE_LENGTH - 0.15]} />
            <meshStandardMaterial color="#A89070" roughness={0.7} />
          </mesh>
          <mesh position={[-2.6, 0.4, 0]}>
            <boxGeometry args={[0.3, 0.5, TILE_LENGTH - 0.15]} />
            <meshStandardMaterial color="#B8A880" roughness={1} />
          </mesh>
          <mesh position={[2.6, 0.4, 0]}>
            <boxGeometry args={[0.3, 0.5, TILE_LENGTH - 0.15]} />
            <meshStandardMaterial color="#B8A880" roughness={1} />
          </mesh>
          <mesh position={[-2.6, 2.0, -(TILE_LENGTH / 2 - 0.5)]} castShadow>
            <boxGeometry args={[0.5, 4, 0.5]} />
            <meshStandardMaterial color="#B8A880" roughness={0.9} />
          </mesh>
          <mesh position={[2.6, 2.0, -(TILE_LENGTH / 2 - 0.5)]} castShadow>
            <boxGeometry args={[0.5, 4, 0.5]} />
            <meshStandardMaterial color="#B8A880" roughness={0.9} />
          </mesh>
          <mesh position={[-2.6, 4.1, -(TILE_LENGTH / 2 - 0.5)]}>
            <boxGeometry args={[0.7, 0.25, 0.7]} />
            <meshStandardMaterial color="#C8B890" roughness={0.8} />
          </mesh>
          <mesh position={[2.6, 4.1, -(TILE_LENGTH / 2 - 0.5)]}>
            <boxGeometry args={[0.7, 0.25, 0.7]} />
            <meshStandardMaterial color="#C8B890" roughness={0.8} />
          </mesh>
          {TILE_TREES[i].map((t) => (
            <TileTree key={t.treeKey} t={t} />
          ))}
        </group>
      ))}

      {/* Coins */}
      <instancedMesh
        ref={coinInstanceRef}
        args={[undefined, undefined, COIN_POOL]}
      >
        <torusGeometry args={[0.22, 0.08, 8, 16]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#CC8800"
          emissiveIntensity={0.6}
          metalness={0.95}
          roughness={0.05}
        />
      </instancedMesh>

      {/* Holes */}
      <instancedMesh
        ref={holeInstanceRef}
        args={[undefined, undefined, HOLE_POOL]}
      >
        <boxGeometry args={[1, 0.06, 1]} />
        <meshStandardMaterial
          color="#111111"
          roughness={1}
          metalness={0}
          emissive="#000000"
        />
      </instancedMesh>

      {/* Boost Zones */}
      <instancedMesh
        ref={boostInstanceRef}
        args={[undefined, undefined, BOOST_POOL]}
      >
        <boxGeometry args={[1, 0.04, 1]} />
        <meshStandardMaterial
          color="#FF8C00"
          emissive="#FF4400"
          emissiveIntensity={0.8}
          roughness={0.3}
          metalness={0.1}
          transparent
          opacity={0.9}
        />
      </instancedMesh>

      {/* Rocks — falling obstacles */}
      <instancedMesh
        ref={rockInstanceRef}
        args={[undefined, undefined, ROCK_POOL]}
      >
        <icosahedronGeometry args={[0.35, 0]} />
        <meshStandardMaterial
          color="#8B7355"
          roughness={0.92}
          metalness={0.08}
        />
      </instancedMesh>

      {/* ── Broken Bridge pool ──────────────────────────────────────────────── */}
      {BRIDGE_KEYS.map((bridgeKey, i) => (
        <group
          key={bridgeKey}
          ref={(el) => {
            bridgeGroupRefs.current[i] = el;
          }}
          position={[0, 0, -1000]}
        >
          {/* Left intact platform */}
          <mesh
            position={[0, 0, -(BRIDGE_GAP_HALF + BRIDGE_PLAT_LEN / 2)]}
            receiveShadow
          >
            <boxGeometry args={[TILE_WIDTH, 0.3, BRIDGE_PLAT_LEN]} />
            <meshStandardMaterial
              color="#C8B89A"
              roughness={0.9}
              metalness={0.02}
            />
          </mesh>
          {/* Right intact platform */}
          <mesh
            position={[0, 0, BRIDGE_GAP_HALF + BRIDGE_PLAT_LEN / 2]}
            receiveShadow
          >
            <boxGeometry args={[TILE_WIDTH, 0.3, BRIDGE_PLAT_LEN]} />
            <meshStandardMaterial
              color="#C8B89A"
              roughness={0.9}
              metalness={0.02}
            />
          </mesh>

          {/* Broken planks — left edge, tilted and crumbling */}
          <mesh
            position={[0.9, 0.05, -(BRIDGE_GAP_HALF - 1.2)]}
            rotation={[0.45, 0.12, 0.28]}
            castShadow
          >
            <boxGeometry args={[1.6, 0.16, 2.8]} />
            <meshStandardMaterial color="#8B6020" roughness={0.95} />
          </mesh>
          <mesh
            position={[-1.1, -0.18, -(BRIDGE_GAP_HALF - 0.6)]}
            rotation={[-0.35, -0.15, -0.22]}
            castShadow
          >
            <boxGeometry args={[1.3, 0.14, 2.4]} />
            <meshStandardMaterial color="#7A5010" roughness={0.95} />
          </mesh>
          <mesh
            position={[0.2, -0.3, -(BRIDGE_GAP_HALF - 0.2)]}
            rotation={[0.6, 0.3, 0.1]}
            castShadow
          >
            <boxGeometry args={[0.8, 0.12, 1.8]} />
            <meshStandardMaterial color="#6A4508" roughness={0.98} />
          </mesh>

          {/* Broken planks — right edge */}
          <mesh
            position={[-0.9, 0.05, BRIDGE_GAP_HALF - 1.2]}
            rotation={[-0.45, -0.12, -0.28]}
            castShadow
          >
            <boxGeometry args={[1.6, 0.16, 2.8]} />
            <meshStandardMaterial color="#8B6020" roughness={0.95} />
          </mesh>
          <mesh
            position={[1.1, -0.18, BRIDGE_GAP_HALF - 0.6]}
            rotation={[0.35, 0.15, 0.22]}
            castShadow
          >
            <boxGeometry args={[1.3, 0.14, 2.4]} />
            <meshStandardMaterial color="#7A5010" roughness={0.95} />
          </mesh>
          <mesh
            position={[-0.2, -0.3, BRIDGE_GAP_HALF - 0.2]}
            rotation={[-0.6, -0.3, -0.1]}
            castShadow
          >
            <boxGeometry args={[0.8, 0.12, 1.8]} />
            <meshStandardMaterial color="#6A4508" roughness={0.98} />
          </mesh>

          {/* Rope posts — 4 posts, 2 per side */}
          <mesh position={[-2.3, 1.1, -(BRIDGE_GAP_HALF + 0.6)]} castShadow>
            <cylinderGeometry args={[0.1, 0.11, 2.6, 7]} />
            <meshStandardMaterial color="#5C3A1A" roughness={0.9} />
          </mesh>
          <mesh position={[2.3, 1.1, -(BRIDGE_GAP_HALF + 0.6)]} castShadow>
            <cylinderGeometry args={[0.1, 0.11, 2.6, 7]} />
            <meshStandardMaterial color="#5C3A1A" roughness={0.9} />
          </mesh>
          <mesh position={[-2.3, 1.1, BRIDGE_GAP_HALF + 0.6]} castShadow>
            <cylinderGeometry args={[0.1, 0.11, 2.6, 7]} />
            <meshStandardMaterial color="#5C3A1A" roughness={0.9} />
          </mesh>
          <mesh position={[2.3, 1.1, BRIDGE_GAP_HALF + 0.6]} castShadow>
            <cylinderGeometry args={[0.1, 0.11, 2.6, 7]} />
            <meshStandardMaterial color="#5C3A1A" roughness={0.9} />
          </mesh>

          {/* Post caps */}
          {([-2.3, 2.3] as number[]).flatMap((px2) =>
            ([-(BRIDGE_GAP_HALF + 0.6), BRIDGE_GAP_HALF + 0.6] as number[]).map(
              (pz2) => (
                <mesh key={`cap-${px2}-${pz2}`} position={[px2, 2.45, pz2]}>
                  <boxGeometry args={[0.22, 0.12, 0.22]} />
                  <meshStandardMaterial color="#4A2C12" roughness={0.85} />
                </mesh>
              ),
            ),
          )}

          {/* Sagging ropes — left, center, right */}
          {ropeSegs(-2.3, 1.2)}
          {ropeSegs(0, 1.8)}
          {ropeSegs(2.3, 1.2)}

          {/* Under-bridge waterfall — cascading water below gap */}
          <mesh position={[0, -1.8, 0]} rotation={[0, 0, 0]}>
            <planeGeometry args={[TILE_WIDTH - 0.4, 5]} />
            <meshStandardMaterial
              color="#A8D8F0"
              emissive="#4AAEE0"
              emissiveIntensity={0.5}
              transparent
              opacity={0.7}
              roughness={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0.3, -2.2, 0.12]} rotation={[0, 0.08, 0]}>
            <planeGeometry args={[TILE_WIDTH - 1.2, 4]} />
            <meshStandardMaterial
              color="#C8E8F8"
              emissive="#80C8F0"
              emissiveIntensity={0.55}
              transparent
              opacity={0.5}
              roughness={0.05}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Mist/foam at bottom of chasm */}
          <mesh position={[0, -4.4, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[TILE_WIDTH - 0.5, 3]} />
            <meshStandardMaterial
              color="#FFFFFF"
              transparent
              opacity={0.4}
              roughness={0.3}
            />
          </mesh>

          {/* Rocks falling/resting in the chasm */}
          <mesh
            position={[-1.2, -2.8, 0.8]}
            rotation={[0.4, 0.6, 0.3]}
            castShadow
          >
            <icosahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial
              color="#8B7355"
              roughness={0.92}
              metalness={0.08}
            />
          </mesh>
          <mesh
            position={[1.4, -3.5, -0.6]}
            rotation={[0.8, 0.2, 1.1]}
            castShadow
          >
            <icosahedronGeometry args={[0.26, 0]} />
            <meshStandardMaterial
              color="#7A6345"
              roughness={0.9}
              metalness={0.1}
            />
          </mesh>
          <mesh
            position={[0.3, -4.0, 0.4]}
            rotation={[1.2, 0.9, 0.5]}
            castShadow
          >
            <icosahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial
              color="#6B5535"
              roughness={0.95}
              metalness={0.05}
            />
          </mesh>
          <mesh
            position={[-0.8, -3.1, -0.9]}
            rotation={[0.2, 1.4, 0.7]}
            castShadow
          >
            <icosahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial
              color="#9B8365"
              roughness={0.92}
              metalness={0.06}
            />
          </mesh>
          {/* Small rock splashes in water */}
          <mesh position={[0.6, -4.2, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.25, 8]} />
            <meshStandardMaterial
              color="#DDEEFF"
              transparent
              opacity={0.55}
              roughness={0.1}
            />
          </mesh>
          <mesh position={[-0.5, -4.3, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.18, 8]} />
            <meshStandardMaterial
              color="#DDEEFF"
              transparent
              opacity={0.5}
              roughness={0.1}
            />
          </mesh>
        </group>
      ))}

      {/* ── Hunter Player — 25 year old ───────────────────────────────────── */}
      <group ref={playerGroupRef} position={[LANE_X[1], 0, 0]}>
        <group ref={playerMeshRef}>
          {/* Legs — dark brown pants */}
          <mesh ref={legLeftRef} position={[-0.15, 0.33, 0]} castShadow>
            <boxGeometry args={[0.19, 0.62, 0.17]} />
            <meshStandardMaterial color="#3D2810" roughness={0.85} />
          </mesh>
          <mesh ref={legRightRef} position={[0.15, 0.33, 0]} castShadow>
            <boxGeometry args={[0.19, 0.62, 0.17]} />
            <meshStandardMaterial color="#3D2810" roughness={0.85} />
          </mesh>
          {/* Boot soles */}
          <mesh position={[-0.15, 0.055, 0.02]} castShadow>
            <boxGeometry args={[0.2, 0.1, 0.22]} />
            <meshStandardMaterial color="#1A0E05" roughness={0.95} />
          </mesh>
          <mesh position={[0.15, 0.055, 0.02]} castShadow>
            <boxGeometry args={[0.2, 0.1, 0.22]} />
            <meshStandardMaterial color="#1A0E05" roughness={0.95} />
          </mesh>

          {/* Torso group — upright */}
          <group
            ref={torsoGroupRef}
            rotation={[0, 0, 0]}
            position={[0, 0.65, 0]}
          >
            {/* Forest green jacket */}
            <mesh position={[0, 0.36, 0]} castShadow>
              <boxGeometry args={[0.62, 0.78, 0.4]} />
              <meshStandardMaterial
                color="#3A5A2A"
                roughness={0.85}
                metalness={0.05}
              />
            </mesh>
            {/* Jacket collar */}
            <mesh position={[0, 0.71, 0.2]} castShadow>
              <boxGeometry args={[0.26, 0.22, 0.06]} />
              <meshStandardMaterial color="#2A4A1A" roughness={0.9} />
            </mesh>

            {/* Left arm */}
            <mesh
              ref={armLeftRef}
              position={[-0.41, 0.3, 0]}
              rotation={[0.2, 0, 0.25]}
              castShadow
            >
              <boxGeometry args={[0.16, 0.54, 0.16]} />
              <meshStandardMaterial color="#3A5A2A" roughness={0.85} />
            </mesh>

            {/* Right arm — plain (no walking stick) */}
            <mesh
              ref={armRightRef}
              position={[0.41, 0.3, 0]}
              rotation={[-0.2, 0, -0.25]}
              castShadow
            >
              <boxGeometry args={[0.16, 0.54, 0.16]} />
              <meshStandardMaterial color="#3A5A2A" roughness={0.85} />
            </mesh>

            {/* Bow on back — curved arc */}
            <group position={[0, 0.35, -0.28]} rotation={[0.1, 0, 0]}>
              <mesh position={[0, 0.32, 0]} rotation={[0.45, 0, 0]} castShadow>
                <cylinderGeometry args={[0.022, 0.018, 0.52, 6]} />
                <meshStandardMaterial color="#6B3A1F" roughness={0.75} />
              </mesh>
              <mesh
                position={[0, -0.28, 0]}
                rotation={[-0.45, 0, 0]}
                castShadow
              >
                <cylinderGeometry args={[0.022, 0.018, 0.52, 6]} />
                <meshStandardMaterial color="#6B3A1F" roughness={0.75} />
              </mesh>
              <mesh position={[0, 0.02, 0]} castShadow>
                <cylinderGeometry args={[0.03, 0.03, 0.22, 6]} />
                <meshStandardMaterial color="#4A2810" roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.02, 0.055]}>
                <cylinderGeometry args={[0.006, 0.006, 0.72, 4]} />
                <meshStandardMaterial color="#D4C08A" roughness={0.5} />
              </mesh>
            </group>

            {/* Quiver on back */}
            <group position={[0.22, 0.3, -0.26]} rotation={[0.15, 0, 0.1]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.065, 0.055, 0.45, 7]} />
                <meshStandardMaterial color="#8B4A1A" roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.24, 0]}>
                <cylinderGeometry args={[0.07, 0.065, 0.06, 7]} />
                <meshStandardMaterial color="#5C2E0A" roughness={0.85} />
              </mesh>
              <mesh position={[0.01, 0.34, 0]}>
                <cylinderGeometry args={[0.008, 0.008, 0.22, 4]} />
                <meshStandardMaterial color="#A87040" roughness={0.6} />
              </mesh>
              <mesh position={[-0.02, 0.33, 0.01]}>
                <cylinderGeometry args={[0.008, 0.008, 0.2, 4]} />
                <meshStandardMaterial color="#A87040" roughness={0.6} />
              </mesh>
            </group>

            {/* Neck */}
            <mesh position={[0, 0.77, 0]}>
              <cylinderGeometry args={[0.1, 0.115, 0.16, 7]} />
              <meshStandardMaterial color="#C8845A" roughness={0.45} />
            </mesh>

            {/* Head — warm tan */}
            <mesh position={[0, 1.02, 0]} castShadow>
              <sphereGeometry args={[0.27, 10, 10]} />
              <meshStandardMaterial color="#C8845A" roughness={0.35} />
            </mesh>

            {/* Eyes */}
            <mesh position={[0.09, 1.04, 0.24]}>
              <sphereGeometry args={[0.038, 6, 6]} />
              <meshStandardMaterial color="#1A0A00" />
            </mesh>
            <mesh position={[-0.09, 1.04, 0.24]}>
              <sphereGeometry args={[0.038, 6, 6]} />
              <meshStandardMaterial color="#1A0A00" />
            </mesh>

            {/* Short dark brown hair cap */}
            <mesh position={[0, 1.23, -0.02]}>
              <boxGeometry args={[0.46, 0.14, 0.46]} />
              <meshStandardMaterial color="#2A1A0A" roughness={0.9} />
            </mesh>
            <mesh position={[-0.23, 1.14, -0.02]}>
              <boxGeometry args={[0.08, 0.18, 0.42]} />
              <meshStandardMaterial color="#2A1A0A" roughness={0.9} />
            </mesh>
            <mesh position={[0.23, 1.14, -0.02]}>
              <boxGeometry args={[0.08, 0.18, 0.42]} />
              <meshStandardMaterial color="#2A1A0A" roughness={0.9} />
            </mesh>

            {/* Hunter wide-brim hat crown */}
            <mesh position={[0, 1.37, -0.01]} castShadow>
              <cylinderGeometry args={[0.23, 0.25, 0.26, 10]} />
              <meshStandardMaterial color="#5C3A1A" roughness={0.85} />
            </mesh>
            {/* Hat brim */}
            <mesh position={[0, 1.26, -0.01]} castShadow>
              <cylinderGeometry args={[0.52, 0.52, 0.055, 12]} />
              <meshStandardMaterial color="#4A2C12" roughness={0.88} />
            </mesh>
            {/* Hat band */}
            <mesh position={[0, 1.26, -0.01]}>
              <cylinderGeometry args={[0.255, 0.255, 0.07, 10]} />
              <meshStandardMaterial color="#8B5A2A" roughness={0.7} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Hidden walkingStickRef — kept for ref compatibility */}
      <group ref={walkingStickRef} position={[0, -1000, 0]} />
    </>
  );
}
