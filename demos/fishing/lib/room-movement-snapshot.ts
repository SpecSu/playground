import type { RoomSnapshot } from './room-types';
import type { RoomDatabase } from './room-server-d1';
import type { ParticipantMovement } from './room-movement';
import type { StoredMovement } from './room-movement-server';

export type MovementRoomSnapshot = RoomSnapshot & {
  self: RoomSnapshot['self'] & { lastMoveSequence: number };
  movements: ParticipantMovement[];
};
/** One indexed query for the active ten actors plus the viewer; never scan history. */
export async function withMovementSnapshot(snapshot: RoomSnapshot, db: RoomDatabase): Promise<MovementRoomSnapshot> {
  const participants = snapshot.participants.slice(0, 10);
  const membership = new Map(participants.map(person => [person.id, person.joinedAt]));
  const ids = [...new Set([snapshot.self.id, ...membership.keys()])];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT actor_id, move_sequence, move_json FROM nightclub_visits WHERE room_id = ? AND actor_id IN (${placeholders})`)
    .bind(snapshot.roomId, ...ids).all<{ actor_id: string; move_sequence: number; move_json: string | null }>();
  const movements = rows.results.flatMap(row => {
    if (!row.move_json || !membership.has(row.actor_id)) return [];
    const stored = JSON.parse(row.move_json) as StoredMovement;
    // Keep previous group epochs so presentation can retain manual mode after a
    // group. Never use their old positions in the new epoch. Rejoined occupants
    // do not inherit an earlier visit's manual mode or placement.
    return stored.sample.joinedAt === membership.get(row.actor_id) ? [{ ...stored.sample, actorId: row.actor_id, moveSequence: row.move_sequence }] : [];
  });
  return { ...snapshot, self: { ...snapshot.self, lastMoveSequence: rows.results.find(row => row.actor_id === snapshot.self.id)?.move_sequence ?? 0 }, movements };
}
