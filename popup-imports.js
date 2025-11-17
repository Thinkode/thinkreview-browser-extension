// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[popup-imports]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[popup-imports]', ...args); }

// Module loading state
let modulesLoaded = {
  cloudService: false,
  googleSignIn: false
};

// First try to import the CloudService
let CloudService = null;

async function loadModules() {
  dbgLog('Starting module loading process...');
  
  try {
    dbgLog('Loading CloudService...');
    const cloudServiceModule = await import('./services/cloud-service.js');
    CloudService = cloudServiceModule.CloudService;
    dbgLog('CloudService loaded successfully');
    modulesLoaded.cloudService = true;
    
    // Make CloudService available globally for components that need it
    window.CloudService = CloudService;
    
    // Dispatch an event to notify components that CloudService is ready
    window.dispatchEvent(new CustomEvent('cloud-service-ready', {
      detail: { CloudService }
    }));
  } catch (error) {
    dbgWarn('Error loading CloudService:', error);
    // Continue loading other components even if CloudService fails to load
  }
  
  try {
    dbgLog('Loading Google Sign-In component...');
    await import('./components/google-signin/google-signin.js');
    dbgLog('Google Sign-In component loaded successfully');
    modulesLoaded.googleSignIn = true;
  } catch (error) {
    dbgWarn('Error loading Google Sign-In component:', error);
  }
  
  // Subscription component removed - no longer needed in popup context
  
  // Check if all critical modules loaded
  const allModulesLoaded = Object.values(modulesLoaded).every(loaded => loaded);
  
  if (allModulesLoaded) {
    dbgLog('All modules loaded successfully');
  } else {
    dbgWarn('Some modules failed to load:', modulesLoaded);
  }
  
  // Dispatch a general modules-ready event
  window.dispatchEvent(new CustomEvent('modules-ready', {
    detail: { 
      modulesLoaded,
      CloudService: modulesLoaded.cloudService ? CloudService : null
    }
  }));
  
  dbgLog('Module loading process completed');
}

// Start loading modules with error handling
loadModules().catch(error => {
  dbgWarn('Critical error in module loading process:', error);
  
  // Dispatch error event
  window.dispatchEvent(new CustomEvent('modules-error', {
    detail: { error: error.message }
  }));
});

// Add any additional component imports here
