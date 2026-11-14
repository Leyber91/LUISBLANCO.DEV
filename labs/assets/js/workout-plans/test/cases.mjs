/* fixed input sets for the tests and the narration recordings */
const D = (s) => [...s].map(Number);
export const CASES = [
  { name: 'default example', inputs: { goal: 'hypertrophy', level: 'intermediate', days: D('1101100'), minutes: 60, equipment: 'gym', injuries: ['knee'], weeks: 8, mode: 'busso' }, log: { 14: { kind: 'hard', rpe: 9 }, 15: { kind: 'hard', rpe: 9 }, 38: { kind: 'missed' } } },
  { name: 'beginner strength, 3 days', inputs: { goal: 'strength', level: 'beginner', days: D('1010100'), minutes: 45, equipment: 'gym', injuries: [], weeks: 8, mode: 'busso' }, log: {} },
  { name: 'advanced strength, low back', inputs: { goal: 'strength', level: 'advanced', days: D('1101110'), minutes: 75, equipment: 'gym', injuries: ['back'], weeks: 12, mode: 'banister' }, log: { 7: { kind: 'missed' }, 8: { kind: 'missed' } } },
  { name: 'home dumbbells, shoulder', inputs: { goal: 'hypertrophy', level: 'beginner', days: D('0101010'), minutes: 45, equipment: 'dumbbells', injuries: ['shoulder'], weeks: 6, mode: 'busso' }, log: { 3: { kind: 'easy', rpe: 4 } } },
  { name: 'bodyweight, wrist', inputs: { goal: 'general', level: 'beginner', days: D('1000100'), minutes: 30, equipment: 'bodyweight', injuries: ['wrist'], weeks: 6, mode: 'busso' }, log: {} },
  { name: 'endurance, knee', inputs: { goal: 'endurance', level: 'intermediate', days: D('1111011'), minutes: 60, equipment: 'bodyweight', injuries: ['knee'], weeks: 12, mode: 'busso' }, log: { 9: { kind: 'hard', rpe: 9 } } },
  { name: 'endurance beginner, 3 days', inputs: { goal: 'endurance', level: 'beginner', days: D('0101001'), minutes: 45, equipment: 'gym', injuries: [], weeks: 8, mode: 'banister' }, log: {} },
  { name: 'health, 5 days', inputs: { goal: 'general', level: 'intermediate', days: D('1111100'), minutes: 60, equipment: 'gym', injuries: ['back'], weeks: 8, mode: 'busso' }, log: { 2: { kind: 'done' } } },
  { name: 'every flag, dumbbells', inputs: { goal: 'hypertrophy', level: 'advanced', days: D('1111110'), minutes: 90, equipment: 'dumbbells', injuries: ['knee', 'back', 'shoulder', 'wrist'], weeks: 8, mode: 'busso' }, log: {} },
  { name: 'weekend only', inputs: { goal: 'strength', level: 'intermediate', days: D('0000011'), minutes: 90, equipment: 'gym', injuries: [], weeks: 6, mode: 'busso' }, log: { 5: { kind: 'hard', rpe: 9.5 }, 6: { kind: 'hard', rpe: 9.5 } } },
];
