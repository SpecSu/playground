# Implementation plan

1. RED regression tests for camera drag/pinch/wheel during idle and before ten seconds; intent cancellation; menus/editors allowing idle without tray writes; successful game commands preempting; flat sea and package exclusion.
2. Remove raw shell activity hooks; classify successful game commands and entering active modes. Preserve hidden/focus and conflict safety. Permit idle behind ordinary panels and avoid delayed approach rebuilding an editor.
3. Add bounded scene pointer-intent classification before semantic contact. Keep current controls, route ownership, hit geometry and cancellation.
4. Replace sea drawing with solid fill and remove selected illustration from runtime/build whitelist. Update obsolete assertions only where the requested behavior changed.
5. Full tests, syntax, build and diff check; immutable commit to independent reviewer and parent. Parent alone publishes.
