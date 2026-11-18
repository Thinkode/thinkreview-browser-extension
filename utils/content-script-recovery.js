// Registration is shared by every review platform. Keep failures recoverable even
// when the service worker is suspended, and activate pages open before install.
export function createContentScriptRecovery(api, reconcile, warn = () => {}) {
  const alarmName = 'thinkreview-content-script-retry';
  let running = null;
  let requested = false;

  async function activateOpenTabs(configs) {
    const matches = [...new Set(configs.flatMap(config => config.matches))];
    if (!matches.length) return;
    const tabs = await api.tabs.query({ url: matches });
    const version = api.runtime.getManifest().version;
    // Deduplicate overlapping domain registrations and serialize each tab's files.
    const files = [...new Set(configs.flatMap(config => config.js))];
    await Promise.all(tabs.map(async tab => {
      if (tab.id == null || tab.discarded || tab.status === 'loading') return;
      try {
        const results = await api.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            content: globalThis.__thinkReviewContentVersion,
            panel: globalThis.__thinkReviewPanelVersion,
          }),
        });
        const state = results?.[0]?.result;
        if (state?.content === version && state?.panel === version) return;
        await api.scripting.executeScript({ target: { tabId: tab.id }, files });
      } catch (error) {
        // Tabs may close, navigate, or lose permission between query and injection.
        warn('Could not activate ThinkReview in an open tab:', tab.id, error);
      }
    }));
  }

  async function run() {
    let result;
    do {
      requested = false;
      try {
        // Persist the recovery opportunity BEFORE attempting registration. This
        // also covers unexpected worker termination during initialization.
        await api.alarms.create(alarmName, { delayInMinutes: 1 });
        for (let attempt = 0; attempt < 3; attempt++) {
          result = await reconcile();
          if (result.success) break;
        }
        if (result.success) await api.alarms.clear(alarmName);
        else warn('Content script registration failed; scheduled retry:', result.errors);
        await activateOpenTabs(result.configs || []);
      } catch (error) {
        warn('Content script recovery failed:', error);
        result = { success: false, errors: [error.message] };
      }
    } while (requested);
    return { success: result.success, errors: result.errors || [] };
  }

  return function updateContentScripts() {
    requested = true;
    if (!running) running = run().finally(() => { running = null; });
    return running;
  };
}
