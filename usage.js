class CursorUsageStats {
    constructor() {
        this.modeSelect = document.getElementById('modeSelect');
        this.yearSelect = document.getElementById('yearSelect');
        this.monthSelect = document.getElementById('monthSelect');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.summary = document.getElementById('summary');
        this.details = document.getElementById('details');
        this.dailyChartSection = document.getElementById('daily-chart-section');
        this.summaryBody = document.getElementById('summaryBody');
        this.detailsBody = document.getElementById('detailsBody');
        this.progress = document.getElementById('progress');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
        
        this.rawEvents = [];
        this.processedEvents = [];
        
        this.init();
    }
    
    init() {
        // Set current month as default
        const now = new Date();
        this.monthSelect.value = now.getMonth().toString();
        
        // Event listeners
        this.modeSelect.addEventListener('change', () => this.onModeChange());
        this.yearSelect.addEventListener('change', () => this.fetchData());
        this.monthSelect.addEventListener('change', () => this.fetchData());
        
        // Initial mode setup (without fetching data)
        this.updateModeDisplay();
        
        // Initial load
        this.fetchData();
    }
    
    onModeChange() {
        this.updateModeDisplay();
        this.fetchData();
    }
    
    updateModeDisplay() {
        const mode = this.modeSelect.value;
        if (mode === 'last30days') {
            this.yearSelect.style.display = 'none';
            this.monthSelect.style.display = 'none';
        } else {
            this.yearSelect.style.display = 'block';
            this.monthSelect.style.display = 'block';
        }
    }
    
    async fetchData() {
        this.showLoading(true);
        this.hideError();
        
        const mode = this.modeSelect.value;
        
        try {
            if (mode === 'last30days') {
                await this.fetchLast30DaysData();
            } else {
                await this.fetchMonthlyData();
            }
            
            this.processEvents();
            this.renderUI();
            
        } catch (err) {
            this.showError(`Failed to fetch data: ${err.message}`);
        } finally {
            this.showLoading(false);
            this.progress.style.display = 'none';
        }
    }
    
    async fetchMonthlyData() {
        const year = parseInt(this.yearSelect.value);
        const month = parseInt(this.monthSelect.value);
        
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
    }
    
    async fetchLast30DaysData() {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const startTimestamp = thirtyDaysAgo.getTime();
        const endTimestamp = now.getTime();
        
        const allEvents = [];
        
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
            throw new Error(`Failed to fetch last 30 days data: ${firstResponse.status}`);
        }
        
        const firstData = await firstResponse.json();
        
        // Add events from first page
        if (firstData.usageEventsDisplay) {
            allEvents.push(...firstData.usageEventsDisplay);
        }
        
        // Calculate total pages needed
        const totalEvents = firstData.totalUsageEventsCount || 0;
        const totalPages = Math.ceil(totalEvents / 300);
        
        // Update progress after first page
        this.progressFill.style.width = `${Math.min((1 / totalPages) * 100, 100)}%`;
        this.progressText.textContent = `Fetched page 1 of ${totalPages} (${allEvents.length} events)`;
        
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
                    throw new Error(`Failed to fetch page ${page}: ${response.status}`);
                }
                
                const data = await response.json();
                if (data.usageEventsDisplay) {
                    allEvents.push(...data.usageEventsDisplay);
                }
                
                // Update progress after each page
                const progress = (page / totalPages) * 100;
                this.progressFill.style.width = `${Math.min(progress, 100)}%`;
                this.progressText.textContent = `Fetched page ${page} of ${totalPages} (${allEvents.length} events)`;
                
                // Small delay to avoid rate limiting and show progress
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Final progress update
        this.progressFill.style.width = '100%';
        this.progressText.textContent = `Completed! Fetched ${allEvents.length} events from ${totalPages} pages`;
        
        // Convert the new format to the old format for compatibility
        this.rawEvents = allEvents.map(event => {
            let eventType = 'other';
            if (event.kind) {
                const kind = event.kind.replace('USAGE_EVENT_KIND_', '').toLowerCase();
                // Map the kind to the expected format
                switch (kind) {
                    case 'composer':
                        eventType = 'composer';
                        break;
                    case 'chat':
                        eventType = 'chat';
                        break;
                    case 'tool_call_composer':
                        eventType = 'toolCallComposer';
                        break;
                    case 'cmd_k':
                        eventType = 'cmdK';
                        break;
                    case 'fast_apply':
                        eventType = 'fastApply';
                        break;
                    default:
                        eventType = 'other';
                }
            }
            
            return {
                timestamp: event.timestamp,
                priceCents: event.requestsCosts ? Math.round(event.requestsCosts * 4) : 0,
                subscriptionProductId: event.subscriptionProductId || '',
                isSlow: event.isSlow || false,
                status: event.status || '',
                details: {
                    [eventType]: {
                        modelIntent: event.model || '',
                        model: event.model || '',
                        maxMode: event.maxMode || false,
                        isTokenBasedCall: event.isTokenBasedCall || false,
                        overrideNumRequestsCounted: event.requestsCosts || 0
                    }
                }
            };
        });
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
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const last4Hours = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last48Hours = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        
        // Determine the "All Data" period based on mode
        const mode = this.modeSelect.value;
        let allDataStart;
        
        if (mode === 'last30days') {
            // For last30days mode, "All Data" means all data in the fetched 30 days
            allDataStart = last30Days;
        } else {
            // For monthly mode, "All Data" means all data in the selected month
            allDataStart = thisMonth;
        }
        
        const periods = [
            { name: 'Today', start: today },
            { name: 'All Data', start: allDataStart },
            { name: 'Last 30 Days', start: last30Days },
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
        this.renderDailyChart();
        
        this.summary.style.display = 'block';
        this.details.style.display = 'block';
        this.dailyChartSection.style.display = 'block';
    }
    
    renderSummary() {
        const summaryData = this.calculateSummary();
        
        // Update summary title based on mode
        const summaryTitle = document.querySelector('#summary h2');
        const mode = this.modeSelect.value;
        
        if (mode === 'last30days') {
            summaryTitle.textContent = 'Summary (Last 30 Days)';
        } else {
            const year = this.yearSelect.value;
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
            const monthName = monthNames[parseInt(this.monthSelect.value)];
            summaryTitle.textContent = `Summary (${monthName} ${year})`;
        }
        
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
    
    renderDailyChart() {
        // Update chart title based on mode
        const chartTitle = document.querySelector('#daily-chart-section h2');
        const mode = this.modeSelect.value;
        if (mode === 'last30days') {
            chartTitle.textContent = 'Daily Usage (Last 30 Days)';
        } else {
            const year = this.yearSelect.value;
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
            const monthName = monthNames[parseInt(this.monthSelect.value)];
            chartTitle.textContent = `Daily Usage (${monthName} ${year})`;
        }
        
        var now = new Date();
        var dailyData = {};
        var startTime, endTime;
        
        if (mode === 'last30days') {
            // Last 30 days mode
            var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            var days = 30;
            startTime = today.getTime() - (days - 1) * 24 * 60 * 60 * 1000;
            endTime = now.getTime();
            
            // Initialize daily data for the last 30 days
            for (var i = days - 1; i >= 0; i--) {
                var d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
                var day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                dailyData[day] = 0;
            }
        } else {
            // Monthly mode
            const year = parseInt(this.yearSelect.value);
            const month = parseInt(this.monthSelect.value);
            
            var firstDay = new Date(year, month, 1);
            var lastDay = new Date(year, month + 1, 0);
            
            startTime = firstDay.getTime();
            endTime = lastDay.getTime() + 24 * 60 * 60 * 1000 - 1; // End of last day
            
            // Initialize daily data for the month
            for (var day = 1; day <= lastDay.getDate(); day++) {
                var d = new Date(year, month, day);
                var dayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                dailyData[dayStr] = 0;
            }
        }
        
        // Filter events within the specified time range
        const chartEvents = this.processedEvents.filter(event => {
            const timestampMs = parseInt(event.originalEvent.timestamp);
            return timestampMs >= startTime && timestampMs <= endTime;
        });
        
        // Aggregate request counts by day
        chartEvents.forEach(function(event) {
            var timestampMs = parseInt(event.originalEvent.timestamp);
            var eventDate = new Date(timestampMs);
            if (!isNaN(eventDate.getTime())) {
                var dayStr = eventDate.getFullYear() + '-' + String(eventDate.getMonth() + 1).padStart(2, '0') + '-' + String(eventDate.getDate()).padStart(2, '0');
                if (dailyData.hasOwnProperty(dayStr)) {
                    dailyData[dayStr] += (event.requestCount || 0);
                }
            }
        });
        
        var labels = Object.keys(dailyData);
        var data = labels.map(function(label) { return dailyData[label]; });
        
        var ctx = document.getElementById('dailyUsageChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Request Count',
                    data: data,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    }
                }
            }
        });
    }
    
    showLoading(show) {
        this.loading.style.display = show ? 'block' : 'none';
        if (show) {
            this.summary.style.display = 'none';
            this.details.style.display = 'none';
            this.dailyChartSection.style.display = 'none';
            // Reset progress
            this.progress.style.display = 'none';
            this.progressFill.style.width = '0%';
            this.progressText.textContent = 'Fetching events...';
        }
    }
    
    showError(message) {
        this.error.textContent = message;
        this.error.style.display = 'block';
        this.summary.style.display = 'none';
        this.details.style.display = 'none';
        this.dailyChartSection.style.display = 'none';
        this.progress.style.display = 'none';
    }
    
    hideError() {
        this.error.style.display = 'none';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CursorUsageStats();
}); 