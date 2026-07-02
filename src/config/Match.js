export const MATCH = {
  fragTarget: 25,
  matchSeconds: 300,
  respawnDelay: 2.5,
  botCount: 5,
  botDifficulty: {
    easy:   { reactionTime: 0.6, accuracy: 0.45, turnSpeed: 4.0, aggression: 0.4, detectRange: 40, preferredRange: 18, retreatHp: 25, loseTargetTime: 3 },
    normal: { reactionTime: 0.35, accuracy: 0.65, turnSpeed: 6.0, aggression: 0.6, detectRange: 50, preferredRange: 16, retreatHp: 20, loseTargetTime: 4 },
    hard:   { reactionTime: 0.2, accuracy: 0.82, turnSpeed: 8.5, aggression: 0.8, detectRange: 60, preferredRange: 14, retreatHp: 15, loseTargetTime: 5 },
  },
};
