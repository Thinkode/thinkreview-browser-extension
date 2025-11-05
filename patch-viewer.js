// patch-viewer.js
// Loads and displays patch content, supports formatting, download, and code review

function getPatchUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('url');
}

function highlightDiff(text) {
  // Simple diff highlighting: + green, - red, others default
  return text.replace(/(^[+].*)/gm, '<span class="diff-add">$1</span>')
             .replace(/(^[-].*)/gm, '<span class="diff-del">$1</span>')
             .replace(/(^@@.*@@)/gm, '<span class="diff-hunk">$1</span>');
}

// Import CloudService dynamically to avoid CSP issues
async function loadCloudService() {
  try {
    const module = await import('./services/cloud-service.js');
    return module.CloudService;
  } catch (error) {
    // console.error('Failed to load CloudService:', error);
    return null;
  }
}

// Display code review results in the UI
function displayCodeReview(review) {
  const reviewResults = document.getElementById('review-results');
  const reviewLoading = document.getElementById('review-loading');
  const reviewSummary = document.getElementById('review-summary');
  const reviewSuggestions = document.getElementById('review-suggestions');
  const reviewSecurity = document.getElementById('review-security');
  const reviewPractices = document.getElementById('review-practices');
  
  // Hide loading indicator
  reviewLoading.classList.add('hidden');
  
  // Show review results
  reviewResults.classList.remove('hidden');
  
  // Display summary
  reviewSummary.innerHTML = review.summary || 'No summary provided.';
  
  // Display suggestions
  reviewSuggestions.innerHTML = '';
  if (review.suggestions && review.suggestions.length > 0) {
    review.suggestions.forEach(suggestion => {
      const li = document.createElement('li');
      li.textContent = suggestion;
      reviewSuggestions.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'No suggestions found.';
    reviewSuggestions.appendChild(li);
  }
  
  // Display security issues
  reviewSecurity.innerHTML = '';
  if (review.securityIssues && review.securityIssues.length > 0) {
    review.securityIssues.forEach(issue => {
      const li = document.createElement('li');
      li.textContent = issue;
      reviewSecurity.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'No security issues found.';
    reviewSecurity.appendChild(li);
  }
  
  // Display best practices
  reviewPractices.innerHTML = '';
  if (review.bestPractices && review.bestPractices.length > 0) {
    review.bestPractices.forEach(practice => {
      const li = document.createElement('li');
      li.textContent = practice;
      reviewPractices.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'No best practice recommendations found.';
    reviewPractices.appendChild(li);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const patchUrl = getPatchUrlFromQuery();
  const pre = document.getElementById('patch-content');
  const meta = document.getElementById('patch-meta');
  const reviewResults = document.getElementById('review-results');
  const reviewLoading = document.getElementById('review-loading');
  let rawContent = '';
  let formatted = false;

  if (!patchUrl) {
    pre.textContent = 'No patch URL provided.';
    return;
  }
  meta.textContent = patchUrl;
  pre.textContent = 'Loading...';

  chrome.storage.local.get({ patches: [] }, (data) => {
    const found = data.patches.find(p => p.patchUrl === patchUrl);
    if (found) {
      rawContent = found.patchContent;
      pre.textContent = rawContent;
    } else {
      // fallback: fetch live
      fetch(patchUrl, { credentials: 'include' })
        .then(resp => resp.ok ? resp.text() : Promise.reject('Failed to fetch patch'))
        .then(txt => {
          rawContent = txt;
          pre.textContent = rawContent;
        })
        .catch(() => {
          pre.textContent = 'Could not load patch.';
        });
    }
  });

  document.getElementById('toggle-format').onclick = () => {
    if (!rawContent) return;
    formatted = !formatted;
    if (formatted) {
      pre.innerHTML = highlightDiff(rawContent);
    } else {
      pre.textContent = rawContent;
    }
  };

  document.getElementById('download-patch').onclick = () => {
    if (!rawContent) return;
    const filename = patchUrl.split('/').pop().replace(/\?.*$/, '') + '.patch';
    const blob = new Blob([rawContent], { type: 'text/x-patch' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  
  // Code review button handler
  document.getElementById('review-code').onclick = async () => {
    if (!rawContent) {
      alert('No patch content to review.');
      return;
    }
    
    // Show the review section and loading indicator
    reviewResults.classList.remove('hidden');
    reviewLoading.classList.remove('hidden');
    
    try {
      // Load CloudService dynamically
      const CloudService = await loadCloudService();
      
      if (!CloudService) {
        throw new Error('Could not load CloudService module');
      }
      
      // Dynamically import patch filtering utilities
      const patchFilterModule = await import(chrome.runtime.getURL('utils/patch-filter.js'));
      const { filterPatch, getFilterSummary } = patchFilterModule;
      
      // Filter out media and binary files from the patch
      const filterResult = filterPatch(rawContent);
      const filteredContent = filterResult.filteredPatch;
      
      // Send filtered patch content for review
      const response = await CloudService.reviewPatchCode(filteredContent);
      
      if (!response || response.status !== 'success' || !response.review) {
        throw new Error('Invalid response from code review service');
      }
      
      // Add filter summary to the review if files were filtered
      if (filterResult.removedFileCount > 0) {
        const filterSummary = getFilterSummary(filterResult);
        response.review.summary = (response.review.summary || '') + '\n\n' + filterSummary;
      }
      
      // Display the review results
      displayCodeReview(response.review);
    } catch (error) {
      // console.error('Error during code review:', error);
      reviewLoading.classList.add('hidden');
      
      // Show error message in the review summary
      const reviewSummary = document.getElementById('review-summary');
      reviewSummary.innerHTML = `<strong>Error:</strong> ${error.message || 'Failed to complete code review'}`;
      reviewResults.classList.remove('hidden');
    }
  };
});
