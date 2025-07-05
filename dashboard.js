// IndexedDB wrapper for caching usage events
class UsageCache {
    constructor() {
        this.dbName = 'CursorUsageCache';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(new Error('Failed to open IndexedDB'));
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create events store with timestamp as key
                if (!db.objectStoreNames.contains('events')) {
                    const eventsStore = db.createObjectStore('events', { keyPath: 'timestamp' });
                    eventsStore.createIndex('timestamp', 'timestamp', { unique: true });
                }
                
                // Create metadata store
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    }

    async getMetadata(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readonly');
            const store = transaction.objectStore('metadata');
            const request = store.get(key);
            
            request.onerror = () => reject(new Error(`Failed to get metadata: ${key}`));
            request.onsuccess = () => {
                const result = request.result;
                console.log(`Getting metadata for ${key}:`, result);
                resolve(result ? result.value : null);
            };
        });
    }

    async setMetadata(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readwrite');
            const store = transaction.objectStore('metadata');
            const request = store.put({ key, value });
            
            request.onerror = () => reject(new Error(`Failed to set metadata: ${key}`));
            request.onsuccess = () => {
                console.log(`Setting metadata for ${key}:`, value);
                resolve();
            };
        });
    }

    async getEvents(startTimestamp, endTimestamp) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');

            // Use keyPath directly, not index
            const range = IDBKeyRange.bound(
                String(startTimestamp),
                String(endTimestamp)
            );

            const request = store.getAll(range);

            request.onerror = () => reject(new Error('Failed to get events from cache'));
            request.onsuccess = () => {
                const result = request.result || [];
                console.log(`✅ Retrieved ${result.length} events from cache for range ${startTimestamp} to ${endTimestamp}`);
                resolve(result);
            };
        });
    }

    async saveEvents(events) {
        if (!events || events.length === 0) return;
        
        console.log(`Saving ${events.length} events to cache`);
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            let completed = 0;
            let hasError = false;
            
            events.forEach(event => {
                const request = store.put(event);
                request.onerror = () => {
                    if (!hasError) {
                        hasError = true;
                        reject(new Error('Failed to save events to cache'));
                    }
                };
                request.onsuccess = () => {
                    completed++;
                    if (completed === events.length && !hasError) {
                        console.log(`Successfully saved ${events.length} events to cache`);
                        resolve();
                    }
                };
            });
        });
    }

    async deleteEvents(startTimestamp, endTimestamp) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            const index = store.index('timestamp');
            const request = index.openCursor(IDBKeyRange.bound(startTimestamp, endTimestamp));
            
            let completed = 0;
            let hasError = false;
            
            request.onerror = () => {
                if (!hasError) {
                    hasError = true;
                    reject(new Error('Failed to delete events from cache'));
                }
            };
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const deleteRequest = cursor.delete();
                    deleteRequest.onerror = () => {
                        if (!hasError) {
                            hasError = true;
                            reject(new Error('Failed to delete event from cache'));
                        }
                    };
                    deleteRequest.onsuccess = () => {
                        completed++;
                        cursor.continue();
                    };
                } else {
                    if (!hasError) {
                        resolve(completed);
                    }
                }
            };
        });
    }

    async clearAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events', 'metadata'], 'readwrite');
            const eventsStore = transaction.objectStore('events');
            const metadataStore = transaction.objectStore('metadata');
            
            const eventsRequest = eventsStore.clear();
            const metadataRequest = metadataStore.clear();
            
            let completed = 0;
            let hasError = false;
            
            const checkComplete = () => {
                completed++;
                if (completed === 2 && !hasError) {
                    resolve();
                }
            };
            
            eventsRequest.onerror = () => {
                if (!hasError) {
                    hasError = true;
                    reject(new Error('Failed to clear events'));
                }
            };
            eventsRequest.onsuccess = checkComplete;
            
            metadataRequest.onerror = () => {
                if (!hasError) {
                    hasError = true;
                    reject(new Error('Failed to clear metadata'));
                }
            };
            metadataRequest.onsuccess = checkComplete;
        });
    }

    async clearCurrentMonth() {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        
        // Delete events from current month start onwards
        await this.deleteEvents(currentMonthStart, Date.now());
        
        // Update cache_end to current month start
        await this.setMetadata('cache_end', currentMonthStart);
    }
}

