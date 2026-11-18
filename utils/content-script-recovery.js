// Built-in platforms load from the manifest. Retry custom-domain registration
// on browser events and activate pages that were already open before install.
export function createContentScriptRecovery(api, reconcile, warn = () => {}) {
  let running = null;
  let requested = false;
  let lastReconcileSucceeded = false;
  const session = api.storage?.session;
  const healthKey = 'contentScriptRegistrationHealth';
  const version = api.runtime.getManifest().version;
  let healthLoaded = false;
  let healthRead = null;
  let revision = 0;

  async function loadHealth() {
    if (healthLoaded) return;
    if (!healthRead) {
      const readRevision = revision;
      healthRead = (async () => {
        try {
          const stored = session ? await session.get(healthKey) : {};
          // A permission/domain update may start while this read is in flight.
          if (revision === readRevision) {
            const health = stored?.[healthKey];
            lastReconcileSucceeded = health?.version === version && health.healthy === true;
          }
        } catch (error) {
          warn('Could not read registration health; falling back to recovery:', error);
        } finally {
          healthLoaded = true;
        }
      })();
    }
    await healthRead;
  }

  async function saveHealth(healthy) {
    if (!session) return;
    try {
      await session.set({ [healthKey]: { version, healthy } });
    } catch (error) {
      // Session storage is an optimization; unavailable storage must not block repair.
      warn('Could not persist registration health:', error);
    }
  }

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
        // Persist pending state before work so an interrupted worker cannot leave
        // a previous success flag masking incomplete domain/permission changes.
        await saveHealth(false);
        for (let attempt = 0; attempt < 3; attempt++) {
          result = await reconcile();
          if (result.success) break;
        }
        if (!result.success) warn('Custom content script registration failed; will retry on the next browser event:', result.errors);
        await activateOpenTabs(result.configs || []);
      } catch (error) {
        warn('Content script recovery failed:', error);
        result = { success: false, errors: [error.message] };
      }
      await saveHealth(result.success);
    } while (requested);
    lastReconcileSucceeded = result.success;
    return { success: result.success, errors: result.errors || [] };
  }

  function updateContentScripts() {
    revision += 1;
    healthLoaded = true;
    lastReconcileSucceeded = false;
    requested = true;
    if (!running) running = run().finally(() => { running = null; });
    return running;
  }
  updateContentScripts.recoverIfNeeded = async () => {
    await loadHealth();
    if (running) return running;
    if (!lastReconcileSucceeded) return updateContentScripts();
    return { success: true, errors: [] };
  };
  updateContentScripts.needsRecovery = () => !lastReconcileSucceeded;
  return updateContentScripts;
}
