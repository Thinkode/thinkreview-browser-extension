// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[GoogleSignIn]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[GoogleSignIn]', ...args); }

// We'll use the CloudService dynamically
let CloudService = null;

// Dynamically import the CloudService
async function loadCloudService() {
  try {
    const module = await import('../../services/cloud-service.js');
    CloudService = module.CloudService;
    dbgLog('CloudService loaded successfully');
    return true;
  } catch (error) {
    dbgWarn('Failed to load CloudService:', error);
    return false;
  }
}

class GoogleSignIn extends HTMLElement {
  constructor() {
    super();
    this.user = null;
    this.cloudServiceLoaded = false;
    this.isSigningIn = false;
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    await loadCloudService();
    this.cloudServiceLoaded = true;
    await this.checkSignInStatus();
    await this.render();
  }

  disconnectedCallback() {
    // Clean up auth listener and timeout when component is removed from DOM
    if (this._authListenerCleanup) {
      dbgLog('Cleaning up auth listener on component disconnect');
      chrome.runtime.onMessage.removeListener(this._authListenerCleanup.listener);
      clearTimeout(this._authListenerCleanup.timeout);
      this._authListenerCleanup = null;
    }
    
    // Reset signing in state if component is removed during sign-in
    if (this.isSigningIn) {
      this.isSigningIn = false;
    }
  }

  async checkSignInStatus() {
    dbgLog('Starting checkSignInStatus...');
    try {
      // Check for stored OAuth user data (supports both extension OAuth and webapp Firebase auth)
      const userData = await new Promise(resolve => {
        chrome.storage.local.get(['user', 'userData', 'oauth_user', 'oauth_token', 'authSource'], result => resolve(result));
      });

      // Check new OAuth flow
      if (userData.oauth_user && userData.oauth_token) {
        dbgLog('Found OAuth user data');
        this.user = userData.oauth_user;
        return;
      }
      
      // Check old storage format for backward compatibility (includes webapp auth)
      if (userData.userData) {
        dbgLog('Found stored user data (userData format), auth source:', userData.authSource || 'extension');
        this.user = userData.userData;
        
        // Check if we need to refresh user data from the cloud
        const lastSynced = this.user.lastSynced ? new Date(this.user.lastSynced) : null;
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
        
        // If last sync was more than an hour ago, refresh from cloud
        if ((!lastSynced || lastSynced < oneHourAgo) && CloudService) {
          dbgLog('User data needs refresh, syncing with cloud...');
          try {
            const refreshedUser = await CloudService.getUserData(this.user.email);
            if (refreshedUser) {
              this.user = { ...this.user, ...refreshedUser, lastSynced: new Date().toISOString() };
              await new Promise(resolve => {
                chrome.storage.local.set({ 
                  userData: this.user,
                  user: JSON.stringify(this.user)
                }, resolve);
              });
              dbgLog('User data refreshed from cloud');
            }
          } catch (error) {
            dbgWarn('Failed to refresh user data from cloud:', error);
          }
        }
        return;
      }
      
      if (userData.user) {
        dbgLog('Found stored user data (old format)');
        try {
          this.user = JSON.parse(userData.user);
        } catch (e) {
          dbgWarn('Failed to parse stored user data:', e);
          this.user = null;
        }
        return;
      }

      // No valid authentication found
      dbgLog('No valid authentication found, user is not authenticated');
      this.user = null;
      
    } catch (error) {
      dbgWarn('Error checking sign-in status:', error);
      this.user = null;
    }
  }