class CursorUsageDashboard {
    constructor() {
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.summary = document.getElementById('summary');
        this.details = document.getElementById('details');
        this.summaryBody = document.getElementById('summaryBody');
        this.detailsBody = document.getElementById('detailsBody');
        this.progress = document.getElementById('progress');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
        
        this.allUsageEvents = [];
        this.userSub = null;
        this.billingStartDate = null;
        this.queryStartDate = null;
        
        // Initialize cache
        this.cache = new UsageCache();
        
        this.detailsCurrentPage = 1;
        this.detailsPageSize = 10;
        
        this.init();
    }
    
    init() {
        this.loadUsageData();
    }
    
    async loadUsageData() {
        this.showLoading(true);
        this.hideError();
        
        try {
            // Initialize cache
            await this.cache.init();
            
            // Step 1: Get User ID
            await this.fetchUserID();
            
            // Step 2: Get Billing Cycle Start Date
            await this.fetchBillingStartDate();
            
            // Step 3: Determine Query Start Date
            this.determineQueryStartDate();
            
            // Step 4: Data Synchronization with Caching
            await this.synchronizeData();
            
            // Step 5: Load final data for display
            await this.loadFinalData();
            
            // Step 6: Process and render data
            this.renderDashboard();
            
        } catch (error) {
            this.showError(`Failed to load usage data: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }
    
    async fetchUserID() {
        // Try to get from cache first
        const cachedUserSub = await this.cache.getMetadata('user_sub');
        if (cachedUserSub) {
            this.userSub = cachedUserSub;
            return;
        }
        // Otherwise, fetch from API
        const response = await fetch('https://cursor.com/api/auth/me', {
            method: 'GET',
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch user ID: ${response.status}`);
        }
        const data = await response.json();
        this.userSub = data.sub;
        if (!this.userSub) {
            throw new Error('User sub not found in response');
        }
        // Cache user sub in metadata
        await this.cache.setMetadata('user_sub', this.userSub);
    }
    
