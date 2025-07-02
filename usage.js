class CursorUsageStats {
    constructor() {
        this.yearSelect = document.getElementById('yearSelect');
        this.monthSelect = document.getElementById('monthSelect');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.summary = document.getElementById('summary');
        this.details = document.getElementById('details');
        this.summaryBody = document.getElementById('summaryBody');
        this.detailsBody = document.getElementById('detailsBody');
        
        this.rawEvents = [];
        this.processedEvents = [];
        
        this.init();
    }
    
    init() {
        // Set current month as default
        const now = new Date();
        this.monthSelect.value = now.getMonth().toString();
        
        // Event listeners
        this.yearSelect.addEventListener('change', () => this.fetchData());
        this.monthSelect.addEventListener('change', () => this.fetchData());
        
        // Initial load
        this.fetchData();
    }
    
    async fetchData() {
        const year = parseInt(this.yearSelect.value);
        const month = parseInt(this.monthSelect.value);
        
        this.showLoading(true);
        this.hideError();
        
        try {
            // Try cursor.com first (covers cn and other subdomains), then fallback to www.cursor.com
            const endpoints = [
                'https://cursor.com/api/dashboard/get-monthly-invoice',
                'https://www.cursor.com/api/dashboard/get-monthly-invoice'
            ];
            
            let response;
            let lastError;
            
            for (const endpoint of endpoints) {
                try {
                    response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            month: month,
                            year: year,
                            includeUsageEvents: true
                        })
                    });
                    
                    if (response.ok) {
                        break; // Success, exit the loop
                    }
                } catch (err) {
                    lastError = err;
                    continue; // Try next endpoint
                }
            }
            
            if (!response || !response.ok) {
                throw new Error(`HTTP error! status: ${response?.status || 'Network error'}`);
            }
            
            const data = await response.json();
            
            if (!data.usageEvents || !Array.isArray(data.usageEvents)) {
                throw new Error('No usage events found in response');
            }
            
            this.rawEvents = data.usageEvents;
            this.processEvents();
            this.renderUI();
            
        } catch (err) {
            this.showError(`Failed to fetch data: ${err.message}`);
        } finally {
            this.showLoading(false);
        }
    }
    
    processEvents() {
        // Parse and transform events
        const parsed = this.rawEvents.map(event => this.parseEvent(event));
        
        // Handle fastApply aggregation
        const aggregated = this.aggregateToolCalls(parsed);
        
        // Filter out fastApply events
        this.processedEvents = aggregated.filter(event => event.type !== 'fastApply');
    }
    
    // Safe JSON stringify to avoid CSP violations
    safeStringify(obj) {
        try {
            // Create a sanitized version without functions or dangerous content
            const sanitized = JSON.parse(JSON.stringify(obj, (key, value) => {
                if (typeof value === 'function') return '[Function]';
                if (typeof value === 'symbol') return '[Symbol]';
                if (typeof value === 'undefined') return '[Undefined]';
                return value;
            }));
            return JSON.stringify(sanitized);
        } catch (error) {
            console.error('Safe stringify failed:', error);
            return '[Object]';
        }
    }
    
    parseEvent(event) {
        const details = event.details || {};
        
        // Format time - using timestamp field
        const eventTime = new Date(parseInt(event.timestamp)).toLocaleString('sv-SE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace('T', ' ');
        
        // Determine type from details object keys
        const validTypes = ['toolCallComposer', 'composer', 'fastApply', 'chat', 'cmdK'];
        let type = 'other';
        let typeOther = '';
        let nestedDetails = {};
        
        // Find the type from the details object keys
        for (const validType of validTypes) {
            if (details[validType]) {
                type = validType;
                nestedDetails = details[validType];
                break;
            }
        }
        
        if (type === 'other') {
            typeOther = this.safeStringify(details);
        }
        
        // Calculate request count - prioritize priceCents calculation per guide
        let requestCount = 0;
        if (event.priceCents !== undefined) {
            requestCount = Math.round((event.priceCents / 4) * 10) / 10;
        } else if (nestedDetails.overrideNumRequestsCounted !== undefined) {
            requestCount = nestedDetails.overrideNumRequestsCounted;
        } else if (details.overrideNumRequestsCounted !== undefined) {
            requestCount = details.overrideNumRequestsCounted;
        }
        
        return {
            event_time: eventTime,
            type: type,
            model: nestedDetails.modelIntent || nestedDetails.model || '',
            type_other: typeOther,
            maxMode: nestedDetails.maxMode || false,
            isTokenBasedCall: nestedDetails.isTokenBasedCall || false,
            requestCount: requestCount,
            subscriptionProductId: event.subscriptionProductId || event.usagePriceId || '',
            isSlow: event.isSlow || false,
            status: event.status || '',
            toolcall: 0, // Will be set during aggregation
            originalEvent: event
        };
    }
    
    aggregateToolCalls(events) {
        let toolCallCounter = 0;
        
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            
            if (event.type === 'fastApply') {
                toolCallCounter++;
            } else {
                event.toolcall = toolCallCounter;
                toolCallCounter = 0;
            }
        }
        
        return events;
    }
    
    calculateSummary() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const last4Hours = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last48Hours = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        
        const periods = [
            { name: 'Today', start: today },
            { name: 'This Month', start: thisMonth },
            { name: 'Last 4 Hours', start: last4Hours },
            { name: 'Last 24 Hours', start: last24Hours },
            { name: 'Last 48 Hours', start: last48Hours }
        ];
        
        return periods.map(period => {
            const filteredEvents = this.processedEvents.filter(event => {
                const eventDate = new Date(parseInt(event.originalEvent.timestamp));
                return eventDate >= period.start;
            });
            
            return {
                period: period.name,
                recordCount: filteredEvents.length,
                requestTotal: filteredEvents.reduce((sum, event) => sum + (event.requestCount || 0), 0)
            };
        });
    }
    
    renderUI() {
        this.renderSummary();
        this.renderDetails();
        
        this.summary.style.display = 'block';
        this.details.style.display = 'block';
    }
    
    renderSummary() {
        const summaryData = this.calculateSummary();
        
        // Create rows for Record Count and Request Total
        const recordCountRow = `
            <tr>
                <td><strong>Record Count</strong></td>
                ${summaryData.map(item => `<td>${item.recordCount}</td>`).join('')}
            </tr>
        `;
        
        const requestTotalRow = `
            <tr>
                <td><strong>Request Total</strong></td>
                ${summaryData.map(item => `<td>${item.requestTotal.toFixed(1)}</td>`).join('')}
            </tr>
        `;
        
        this.summaryBody.innerHTML = recordCountRow + requestTotalRow;
    }
    
    renderDetails() {
        this.detailsBody.innerHTML = this.processedEvents.map((event, index) => {
            let rowClass = '';
            if (event.maxMode) rowClass += ' max-mode';
            if (event.status === 'errored') rowClass += ' error-status';
            
            const slowText = event.isSlow ? `<span class="slow-request">Yes</span>` : 'No';
            const maxText = event.maxMode ? 'Yes' : 'No';
            const tokenText = event.isTokenBasedCall ? 'Yes' : 'No';
            const toolcallText = event.toolcall > 0 ? event.toolcall : '';
            
            return `
                <tr class="${rowClass}">
                    <td>${index + 1}</td>
                    <td>${event.event_time}</td>
                    <td>${event.type}</td>
                    <td>${event.model}</td>
                    <td>${event.requestCount.toFixed(1)}</td>
                    <td>${event.subscriptionProductId}</td>
                    <td>${slowText}</td>
                    <td>${event.status}</td>
                    <td>${event.type_other}</td>
                    <td>${toolcallText}</td>
                    <td>${maxText}</td>
                    <td>${tokenText}</td>
                </tr>
            `;
        }).join('');
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CursorUsageStats();
}); 