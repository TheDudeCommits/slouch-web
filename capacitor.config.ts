import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'work.dude.slouch', appName: 'Slouch', webDir: 'dist',
  ios: { contentInset: 'never', backgroundColor: '#f7f5ed', allowsLinkPreview: false },
};
export default config;
