# Temple Rush

## Current State
Endless runner game with a hunter character, stone path tiles, river on the left, trees, coins, holes, and boost zones. Morning sky background with fog.

## Requested Changes (Diff)

### Add
- Waterfall: a cascading water effect positioned between the path and the river (left side of path, around x=-7 to x=-8), with animated blue-white cascading water mesh and mist/foam at the base
- Rockfall: falling rocks that descend from above as an obstacle — rocks spawn at height, fall down, and the player must jump/dodge them; they appear on specific lanes
- Buildings: tall building silhouettes visible in the distant background (far z), adding urban backdrop depth
- City: city skyline elements (multiple building shapes at varying heights) rendered far in the background, giving the environment a cityscape feel

### Modify
- GameScene.tsx: add waterfall geometry near river, add rockfall obstacle system (spawn, animate, collision), add background city/building meshes

### Remove
- Nothing

## Implementation Plan
1. Add a static waterfall group positioned between path and river (x ~ -7.5, animated with shifting UV or emissive pulse on water planes)
2. Add ROCK_POOL of falling rock instances — spawn at wz ahead of player at random lanes, start high y, fall down each frame, player collides if close enough at ground level
3. Add nextRockFallWZRef and spawnRockFall function
4. Add city/building background: array of box meshes at far x positions (both sides) and high z offsets, scrolling slowly for parallax, various heights and widths with dark silhouette material