  async render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .gitlab-mr-btn {
          height: 40px;
          border-radius: 4px;
          cursor: pointer;
          font-family: 'Roboto', arial, sans-serif;
          font-size: 14px;
          letter-spacing: 0.25px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
        }
        .signin-button {
          padding: 0;
          border: 1px solid #dadce0;
          background: white;
          color: #3c4043;
          box-shadow: 0 1px 3px 0 rgba(60,64,67,0.30), 0 4px 8px 3px rgba(60,64,67,0.15);
        }
        .signin-button:hover:not(:disabled) {
          box-shadow: 0 2px 3px 0 rgba(60,64,67,0.30), 0 6px 10px 4px rgba(60,64,67,0.15);
        }
        .signin-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .signin-button .google-icon {
          background: white;
          padding: 8px;
          border-radius: 4px;
          margin-right: 8px;
          height: 100%;
          box-sizing: border-box;
        }
        .signin-button .button-text {
          padding: 0 12px;
        }
        .user-container {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: 20px;
          background: #f1f3f4;
          color: #3c4043;
          font-size: 14px;
        }
        .user-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
        }
        .signout-button {
          padding: 0 16px;
          background: transparent;
          border: none;
          color: #5f6368;
          font-size: 13px;
        }
        .signout-button:hover {
          color: #202124;
          background: #f1f3f4;
        }
        .loading-spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
      ${this.user ? `
        <div class="user-container">
          <div class="user-info">
            <img src="${this.user.picture}" alt="${this.user.name}" class="user-avatar">
            <span>${this.user.name}</span>
          </div>
          <button class="gitlab-mr-btn signout-button" id="signout">Sign out</button>
        </div>
      ` : `
        <button class="gitlab-mr-btn signin-button" id="signin" ${this.isSigningIn ? 'disabled' : ''}>
          <span class="google-icon">
            ${this.isSigningIn ? `
              <svg width="24" height="24" viewBox="0 0 24 24" class="loading-spinner">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#4285F4"/>
              </svg>
            ` : `
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            `}
          </span>
          <span class="button-text">${this.isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
        </button>
      `}
    `;

    if (this.user) {
      this.shadowRoot.querySelector('#signout').addEventListener('click', () => this.signOut());
    } else {
      this.shadowRoot.querySelector('#signin').addEventListener('click', () => this.signIn());
    }
  }

  async signIn() {
    if (this.isSigningIn) {
      dbgLog('Sign-in already in progress');
      return;
    }

    this.isSigningIn = true;
    this.render(); // Update UI to show loading state
    
    dbgLog('Opening portal signin page');
    
    // Clean up any existing listener from previous sign-in attempts
    if (this._authListenerCleanup) {
      chrome.runtime.onMessage.removeListener(this._authListenerCleanup.listener);
      clearTimeout(this._authListenerCleanup.timeout);
      this._authListenerCleanup = null;
    }
    
    // Declare variables for listener and timeout
    let cleanupTimeout;
    let authListener;
    
    // Set up listener BEFORE opening portal page to prevent race condition
    authListener = (message, sender, sendResponse) => {
      // SECURITY: Validate message origin - must be from extension's background script
      if (!sender || sender.id !== chrome.runtime.id) {
        dbgWarn('Rejected message from unauthorized sender:', sender?.id);
        return; // Ignore messages from external sources
      }
      
      if (message.type === 'WEBAPP_AUTH_SYNCED') {
        dbgLog('Portal auth success received, refreshing user state');
        chrome.runtime.onMessage.removeListener(authListener);
        clearTimeout(cleanupTimeout);
        this._authListenerCleanup = null;
        
        // Check sign-in status and refresh UI reactively
        this.checkSignInStatus().then(() => {
          this.isSigningIn = false;
          this.render();
          
          // Dispatch custom event to notify other components of auth state change
          this.dispatchEvent(new CustomEvent('signInStateChanged', {
            detail: { 
              signed_in: true,
              user: this.user,
              source: 'portal'
            },
            bubbles: true,
            composed: true
          }));
        }).catch((error) => {
          dbgWarn('Error checking sign-in status after auth:', error);
          this.isSigningIn = false;
          this.render();
          
          // Dispatch error event for reactive error handling
          this.dispatchEvent(new CustomEvent('signin-error', {
            detail: { error: error.message },
            bubbles: true,
            composed: true
          }));
        });
      }
    };
    
    // Clean up listener after 5 minutes if no response
    cleanupTimeout = setTimeout(() => {
      if (this._authListenerCleanup && this._authListenerCleanup.listener === authListener) {
        chrome.runtime.onMessage.removeListener(authListener);
        this._authListenerCleanup = null;
        if (this.isSigningIn) {
          this.isSigningIn = false;
          this.render();
        }
      }
    }, 5 * 60 * 1000);
    
    chrome.runtime.onMessage.addListener(authListener);
    this._authListenerCleanup = { listener: authListener, timeout: cleanupTimeout };
    
    // Open portal signin page in a new tab
    const portalUrl = 'https://portal.thinkreview.dev/signin-extension';
    chrome.tabs.create({ url: portalUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        dbgWarn('Error opening portal page:', chrome.runtime.lastError);
        
        // Clean up listener since we're not proceeding
        chrome.runtime.onMessage.removeListener(authListener);
        clearTimeout(cleanupTimeout);
        this._authListenerCleanup = null;
        
        // Reset state and show error
        this.isSigningIn = false;
        this.render();
        
        // Show user-friendly error
        alert('Failed to open sign-in page. Please allow popups for this extension.');
        
        // Dispatch error event
        this.dispatchEvent(new CustomEvent('signin-error', {
          detail: { error: chrome.runtime.lastError.message || 'Failed to open portal page' },
          bubbles: true,
          composed: true
        }));
      }
    });
  }

  async signOut() {
    try {
      const userEmail = this.user?.email;
      dbgLog(`Signing out user: ${userEmail}`);
      
      // Call OAuth logout handler
      const response = await chrome.runtime.sendMessage({
        type: 'logout'
      });
      
      if (!response || !response.success) {
        dbgWarn('Logout handler returned error, but continuing with local cleanup');
      }

      this.user = null;
      this.render();
      dbgLog('Signed out');

      // Dispatch events with consistent structure
      this.dispatchEvent(new CustomEvent('signInStateChanged', {
        detail: { signed_in: false },
        bubbles: true,
        composed: true
      }));
      
      // Also dispatch the signout-complete event for backward compatibility
      this.dispatchEvent(new CustomEvent('signout-complete', { 
        bubbles: true, 
        composed: true
      }));
    } catch (error) {
      dbgWarn('Error signing out:', error);
      
      // Reset the UI even if there was an error
      this.user = null;
      this.render();
      
      // Dispatch error event
      this.dispatchEvent(new CustomEvent('signout-error', {
        detail: { error: error.message },
        bubbles: true,
        composed: true
      }));
    }
  }
}

// Only define the custom element if it hasn't been defined yet
if (!customElements.get('google-signin')) {
  customElements.define('google-signin', GoogleSignIn);
}
