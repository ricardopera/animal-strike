// Pure function: target = {pos:[x,y,z]}, opts = {accuracy, reactionProgress, errorRadius, rand}
// accuracy: 0..1 (1 = perfect). reactionProgress: 0..1 (how locked-on the bot is).
export function computeAimPoint(target, opts) {
  const { accuracy = 0.8, reactionProgress = 1, errorRadius = 2, rand = Math.random } = opts;
  const [x, y, z] = target.pos;
  // effective error: accuracy caps the peak error (1 -> always perfect, 0 -> always full),
  // and reactionProgress shrinks it as the bot tunes in (0 -> peak, 1 -> reduced).
  const eff = errorRadius * (1 - accuracy) * (1 - accuracy * reactionProgress);
  return [
    x + (rand() - 0.5) * 2 * eff,
    y + (rand() - 0.5) * 2 * eff,
    z + (rand() - 0.5) * 2 * eff,
  ];
}
