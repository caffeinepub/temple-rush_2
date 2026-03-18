# Temple Rush

## Current State
Endless runner with stone path tiles, holes, boost zones, rockfall obstacles, waterfall visuals, buildings, city skyline, and a 25-year-old hunter character.

## Requested Changes (Diff)

### Add
- Broken bridge obstacle zone: two intact stone platform ends with a wide gap in the center
- Tilted/crumbling wooden plank visuals at both edges of the gap
- Rope posts (4 tall posts flanking the gap) with sagging rope lines connecting them across the gap
- Below the gap: cascading waterfall planes animated downward
- Below the gap: rocks scattered / falling in the chasm
- Full-width gap collision (player must jump to cross; falling in triggers game over)

### Modify
- GameScene.tsx: add BRIDGE_POOL, BridgeData interface, bridgeGroupRefs, spawn/update/collision logic, and bridge JSX

### Remove
- Nothing removed

## Implementation Plan
1. Add BRIDGE_POOL=4 constant and BridgeData interface
2. Add bridgeDataRef, bridgeGroupRefs array refs, nextBridgeWZRef
3. Add spawnBridge() helper
4. In useFrame: spawn bridges at intervals, update group z positions, collision detection (full-width, py < 0.25)
5. Reset bridge state on gameState change to running
6. Add bridge JSX pool: left/right platform, broken tilted planks, rope posts, sagging rope segments (5 segments per rope, 3 ropes), waterfall planes below gap, fallen rocks in chasm
