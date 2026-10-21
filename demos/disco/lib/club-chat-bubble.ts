export interface ChatBubbleCandidate { id: string; x: number; y: number; width: number; height: number; depth: number }
/** Keep short-text panels in the scene and stack close heads without hiding text
 * behind another bubble. If the view cannot fit everyone, nearest panels win.
 */
export function chatBubbleLayout(candidates: ChatBubbleCandidate[], width: number, height: number): ChatBubbleCandidate[] {
  const placed: ChatBubbleCandidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))) {
    if (!Number.isFinite(candidate.x + candidate.y + candidate.width + candidate.height + candidate.depth) || width < 80 || height < 200) continue;
    const panelWidth = Math.min(candidate.width, width - 24);
    const x = Math.max(12 + panelWidth / 2, Math.min(width - 12 - panelWidth / 2, candidate.x));
    let y = Math.min(height - 14, Math.max(144 + candidate.height, candidate.y));
    const overlapping = () => placed.find(other => Math.abs(x-other.x) < (panelWidth+other.width)/2+6 && y > other.y-other.height-6 && y-candidate.height < other.y+6);
    for (let tries = 0; tries < placed.length + 1; tries++) {
      const obstacle = overlapping();
      if (!obstacle) break;
      y = obstacle.y - obstacle.height - 6;
    }
    if (y - candidate.height < 144) continue;
    placed.push({ ...candidate, width: panelWidth, x, y });
  }
  return placed;
}
