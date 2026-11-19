/**
 * ReviewPrompt session dismiss + storage merge behavior.
 */

import { FEEDBACK_PROMPT_LOCAL_INTERACTION_KEY } from '../utils/feedback-prompt-interaction.js';
import { ReviewPrompt } from '../components/review-prompt/review-prompt.js';

function createMemoryStorage(initial = {}) {
  const store = { ...initial };
  const snapshot = (keys) => {
    const out = {};
    for (const key of keys) out[key] = store[key];
    return out;
  };
  return {
    store,
    get: (keys, cb) => {
      const out = snapshot(keys);
      if (typeof cb === 'function') {
        cb(out);
        return undefined;
      }
      return Promise.resolve(out);
    },
    set: (obj, cb) => {
      Object.assign(store, obj);
      if (typeof cb === 'function') {
        cb();
        return undefined;
      }
      return Promise.resolve();
    },
    remove: (keys, cb) => {
      for (const key of keys) delete store[key];
      if (typeof cb === 'function') {
        cb();
        return undefined;
      }
      return Promise.resolve();
    }
  };
}

describe('ReviewPrompt dismiss persistence', () => {
  let storage;

  beforeEach(() => {
    storage = createMemoryStorage({
      reviewCount: 42,
      lastFeedbackPromptInteraction: null
    });
    global.chrome = {
      runtime: {
        getURL: (path) => path,
        lastError: null
      },
      storage: { local: storage },
      identity: {
        getProfileUserInfo: (_opts, cb) => cb({})
      }
    };
    document.body.innerHTML = `
      <div id="gitlab-mr-integrated-review">
        <div id="review-prompt-container"></div>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-thinkreview-tour-active');
    document.documentElement.removeAttribute('data-thinkreview-tour-pending');
  });

  it('does not re-show after close, even if a refresh clobbers the synced key', async () => {
    const prompt = new ReviewPrompt();
    prompt.init('review-prompt-container');

    expect(await prompt.checkAndShow()).toBe(true);
    await prompt.dismiss();

    storage.store.lastFeedbackPromptInteraction = null;

    expect(await prompt.checkAndShow()).toBe(false);
    expect(storage.store[FEEDBACK_PROMPT_LOCAL_INTERACTION_KEY].action).toBe('later');
  });

  it('does not show the feedback prompt while the product tour is active', async () => {
    document.documentElement.setAttribute('data-thinkreview-tour-active', '1');
    const prompt = new ReviewPrompt();
    prompt.init('review-prompt-container');
    expect(await prompt.checkAndShow()).toBe(false);
  });
});