    async fetchBillingStartDate() {
        // Try to get from cache first
        const cachedBillingStart = await this.cache.getMetadata('billing_start_date');
        if (cachedBillingStart) {
            const billingDate = new Date(parseInt(cachedBillingStart, 10));
            const now = new Date();
            const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
            if (billingDate >= oneMonthAgo) {
                this.billingStartDate = billingDate;
                return;
            }
        }
        // Otherwise, fetch from API
        const response = await fetch(`https://cursor.com/api/usage?user=${this.userSub}`, {
            method: 'GET',
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch billing start date: ${response.status}`);
        }
        const data = await response.json();
        this.billingStartDate = new Date(data.startOfMonth);
        if (!this.billingStartDate) {
            throw new Error('Billing start date not found in response');
        }
        // Cache billing start date in metadata if within one month from now
        const now = new Date();
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        if (this.billingStartDate >= oneMonthAgo) {
            await this.cache.setMetadata('billing_start_date', this.billingStartDate.getTime());
        }
    }
    
    determineQueryStartDate() {
        const now = new Date();
        const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Use the earlier of billing start date or first day of current month
        this.queryStartDate = this.billingStartDate < firstDayOfCurrentMonth 
            ? this.billingStartDate 
            : firstDayOfCurrentMonth;
    }
    
    async synchronizeData() {
        const now = new Date();
        const requiredStart = this.queryStartDate.getTime();
        const requiredEnd = now.getTime();
        
        // Get cache boundaries
        const cacheStart = await this.cache.getMetadata('cache_start');
        const cacheEnd = await this.cache.getMetadata('cache_end');
        
        console.log('Cache boundaries:', { cacheStart, cacheEnd, requiredStart, requiredEnd });
        
        this.progress.style.display = 'block';
        this.progressText.textContent = 'Synchronizing data...';
        
        // Step 2a: Fill Historical Gap
        if (!cacheStart || requiredStart < cacheStart) {
            console.log('Fetching historical gap:', { requiredStart, cacheStart, end: cacheStart || requiredEnd });
            this.progressText.textContent = 'Fetching historical data...';
            const historicalEvents = await this.fetchAllUsageEvents(requiredStart, cacheStart || requiredEnd);
            console.log('Historical events fetched:', historicalEvents.length);
            if (historicalEvents.length > 0) {
                await this.cache.saveEvents(historicalEvents);
                await this.cache.setMetadata('cache_start', requiredStart);
            }
        }
        
        // Step 2b: Fill Recent Gap
        const recentStart = cacheEnd ? (cacheEnd - 30 * 60 * 1000) : requiredStart; // 30 minutes overlap
        console.log('Fetching recent gap:', { recentStart, requiredEnd, cacheEnd });
        this.progressText.textContent = 'Fetching recent data...';
        const recentEvents = await this.fetchAllUsageEvents(recentStart, requiredEnd);
        console.log('Recent events fetched:', recentEvents.length);
        
        if (recentEvents.length > 0) {
            // Delete overlapping events and save new ones
            if (cacheEnd) {
                await this.cache.deleteEvents(recentStart, cacheEnd);
            }
            await this.cache.saveEvents(recentEvents);
            await this.cache.setMetadata('cache_end', requiredEnd);
        }
        
        // If no cache existed at all, set the boundaries
        if (!cacheStart && !cacheEnd) {
            await this.cache.setMetadata('cache_start', requiredStart);
            await this.cache.setMetadata('cache_end', requiredEnd);
        }
        
        this.progressText.textContent = 'Data synchronization complete';
    }
    
    async loadFinalData() {
        const now = new Date();
        const requiredStart = this.queryStartDate.getTime();
        const requiredEnd = now.getTime();
        
        console.log('Loading final data from cache:', { requiredStart, requiredEnd });
        
        this.progressText.textContent = 'Loading cached data...';
        
        // Load final data from cache
        this.allUsageEvents = await this.cache.getEvents(requiredStart, requiredEnd);
        console.log('Events loaded from cache:', this.allUsageEvents.length);
        
        // Sort by timestamp DESCENDING (latest first)
        this.allUsageEvents.sort((a, b) => {
            const timestampA = typeof a.timestamp === 'string' ? parseInt(a.timestamp) : a.timestamp;
            const timestampB = typeof b.timestamp === 'string' ? parseInt(b.timestamp) : b.timestamp;
            return timestampB - timestampA;
        });
        
        this.progressText.textContent = `Loaded ${this.allUsageEvents.length} events from cache`;
    }
    
    async fetchAllUsageEvents(startTimestamp, endTimestamp) {
        const events = [];
        
        // Show progress indicator
        this.progress.style.display = 'block';
        this.progressText.textContent = 'Fetching events...';
        
        // First call to get total count
        const firstResponse = await fetch('https://cursor.com/api/dashboard/get-filtered-usage-events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                teamId: 0,
                startDate: startTimestamp.toString(),
                endDate: endTimestamp.toString(),
                page: 1,
                pageSize: 300
            })
        });
        
        if (!firstResponse.ok) {
            throw new Error(`Failed to fetch usage events: ${firstResponse.status}`);
        }
        
        const firstData = await firstResponse.json();
        
        // Add events from first page
        if (firstData.usageEventsDisplay) {
            events.push(...firstData.usageEventsDisplay);
        }
        
        // Calculate total pages needed
        const totalEvents = firstData.totalUsageEventsCount || 0;
        const totalPages = Math.ceil(totalEvents / 300);
        
        // Update progress after first page
        this.progressFill.style.width = `${Math.min((1 / totalPages) * 100, 100)}%`;
        this.progressText.textContent = `Fetched page 1 of ${totalPages} (${events.length} events)`;
        
        // Fetch remaining pages if needed
        if (totalPages > 1) {
            for (let page = 2; page <= totalPages; page++) {
                const response = await fetch('https://cursor.com/api/dashboard/get-filtered-usage-events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        teamId: 0,
                        startDate: startTimestamp.toString(),
                        endDate: endTimestamp.toString(),
                        page: page,
                        pageSize: 300
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch usage events page ${page}: ${response.status}`);
                }
                
                const data = await response.json();
                if (data.usageEventsDisplay) {
                    events.push(...data.usageEventsDisplay);
                }
                
                // Update progress after each page
                const progress = (page / totalPages) * 100;
                this.progressFill.style.width = `${Math.min(progress, 100)}%`;
                this.progressText.textContent = `Fetched page ${page} of ${totalPages} (${events.length} events)`;
                
                // Small delay to show progress
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Final progress update
        this.progressFill.style.width = '100%';
        this.progressText.textContent = `Completed! Fetched ${events.length} events from ${totalPages} pages`;
        
        return events;
    }
    

    
    renderDashboard() {
        this.renderSummary();
        this.renderDetails();
        
        this.summary.style.display = 'block';
        this.details.style.display = 'block';
        this.setupCacheManagement();
        this.setupDetailsPaging();
    }
    
    setupCacheManagement() {
        const cacheSection = document.getElementById('cache-management');
        const clearCurrentMonthBtn = document.getElementById('clearCurrentMonth');
        const clearAllCacheBtn = document.getElementById('clearAllCache');
        
        cacheSection.style.display = 'block';
        
        clearCurrentMonthBtn.addEventListener('click', () => this.clearCurrentMonthCache());
        clearAllCacheBtn.addEventListener('click', () => this.clearAllCache());
    }
    
