/**
 * Client-side Semantic Search using Transformers.js
 * Lazy-loads model only when user performs first search.
 */

(function () {
  'use strict';

  // State
  let embeddings = null;
  let pipeline = null;
  let isModalOpen = false;
  let selectedIndex = 0;
  let searchResults = [];
  let isLoading = false;
  let modelLoaded = false;
  let modelLoading = false;

  // Configuration
  const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
  const EMBEDDINGS_URL = '/search/embeddings.json';
  const TOP_K = 10;

  // DOM Elements (created on init)
  let modal, backdrop, searchInput, resultsContainer, statusText, loadingBar;

  /**
   * Cosine similarity between two vectors
   */
  function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Search embeddings for similar items
   * Articles and Minis are boosted over Bazaar items
   * Title matches get additional boost
   */
  function searchEmbeddings(queryEmbedding, topK = TOP_K, query = '') {
    if (!embeddings || !embeddings.items) return [];

    // Index pages to exclude from search results
    const indexPaths = ['/articles/', '/minis/', '/bazaar/'];

    // Type boost: prioritize articles and minis
    const typeBoost = {
      article: 0.15,
      mini: 0.10,
      bazaar: -0.12,
    };

    // Prepare query words for title matching
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const results = embeddings.items
      .filter((item) => !indexPaths.includes(item.url))
      .map((item) => {
      const rawScore = cosineSimilarity(queryEmbedding, item.embedding);
      const typeBoostVal = typeBoost[item.type] || 0;

      // Title match boost
      let titleBoost = 0;
      if (queryWords.length > 0 && item.title) {
        const titleLower = item.title.toLowerCase();
        const matchedWords = queryWords.filter(w => titleLower.includes(w));
        // Boost based on percentage of query words found in title
        titleBoost = (matchedWords.length / queryWords.length) * 0.15;
      }

      // Tags/keywords match boost
      let tagsBoost = 0;
      if (queryWords.length > 0 && item.tags && item.tags.length > 0) {
        const tagsLower = item.tags.map(t => t.toLowerCase()).join(' ');
        const matchedTags = queryWords.filter(w => tagsLower.includes(w));
        // Boost based on percentage of query words found in tags
        tagsBoost = (matchedTags.length / queryWords.length) * 0.10;
      }

      return {
        ...item,
        score: rawScore + typeBoostVal + titleBoost + tagsBoost,
        rawScore: rawScore,
      };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Load embeddings from server
   */
  async function loadEmbeddings() {
    if (embeddings) return embeddings;

    try {
      updateStatus('Loading index...', true);
      const response = await fetch(EMBEDDINGS_URL);
      if (!response.ok) throw new Error('Failed to load embeddings');
      embeddings = await response.json();
      console.log(`Loaded ${embeddings.count} embeddings`);
      updateStatus(`${embeddings.count} items indexed`, false);
      return embeddings;
    } catch (error) {
      console.error('Error loading embeddings:', error);
      updateStatus('Failed to load index', false);
      throw error;
    }
  }

  /**
   * Load the embedding model using Transformers.js (lazy, on first search)
   */
  async function loadModel() {
    if (pipeline) return pipeline;
    if (modelLoading) {
      // Wait for existing load to complete
      while (modelLoading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return pipeline;
    }

    modelLoading = true;
    updateStatus('Loading AI model (first search only)...', true);
    updateLoadingBar(10);

    try {
      // Dynamic import of Transformers.js from CDN
      const { pipeline: createPipeline, env } = await import(
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
      );

      // Configure for browser usage
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      updateLoadingBar(30);

      // Create feature extraction pipeline
      pipeline = await createPipeline('feature-extraction', MODEL_ID, {
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            const pct = 30 + Math.round(progress.progress * 0.7);
            updateLoadingBar(pct);
            updateStatus(`Loading AI model... ${Math.round(progress.progress)}%`, true);
          }
        },
      });

      modelLoaded = true;
      updateLoadingBar(100);
      setTimeout(() => updateLoadingBar(0), 300);
      updateStatus('Ready', false);
      return pipeline;
    } catch (error) {
      console.error('Error loading model:', error);
      updateStatus('Model failed - try refreshing', false);
      throw error;
    } finally {
      modelLoading = false;
    }
  }

  /**
   * Generate embedding for a query
   */
  async function generateQueryEmbedding(query) {
    if (!pipeline) {
      await loadModel();
    }

    const output = await pipeline(query, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data);
  }

  /**
   * Perform semantic search
   */
  async function performSearch(query) {
    if (!query.trim()) {
      renderResults([]);
      updateStatus('Ready', false);
      return;
    }

    isLoading = true;

    try {
      // Load embeddings and model in parallel on first search
      const needsModel = !pipeline && !modelLoading;
      const needsEmbeddings = !embeddings;

      if (needsModel || needsEmbeddings) {
        updateStatus(needsModel ? 'Loading AI model...' : 'Loading...', true);
        await Promise.all([
          needsEmbeddings ? loadEmbeddings() : Promise.resolve(),
          needsModel ? loadModel() : Promise.resolve(),
        ]);
      }

      updateStatus('Searching...', true);

      // Generate query embedding
      const queryEmbedding = await generateQueryEmbedding(query);

      // Search
      searchResults = searchEmbeddings(queryEmbedding, TOP_K, query);

      renderResults(searchResults);
      updateStatus(`${searchResults.length} results`, false);
    } catch (error) {
      console.error('Search error:', error);
      updateStatus('Search failed', false);
      renderResults([]);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Render search results
   */
  function renderResults(results) {
    if (!resultsContainer) return;

    if (results.length === 0) {
      resultsContainer.innerHTML = searchInput.value.trim()
        ? '<div class="ss-no-results">No results found</div>'
        : `<div class="ss-hint">Start typing to search...<br><small style="opacity:0.5">${modelLoaded ? '' : 'AI model loads on first search'}</small></div>`;
      return;
    }

    selectedIndex = 0;

    resultsContainer.innerHTML = results
      .map((item, index) => {
        const typeClass = `ss-type-${item.type}`;
        const selectedClass = index === selectedIndex ? 'ss-selected' : '';
        const score = Math.min(100, Math.round(item.score * 100));

        return `
        <a href="${item.url}" class="ss-result ${selectedClass}" data-index="${index}">
          <div class="ss-result-header">
            <span class="ss-result-type ${typeClass}">${item.type}</span>
            <span class="ss-result-score">${score}%</span>
          </div>
          <div class="ss-result-title">${escapeHtml(item.title)}</div>
          <div class="ss-result-description">${escapeHtml(item.description?.slice(0, 150) || '')}${item.description?.length > 150 ? '...' : ''}</div>
          ${item.tags?.length ? `<div class="ss-result-tags">${item.tags.map((t) => `<span class="ss-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </a>
      `;
      })
      .join('');

    // Add click handlers
    resultsContainer.querySelectorAll('.ss-result').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        selectedIndex = parseInt(el.dataset.index);
        updateSelection();
      });
    });
  }

  /**
   * Update selected result highlighting
   */
  function updateSelection() {
    if (!resultsContainer) return;

    resultsContainer.querySelectorAll('.ss-result').forEach((el, index) => {
      el.classList.toggle('ss-selected', index === selectedIndex);
    });

    // Scroll selected into view
    const selected = resultsContainer.querySelector('.ss-selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Update status text
   */
  function updateStatus(text, showSpinner) {
    if (!statusText) return;
    statusText.innerHTML = showSpinner
      ? `<span class="ss-spinner"></span> ${text}`
      : text;
  }

  /**
   * Update loading bar
   */
  function updateLoadingBar(percent) {
    if (!loadingBar) return;
    loadingBar.style.width = `${percent}%`;
    loadingBar.style.display = percent > 0 && percent < 100 ? 'block' : 'none';
  }

  /**
   * Escape HTML entities
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Open the search modal
   */
  function openModal() {
    if (isModalOpen) return;
    isModalOpen = true;

    modal.classList.add('ss-open');
    backdrop.classList.add('ss-open');
    document.body.style.overflow = 'hidden';

    // Focus input immediately
    searchInput.focus();
  }

  /**
   * Close the search modal
   */
  function closeModal() {
    if (!isModalOpen) return;
    isModalOpen = false;

    modal.classList.remove('ss-open');
    backdrop.classList.remove('ss-open');
    document.body.style.overflow = '';

    // Clear search
    searchInput.value = '';
    renderResults([]);
  }

  /**
   * Handle keyboard navigation
   */
  function handleKeyDown(event) {
    if (!isModalOpen) {
      // Open modal with Cmd/Ctrl + K
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        openModal();
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeModal();
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (searchResults.length > 0) {
          selectedIndex = (selectedIndex + 1) % searchResults.length;
          updateSelection();
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (searchResults.length > 0) {
          selectedIndex =
            (selectedIndex - 1 + searchResults.length) % searchResults.length;
          updateSelection();
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (searchResults.length > 0 && searchResults[selectedIndex]) {
          window.location.href = searchResults[selectedIndex].url;
        }
        break;
    }
  }

  /**
   * Debounce function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Create modal DOM elements
   */
  function createModal() {
    // Backdrop
    backdrop = document.createElement('div');
    backdrop.className = 'ss-backdrop';
    backdrop.addEventListener('click', closeModal);

    // Modal
    modal = document.createElement('div');
    modal.className = 'ss-modal';
    modal.innerHTML = `
      <div class="ss-header">
        <div class="ss-input-wrapper">
          <svg class="ss-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" class="ss-input" placeholder="Search articles, minis, wiki..." autocomplete="off" spellcheck="false">
          <kbd class="ss-kbd">ESC</kbd>
        </div>
        <div class="ss-loading-bar"></div>
      </div>
      <div class="ss-results">
        <div class="ss-hint">Start typing to search...</div>
      </div>
      <div class="ss-footer">
        <span class="ss-status">Ready</span>
        <div class="ss-shortcuts">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>esc</kbd> Close</span>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    // Get references
    searchInput = modal.querySelector('.ss-input');
    resultsContainer = modal.querySelector('.ss-results');
    statusText = modal.querySelector('.ss-status');
    loadingBar = modal.querySelector('.ss-loading-bar');

    // Search on input
    const debouncedSearch = debounce((query) => performSearch(query), 300);
    searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

    // Prevent modal close when clicking inside
    modal.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * Create search trigger buttons (navbar + homepage)
   */
  function createTriggerButton() {
    // Preload helper
    function addPreloadOnHover(btn) {
      let preloadTriggered = false;
      btn.addEventListener('mouseenter', () => {
        if (!preloadTriggered && !modelLoaded && !modelLoading) {
          preloadTriggered = true;
          setTimeout(() => {
            if (!modelLoaded && !modelLoading) {
              loadModel().catch(() => {});
            }
          }, 200);
        }
      });
    }

    // Navbar button (always present)
    const navBtn = document.createElement('button');
    navBtn.className = 'ss-nav-trigger';
    navBtn.setAttribute('aria-label', 'Search');
    navBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <kbd>⌘K</kbd>
    `;
    navBtn.addEventListener('click', openModal);
    addPreloadOnHover(navBtn);

    // Insert into navbar (find the nav items container)
    const nav = document.querySelector('nav.hx-flex');
    if (nav) {
      // Insert before the github/twitter icons
      const navItems = nav.querySelector('.hx-flex.hx-gap-4');
      if (navItems) {
        navItems.insertBefore(navBtn, navItems.firstChild);
      } else {
        nav.appendChild(navBtn);
      }
    }

    // Homepage button (only on homepage with filters)
    const filtersSection = document.querySelector('.hm-filters-section');
    if (filtersSection) {
      const btn = document.createElement('button');
      btn.className = 'ss-trigger';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <span>Semantic Search</span>
        <kbd>⌘K</kbd>
      `;
      btn.addEventListener('click', openModal);
      addPreloadOnHover(btn);

      const wrapper = document.createElement('div');
      wrapper.className = 'ss-trigger-wrapper';
      wrapper.appendChild(btn);
      filtersSection.parentNode.insertBefore(wrapper, filtersSection);
    }
  }

  /**
   * Initialize semantic search
   */
  function init() {
    // Create DOM elements
    createModal();
    createTriggerButton();

    // Global keyboard handler
    document.addEventListener('keydown', handleKeyDown);

    console.log('Semantic search initialized');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
