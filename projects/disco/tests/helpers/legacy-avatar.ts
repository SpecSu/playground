/**
 * Immutable fixtures from the retired cast under public/avatars/*.glb.
 * These preserve historical numerical baselines; current cast coverage lives in
 * uploaded-cast-* tests and loads public/avatars/cast-v1/*.glb instead.
 */
export const LEGACY_AVATAR_KINDS = Object.freeze([
  'cat', 'frog', 'dog', 'capybara', 'panda', 'banana-cat', 'sword-shield-dog',
  'human-jiji', 'human-subeike', 'human-lx', 'monster-blob', 'monster-tower', 'monster-star',
] as const);