    async clearCurrentMonthCache() {
        if (!confirm('Are you sure you want to clear the current month\'s cache? This will force a re-fetch of all data from the current month onwards.')) {
            return;
        }
        
        try {
            await this.cache.clearCurrentMonth();
            alert('Current month cache cleared. Reloading...');
            location.reload();
        } catch (error) {
            this.showError(`Failed to clear current month cache: ${error.message}`);
        }
    }
    
    async clearAllCache() {
        if (!confirm('Are you sure you want to clear all cache? This will force a complete re-fetch of all data.')) {
            return;
        }
        
        try {
            await this.cache.clearAll();
            alert('All cache cleared. Reloading...');
            location.reload();
        } catch (error) {
            this.showError(`Failed to clear all cache: ${error.message}`);
        }
    }
    
    renderSummary() {
        const now = new Date();
        const timeframes = [
            { id: '4h', name: 'Last 4 Hours', start: new Date(now.getTime() - 4 * 60 * 60 * 1000) },
            { id: '24h', name: 'Last 24 Hours', start: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            { id: '48h', name: 'Last 48 Hours', start: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
            { id: '7d', name: 'Last 7 Days', start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
            { id: 'billing', name: 'Current Month (Billing)', start: this.billingStartDate },
            { id: 'calendar', name: 'Current Month (Calendar)', start: new Date(now.getFullYear(), now.getMonth(), 1) }
        ];
        
        // Update billing header text with date
        const billingDateText = this.billingStartDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
        document.getElementById('billing-header').textContent = `Billing (Since ${billingDateText})`;
        
        // Update calendar header text with current month's first date
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const calendarDateText = firstOfMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        document.getElementById('calendar-header').textContent = `Since ${calendarDateText}`;
        
        timeframes.forEach(timeframe => {
            const filteredEvents = this.allUsageEvents.filter(event => {
                let timestampValue = event.timestamp;
                
                // Check for alternative timestamp property names if timestamp is not available
                if (!timestampValue) {
                    const timeProps = ['createdAt', 'created_at', 'time', 'eventTime', 'date'];
                    for (const prop of timeProps) {
                        if (event[prop]) {
                            timestampValue = event[prop];
                            break;
                        }
                    }
                }
                
                if (!timestampValue) return false;
                const timestampMs = typeof timestampValue === 'string' ? parseInt(timestampValue) : timestampValue;
                const eventDate = new Date(timestampMs);
                return !isNaN(eventDate.getTime()) && eventDate >= timeframe.start;
            });
            
            const requestsCosts = filteredEvents.reduce((sum, event) => sum + (event.requestsCosts || 0), 0);
            const totalCents = filteredEvents.reduce((sum, event) => sum + (event.tokenUsage?.totalCents || 0), 0);
            const totalCostsUSD = totalCents / 100;
            const usageBasedCosts = filteredEvents.reduce((sum, event) => {
                const cost = event.usageBasedCosts === "-" ? 0 : parseFloat(event.usageBasedCosts || 0);
                return sum + (isNaN(cost) ? 0 : cost);
            }, 0);
            
            document.getElementById(`requests-${timeframe.id}`).textContent = requestsCosts.toFixed(2);
            document.getElementById(`total-${timeframe.id}`).textContent = totalCostsUSD.toFixed(2);
            document.getElementById(`usage-${timeframe.id}`).textContent = usageBasedCosts.toFixed(2);
        });
    }
    
    renderDetails() {
        const totalEvents = this.allUsageEvents.length;
        const pageSize = this.detailsPageSize;
        const totalPages = Math.max(1, Math.ceil(totalEvents / pageSize));
        const currentPage = Math.min(this.detailsCurrentPage, totalPages);
        this.detailsCurrentPage = currentPage;
        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = Math.min(startIdx + pageSize, totalEvents);
        const pageEvents = this.allUsageEvents.slice(startIdx, endIdx);

        // Render table rows for current page
        const tableRows = pageEvents.map((event, index) => {
            // Handle timestamp - it's in milliseconds, convert to readable format
            let timestamp = 'Invalid Date';
            if (event.timestamp) {
                const timestampMs = typeof event.timestamp === 'string' ? parseInt(event.timestamp) : event.timestamp;
                const date = new Date(timestampMs);
                if (!isNaN(date.getTime())) {
                    timestamp = date.toLocaleString('sv-SE').replace('T', ' ');
                }
            } else {
                // Check for alternative timestamp property names
                const timeProps = ['createdAt', 'created_at', 'time', 'eventTime', 'date'];
                for (const prop of timeProps) {
                    if (event[prop]) {
                        console.log(`Found timestamp in property: ${prop}`, event[prop]);
                        const timestampMs = typeof event[prop] === 'string' ? parseInt(event[prop]) : event[prop];
                        const date = new Date(timestampMs);
                        if (!isNaN(date.getTime())) {
                            timestamp = date.toLocaleString('sv-SE').replace('T', ' ');
                            break;
                        }
                    }
                }
            }
            
            const model = event.model || '';
            const kind = (event.kind || '').replace(/^USAGE_EVENT_KIND_/, '');
            const requestsCosts = (event.requestsCosts || 0).toFixed(2);
            const totalCents = (event.tokenUsage?.totalCents || 0).toFixed(2);
            const usageValue = event.usageBasedCosts === "-" ? 0 : parseFloat(event.usageBasedCosts || 0);
            const usageBasedCosts = (isNaN(usageValue) ? 0 : usageValue).toFixed(2);
            const isTokenBasedCall = event.isTokenBasedCall ? 'Yes' : 'No';
            const maxMode = event.maxMode ? 'Yes' : 'No';
            const maxModeClass = event.maxMode ? 'max-mode-cell' : '';
            const inputTokens = event.tokenUsage?.inputTokens || 0;
            const outputTokens = event.tokenUsage?.outputTokens || 0;
            const cacheWriteTokens = event.tokenUsage?.cacheWriteTokens || 0;
            const cacheReadTokens = event.tokenUsage?.cacheReadTokens || 0;
            const owningUser = event.owningUser || '';
            
            return `
                <tr>
                    <td>${startIdx + index + 1}</td>
                    <td>${timestamp}</td>
                    <td>${model}</td>
                    <td>${kind}</td>
                    <td>${requestsCosts}</td>
                    <td>${totalCents}</td>
                    <td>${usageBasedCosts}</td>
                    <td>${isTokenBasedCall}</td>
                    <td class="${maxModeClass}">${maxMode}</td>
                    <td>${inputTokens}</td>
                    <td>${outputTokens}</td>
                    <td>${cacheWriteTokens}</td>
                    <td>${cacheReadTokens}</td>
                    <td>${owningUser}</td>
                </tr>
            `;
        }).join('');
        
        this.detailsBody.innerHTML = tableRows;
        // Render paging controls
        this.renderDetailsPaging(totalPages, currentPage);
    }
    
    renderDetailsPaging(totalPages, currentPage) {
        const renderControls = (containerId) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            let html = '';
            if (totalPages > 1) {
                html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="1">&#171; First</button>`;
                html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">&#8249; Prev</button>`;
                // Show up to 5 page numbers
                let start = Math.max(1, currentPage - 2);
                let end = Math.min(totalPages, currentPage + 2);
                if (currentPage <= 3) end = Math.min(5, totalPages);
                if (currentPage >= totalPages - 2) start = Math.max(1, totalPages - 4);
                for (let i = start; i <= end; i++) {
                    html += `<button class="${i === currentPage ? 'current-page' : ''}" data-page="${i}">${i}</button>`;
                }
                html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next &#8250;</button>`;
                html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${totalPages}">Last &#187;</button>`;
            } else {
                html = '';
            }
            container.innerHTML = html;
            // Add event listeners
            Array.from(container.querySelectorAll('button[data-page]')).forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const page = parseInt(btn.getAttribute('data-page'), 10);
                    if (!isNaN(page) && page !== this.detailsCurrentPage) {
                        this.detailsCurrentPage = page;
                        this.renderDetails();
                    }
                });
            });
        };
        renderControls('detailsPageTop');
        renderControls('detailsPageBottom');
    }
    
    setupDetailsPaging() {
        const pageSizeSelect = document.getElementById('detailsPageSize');
        pageSizeSelect.value = this.detailsPageSize;
        pageSizeSelect.addEventListener('change', (e) => {
            this.detailsPageSize = parseInt(e.target.value, 10);
            this.detailsCurrentPage = 1;
            this.renderDetails();
        });
    }
    
    showLoading(show) {
        this.loading.style.display = show ? 'block' : 'none';
        if (show) {
            this.summary.style.display = 'none';
            this.details.style.display = 'none';
        }
    }
    
    showError(message) {
        this.error.textContent = message;
        this.error.style.display = 'block';
        this.summary.style.display = 'none';
        this.details.style.display = 'none';
    }
    
    hideError() {
        this.error.style.display = 'none';
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CursorUsageDashboard();
}); 
