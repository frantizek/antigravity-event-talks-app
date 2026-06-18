// C:\dev\agy-cli-projects\static\js\main.js

document.addEventListener('DOMContentLoaded', () => {
    // App State
    let rawEntries = [];      // Raw feed entries from API
    let parsedUpdates = [];   // Parsed individual updates
    let selectedUpdate = null;
    let tweetsLog = JSON.parse(localStorage.getItem('bq_tweets_log') || '[]');
    
    let filters = {
        search: '',
        category: 'all',
        sortNewest: true
    };

    // DOM Elements
    const btnRefresh = document.getElementById('btn-refresh');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const searchInput = document.getElementById('search-input');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const btnSort = document.getElementById('btn-sort');
    const feedContainer = document.getElementById('feed-container');
    
    // Composer Elements
    const composerPlaceholder = document.getElementById('composer-placeholder');
    const composerForm = document.getElementById('composer-form');
    const composerRefType = document.getElementById('composer-ref-type');
    const composerRefDate = document.getElementById('composer-ref-date');
    const composerTextarea = document.getElementById('composer-textarea');
    const charCount = document.getElementById('char-count');
    const btnMockPost = document.getElementById('btn-mock-post');
    const btnTweetReal = document.getElementById('btn-tweet-real');
    
    // Tweet Log Elements
    const tweetLogList = document.getElementById('tweet-log-list');
    const btnClearLog = document.getElementById('btn-clear-log');

    // Initialize
    init();

    function init() {
        // Event Listeners
        btnRefresh.addEventListener('click', fetchReleaseNotes);
        searchInput.addEventListener('input', handleSearch);
        btnSort.addEventListener('click', toggleSort);
        btnMockPost.addEventListener('click', handleMockPost);
        btnTweetReal.addEventListener('click', handleRealTweet);
        btnClearLog.addEventListener('click', clearTweetLog);
        
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                filters.category = button.dataset.category;
                renderUpdates();
            });
        });

        composerTextarea.addEventListener('input', updateCharCount);

        // Fetch initial data
        fetchReleaseNotes();
        renderTweetLog();
    }

    // Fetch release notes from backend
    async function fetchReleaseNotes() {
        setLoadingState(true);
        try {
            const response = await fetch('/api/release-notes');
            const result = await response.json();
            
            if (result.status === 'success') {
                rawEntries = result.data;
                parseFeedEntries(rawEntries);
                renderUpdates();
                
                const now = new Date();
                statusText.textContent = `Last updated: ${now.toLocaleTimeString()}`;
            } else {
                showError(result.message || 'Failed to fetch release notes.');
            }
        } catch (error) {
            showError('Network error. Make sure the Flask server is running.');
            console.error('Error fetching release notes:', error);
        } finally {
            setLoadingState(false);
        }
    }

    // Set loading indicator states
    function setLoadingState(isLoading) {
        if (isLoading) {
            btnRefresh.classList.add('loading');
            btnRefresh.disabled = true;
            statusDot.classList.add('loading');
            statusText.textContent = 'Fetching feed...';
        } else {
            btnRefresh.classList.remove('loading');
            btnRefresh.disabled = false;
            statusDot.classList.remove('loading');
        }
    }

    // Parse feed entries containing HTML into individual granular updates
    function parseFeedEntries(entries) {
        const updates = [];
        const parser = new DOMParser();

        entries.forEach((entry, entryIndex) => {
            const doc = parser.parseFromString(entry.content, 'text/html');
            const headings = doc.querySelectorAll('h3');
            
            if (headings.length > 0) {
                headings.forEach((h3, headingIndex) => {
                    const typeText = h3.textContent.trim();
                    let descHtml = '';
                    let sibling = h3.nextElementSibling;
                    
                    // Collect all siblings until the next H3
                    while (sibling && sibling.tagName !== 'H3') {
                        descHtml += sibling.outerHTML;
                        sibling = sibling.nextElementSibling;
                    }
                    
                    // Build a temporary container to extract plain text
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = descHtml;
                    const plainText = tempDiv.textContent || tempDiv.innerText || '';
                    
                    updates.push({
                        id: `${entry.id || entryIndex}_update_${headingIndex}`,
                        raw_date: entry.raw_date,
                        formatted_date: entry.formatted_date,
                        link: entry.link,
                        type: normalizeUpdateType(typeText),
                        original_type: typeText,
                        description: descHtml,
                        plainText: plainText.trim()
                    });
                });
            } else {
                // If there are no H3 headings, treat the entire content block as one update
                const plainText = doc.body.textContent || doc.body.innerText || '';
                updates.push({
                    id: `${entry.id || entryIndex}_update_0`,
                    raw_date: entry.raw_date,
                    formatted_date: entry.formatted_date,
                    link: entry.link,
                    type: 'General',
                    original_type: 'General',
                    description: entry.content,
                    plainText: plainText.trim()
                });
            }
        });
        
        parsedUpdates = updates;
    }

    // Map release notes heading text to standardized categories
    function normalizeUpdateType(typeText) {
        const text = typeText.toLowerCase();
        if (text.includes('feature')) return 'Feature';
        if (text.includes('change')) return 'Changed';
        if (text.includes('deprecat')) return 'Deprecated';
        if (text.includes('fix')) return 'Fixed';
        return 'General';
    }

    // Filter and Sort updates, then render them
    function renderUpdates() {
        let filtered = [...parsedUpdates];

        // Apply search filter
        if (filters.search) {
            const query = filters.search.toLowerCase();
            filtered = filtered.filter(up => 
                up.plainText.toLowerCase().includes(query) || 
                up.original_type.toLowerCase().includes(query) ||
                up.formatted_date.toLowerCase().includes(query)
            );
        }

        // Apply category filter
        if (filters.category !== 'all') {
            filtered = filtered.filter(up => up.type === filters.category);
        }

        // Apply sorting
        filtered.sort((a, b) => {
            const dateA = new Date(a.raw_date);
            const dateB = new Date(b.raw_date);
            return filters.sortNewest ? dateB - dateA : dateA - dateB;
        });

        // Group by Date for rendering
        if (filtered.length === 0) {
            showNoResults();
            return;
        }

        feedContainer.innerHTML = '';
        
        // Grouping
        const grouped = {};
        filtered.forEach(up => {
            if (!grouped[up.formatted_date]) {
                grouped[up.formatted_date] = [];
            }
            grouped[up.formatted_date].push(up);
        });

        // Render groups
        for (const date in grouped) {
            const dateGroupDiv = document.createElement('div');
            dateGroupDiv.className = 'date-group';
            
            const dateHeader = document.createElement('h3');
            dateHeader.className = 'date-header';
            dateHeader.textContent = date;
            dateGroupDiv.appendChild(dateHeader);
            
            grouped[date].forEach(update => {
                const card = createUpdateCard(update);
                dateGroupDiv.appendChild(card);
            });
            
            feedContainer.appendChild(dateGroupDiv);
        }
    }

    // Create DOM card element for an update
    function createUpdateCard(update) {
        const card = document.createElement('div');
        card.className = `update-card ${selectedUpdate && selectedUpdate.id === update.id ? 'selected' : ''}`;
        card.id = `card-${update.id}`;
        
        const header = document.createElement('div');
        header.className = 'card-header';
        
        const badge = document.createElement('span');
        badge.className = `badge ${update.type.toLowerCase()}`;
        badge.textContent = update.original_type;
        header.appendChild(badge);
        
        if (update.link) {
            const link = document.createElement('a');
            link.href = update.link;
            link.target = '_blank';
            link.className = 'entry-link';
            link.innerHTML = 'Docs <i class="fas fa-external-link-alt"></i>';
            header.appendChild(link);
        }
        
        const content = document.createElement('div');
        content.className = 'card-content';
        content.innerHTML = update.description;
        
        // Fix target for links in update description so they open in new tabs
        content.querySelectorAll('a').forEach(a => {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        });

        const actions = document.createElement('div');
        actions.className = 'card-actions';
        
        const btnTweet = document.createElement('button');
        btnTweet.className = 'btn-tweet-card';
        btnTweet.innerHTML = '<i class="fab fa-x-twitter"></i> Tweet Update';
        btnTweet.addEventListener('click', (e) => {
            e.stopPropagation();
            selectUpdateForTweet(update);
        });
        actions.appendChild(btnTweet);

        card.appendChild(header);
        card.appendChild(content);
        card.appendChild(actions);

        // Clicking the card anywhere selects it
        card.addEventListener('click', () => {
            selectUpdateForTweet(update);
        });

        return card;
    }

    // Select an update and populate the Composer panel
    function selectUpdateForTweet(update) {
        // Deselect previous card
        if (selectedUpdate) {
            const prevCard = document.getElementById(`card-${selectedUpdate.id}`);
            if (prevCard) prevCard.classList.remove('selected');
        }

        selectedUpdate = update;
        
        // Add selected class to new card
        const card = document.getElementById(`card-${update.id}`);
        if (card) card.classList.add('selected');

        // Toggle Composer visibility
        composerPlaceholder.style.display = 'none';
        composerForm.style.display = 'flex';

        // Set references
        composerRefType.textContent = update.original_type;
        composerRefDate.textContent = update.formatted_date;

        // Construct standard prefilled tweet text
        // Limit character usage of content to fit comfortably under 280 chars
        const introText = `Google BigQuery (${update.formatted_date}): `;
        const typePrefix = `[${update.original_type}] `;
        
        // Calculate available characters for excerpt: 280 - intro - type - link - padding
        const link = update.link || 'https://cloud.google.com/bigquery';
        const reservedLen = introText.length + typePrefix.length + link.length + 15; // 15 chars for styling/spacing
        const availableLen = 280 - reservedLen;
        
        let excerpt = update.plainText;
        if (excerpt.length > availableLen) {
            excerpt = excerpt.substring(0, availableLen - 3) + '...';
        }

        const defaultTweetText = `${introText}${typePrefix}${excerpt}\n\nRead more: ${link}`;
        composerTextarea.value = defaultTweetText;
        
        updateCharCount();
        
        // Scroll composer into view on mobile
        if (window.innerWidth <= 1024) {
            composerForm.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Handle character count updates and validate limits
    function updateCharCount() {
        const len = composerTextarea.value.length;
        charCount.textContent = `${len}/280`;
        
        // Styling warning/danger levels
        charCount.className = 'char-counter';
        if (len > 280) {
            charCount.classList.add('danger');
            btnTweetReal.disabled = true;
            btnMockPost.disabled = true;
        } else if (len > 240) {
            charCount.classList.add('warning');
            btnTweetReal.disabled = false;
            btnMockPost.disabled = false;
        } else {
            btnTweetReal.disabled = false;
            btnMockPost.disabled = false;
        }
    }

    // Post to local mock tweet wall
    function handleMockPost() {
        const text = composerTextarea.value;
        if (text.length > 280 || text.trim() === '') return;

        const newTweet = {
            id: 'tweet_' + Date.now(),
            text: text,
            timestamp: new Date().toISOString(),
            likes: Math.floor(Math.random() * 25) + 5,
            retweets: Math.floor(Math.random() * 8) + 1
        };

        tweetsLog.unshift(newTweet);
        localStorage.setItem('bq_tweets_log', JSON.stringify(tweetsLog));
        
        renderTweetLog();
        
        // Flash visual confirmation on composer
        const composerPanel = document.querySelector('.composer-panel');
        composerPanel.style.transform = 'scale(0.98)';
        setTimeout(() => {
            composerPanel.style.transform = 'none';
        }, 150);
        
        // Success note: don't clear composer completely so they can still tweet it for real, 
        // but let's show a quick highlight
    }

    // Opens X Web Intent in a new tab
    function handleRealTweet() {
        const text = composerTextarea.value;
        if (text.length > 280 || text.trim() === '') return;

        const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        
        // Also mock post it since they tweeted it
        handleMockPost();
    }

    // Render local Tweet Log
    function renderTweetLog() {
        if (tweetsLog.length === 0) {
            tweetLogList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 1.5rem 0;">No tweets posted yet.</div>';
            return;
        }

        tweetLogList.innerHTML = '';
        
        tweetsLog.forEach(tweet => {
            const card = document.createElement('div');
            card.className = 'tweet-card';
            
            const userSec = document.createElement('div');
            userSec.className = 'tweet-user';
            
            const avatar = document.createElement('div');
            avatar.className = 'tweet-avatar';
            avatar.textContent = 'BQ';
            
            const userInfo = document.createElement('div');
            userInfo.className = 'tweet-user-info';
            
            const name = document.createElement('div');
            name.className = 'tweet-name';
            name.textContent = 'BigQuery Monitor';
            
            const handle = document.createElement('div');
            handle.className = 'tweet-handle';
            handle.textContent = '@bq_monitor';
            
            userInfo.appendChild(name);
            userInfo.appendChild(handle);
            userSec.appendChild(avatar);
            userSec.appendChild(userInfo);
            
            const body = document.createElement('div');
            body.className = 'tweet-body';
            body.textContent = tweet.text;
            
            const meta = document.createElement('div');
            meta.className = 'tweet-meta';
            
            const time = document.createElement('span');
            const dateObj = new Date(tweet.timestamp);
            time.textContent = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
            
            const stats = document.createElement('div');
            stats.className = 'tweet-stats';
            
            const rtStat = document.createElement('div');
            rtStat.className = 'tweet-stat retweets';
            rtStat.innerHTML = `<i class="fas fa-retweet"></i> <span>${tweet.retweets}</span>`;
            rtStat.addEventListener('click', () => {
                tweet.retweets++;
                rtStat.querySelector('span').textContent = tweet.retweets;
                localStorage.setItem('bq_tweets_log', JSON.stringify(tweetsLog));
            });
            
            const likeStat = document.createElement('div');
            likeStat.className = 'tweet-stat likes';
            likeStat.innerHTML = `<i class="far fa-heart"></i> <span>${tweet.likes}</span>`;
            likeStat.addEventListener('click', () => {
                tweet.likes++;
                likeStat.querySelector('span').textContent = tweet.likes;
                // Toggle heart icon color/solid
                const icon = likeStat.querySelector('i');
                if (icon.classList.contains('far')) {
                    icon.classList.replace('far', 'fas');
                    icon.style.color = 'var(--color-red)';
                    likeStat.querySelector('span').style.color = 'var(--color-red)';
                }
                localStorage.setItem('bq_tweets_log', JSON.stringify(tweetsLog));
            });
            
            stats.appendChild(rtStat);
            stats.appendChild(likeStat);
            
            meta.appendChild(time);
            meta.appendChild(stats);
            
            card.appendChild(userSec);
            card.appendChild(body);
            card.appendChild(meta);
            
            tweetLogList.appendChild(card);
        });
    }

    // Clear local Tweet Log
    function clearTweetLog() {
        if (confirm('Are you sure you want to clear your local tweet history?')) {
            tweetsLog = [];
            localStorage.removeItem('bq_tweets_log');
            renderTweetLog();
        }
    }

    // Handle search input
    function handleSearch() {
        filters.search = searchInput.value;
        renderUpdates();
    }

    // Toggle Sort Order
    function toggleSort() {
        filters.sortNewest = !filters.sortNewest;
        btnSort.innerHTML = filters.sortNewest 
            ? '<i class="fas fa-sort-amount-down"></i> Newest First' 
            : '<i class="fas fa-sort-amount-up"></i> Oldest First';
        renderUpdates();
    }

    // Show Error State
    function showError(message) {
        feedContainer.innerHTML = `
            <div class="error-container">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Unable to Load Release Notes</h3>
                <p style="color: var(--text-secondary); max-width: 450px; margin: 0.25rem 0 1rem 0;">${message}</p>
                <button class="btn-refresh" onclick="location.reload()"><i class="fas fa-sync-alt"></i> Try Again</button>
            </div>
        `;
    }

    // Show No Results State
    function showNoResults() {
        feedContainer.innerHTML = `
            <div class="no-results-container">
                <i class="fas fa-search"></i>
                <h3>No Release Notes Found</h3>
                <p style="color: var(--text-secondary); max-width: 400px; margin-top: 0.25rem;">
                    We couldn't find any updates matching your filters. Try adjusting your search query or choosing another category.
                </p>
            </div>
        `;
    }
});
