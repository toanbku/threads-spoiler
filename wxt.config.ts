import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Threads Spoiler Revealer',
    description: 'Automatically reveals all spoiler content on Threads (threads.net)',
    version: '1.0.0',
    permissions: ['storage'],
    host_permissions: ['*://www.threads.net/*', '*://www.threads.com/*'],
  },
});
