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
        
        this.init();
    }
    
    init() {
        this.loadUsageData();
    }
    
    async loadUsageData() {
        this.showLoading(true);
        this.hideError();
        
        try {
            // Step 1: Get User ID
            await this.fetchUserID();
            
            // Step 2: Get Billing Cycle Start Date
            await this.fetchBillingStartDate();
            
            // Step 3: Determine Query Start Date
            this.determineQueryStartDate();
            
            // Step 4: Fetch All Usage Events
            await this.fetchAllUsageEvents();
            
            // Process and render data
            this.renderDashboard();
            
        } catch (error) {
            this.showError(`Failed to load usage data: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }
    
    async fetchUserID() {
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
    }
    
    async fetchBillingStartDate() {
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
    }
    
    determineQueryStartDate() {
        const now = new Date();
        const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Use the earlier of billing start date or first day of current month
        this.queryStartDate = this.billingStartDate < firstDayOfCurrentMonth 
            ? this.billingStartDate 
            : firstDayOfCurrentMonth;
    }
    
    async fetchAllUsageEvents() {
        const now = new Date();
        const startTimestamp = this.queryStartDate.getTime();
        const endTimestamp = now.getTime();
        
        this.allUsageEvents = [];
        
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
            this.allUsageEvents.push(...firstData.usageEventsDisplay);
        }
        
        // Calculate total pages needed
        const totalEvents = firstData.totalUsageEventsCount || 0;
        const totalPages = Math.ceil(totalEvents / 300);
        
        // Update progress after first page
        this.progressFill.style.width = `${Math.min((1 / totalPages) * 100, 100)}%`;
        this.progressText.textContent = `Fetched page 1 of ${totalPages} (${this.allUsageEvents.length} events)`;
        
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
                    this.allUsageEvents.push(...data.usageEventsDisplay);
                }
                
                // Update progress after each page
                const progress = (page / totalPages) * 100;
                this.progressFill.style.width = `${Math.min(progress, 100)}%`;
                this.progressText.textContent = `Fetched page ${page} of ${totalPages} (${this.allUsageEvents.length} events)`;
                
                // Small delay to show progress
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Final progress update
        this.progressFill.style.width = '100%';
        this.progressText.textContent = `Completed! Fetched ${this.allUsageEvents.length} events from ${totalPages} pages`;
    }
    
    renderDashboard() {
        this.renderSummary();
        this.renderDetails();
        
        this.summary.style.display = 'block';
        this.details.style.display = 'block';
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
                const cost = event.usageBasedCosts === "-" ? 0 : (event.usageBasedCosts || 0);
                return sum + cost;
            }, 0);
            
            document.getElementById(`requests-${timeframe.id}`).textContent = requestsCosts.toFixed(2);
            document.getElementById(`total-${timeframe.id}`).textContent = totalCostsUSD.toFixed(2);
            document.getElementById(`usage-${timeframe.id}`).textContent = usageBasedCosts.toFixed(2);
        });
    }
    
    renderDetails() {
        // Debug: log first event structure to console
        if (this.allUsageEvents.length > 0) {
            console.log('First event structure:', this.allUsageEvents[0]);
        }
        
        const tableRows = this.allUsageEvents.map((event, index) => {
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
            const usageBasedCosts = event.usageBasedCosts === "-" ? "0.00" : (event.usageBasedCosts || 0).toFixed(2);
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
                    <td>${index + 1}</td>
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