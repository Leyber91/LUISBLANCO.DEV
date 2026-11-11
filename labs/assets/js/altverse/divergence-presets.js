/* ============================================================
   altverse/divergence-presets.js — the shelf of examples.
   Each is ordinary text that goes through the same classifier a
   typed divergence does; nothing here is special-cased.

   Physics corrections against the earlier presets (2026-11-11):
   - ice: the old text blamed the 4 C density maximum. Our seawater
     already has none (above 24.7 g/kg salinity it is densest at its
     freezing point); what makes ice float is ice being lighter than
     water. The divergence is now ice denser than water, and the old
     claim that sunken ice raises sea level is reversed: ice denser
     than water takes less room, so sea level falls.
   - light: a slower c with chemistry untouched is not a physical
     change; only dimensionless constants are (Duff, Okun and
     Veneziano 2002). With e and h fixed, c / 10 means alpha x 10,
     which unbinds every nucleus heavier than helium. The old preset
     modelled only travel and chips.
   - gravity: stated as 1.3 Earth masses at our radius so escape
     velocity, pressure and mountain height follow; orbit is costlier
     (mass ratio 11.4 against 8.5), not out of reach as claimed before.
   ============================================================ */

export const PRESETS = [
  { id: 'ice-sinks', short: 'ice sinks', group: 'physics', text: 'Ice is denser than liquid water, so it sinks.',
    hint: 'Seas that freeze in winter keep their ice; sea level falls and the inhabited world becomes a belt.' },
  { id: 'slow-light', short: 'light / 10', group: 'physics', text: 'Light travels ten times slower, with charge and Planck\'s constant unchanged.',
    hint: 'Alpha rises to 1/13.7 and nuclei heavier than helium come apart.' },
  { id: 'heavy-earth', short: 'g x 1.3', group: 'physics', text: 'Earth has 1.3 times its mass at the same radius, so g is 12.75 m/s2.',
    hint: 'Lower mountains, denser air, shorter trees, a costlier orbit.' },
  { id: 'no-moon', short: 'no Moon', group: 'planet', text: 'The Earth has no Moon.', hint: 'Weak tides, a wandering axis, no month.' },
  { id: 'tilt-60', short: 'tilt 60 deg', group: 'planet', text: 'Earth\'s axis is tilted 60 degrees.', hint: 'The poles out-sun the equator.' },
  { id: 'bright-sun', short: 'Sun +10%', group: 'star', text: 'The Sun is 10% brighter.', hint: 'Past the runaway greenhouse.' },
  { id: 'low-oxygen', short: 'O2 12%', group: 'air', text: 'Oxygen makes up 12% of the air.', hint: 'Nothing burns.' },
  { id: 'impact-miss', short: 'asteroid misses', group: 'deep time', text: 'The asteroid that ended the dinosaurs misses.', hint: 'A seeded coin decides on toolmakers.' },
  { id: 'dry-med', short: 'dry Mediterranean', group: 'deep time', text: 'The Mediterranean never refills.', hint: 'A salt basin between two continents.' },
  { id: 'early-press', short: 'press in 600 CE', group: 'history', text: 'The printing press arrives in 600 CE.', hint: 'The ladder of inventions shifts.' },
];

export const PRESETS_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export const DEFAULT_PRESET = 'ice-sinks';
export const DEFAULT_SEED = 41;
