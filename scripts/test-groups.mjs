// Each automated check has one reporting owner. Files may retain distinct
// unit, routing and real-renderer cases within that area.
export const TEST_GROUPS = {
  health: { label: 'Health and mechanics', files: ['damage-flow', 'self-destruct', 'support-action-deaths', 'combat-correctness'] },
  decisions: { label: 'Dice and enemy decisions', files: ['dice', 'boss-intent'] },
  actions: { label: 'Actions and turns', files: ['combat-lifecycle', 'settled-combat-actions', 'settled-secondary-effects'] },
  timing: { label: 'Timing and presentation', files: ['combat-control-status', 'presentation-completion', 'sleep-pause'] },
  saves: { label: 'Saves and progression', files: ['combat-recovery', 'save-migration', 'save-storage', 'save-transactions', 'guided-learning', 'guided-curriculum', 'run-mode-regressions', 'run-mode-persistence', 'streak'] },
  platform: { label: 'Browser and mobile behaviour', files: ['gesture', 'native-back', 'null-deref-guards', 'service-worker-lifecycle', 'edition-storage', 'ux-learning', 'cipher-practice'] },
  services: { label: 'Supporting services', files: ['analytics', 'sector-music', 'matchup-hints'] }
};

export function groupFor(filename) {
  const name = filename.replaceAll('\\', '/').split('/').pop().replace(/\.test\.js$/, '');
  return Object.entries(TEST_GROUPS).find(([, group]) => group.files.includes(name))?.[0];
}
