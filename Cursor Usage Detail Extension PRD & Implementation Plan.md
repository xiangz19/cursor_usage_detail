# **PRD & Implementation Plan: Cursor Usage Stats Extension**

Version: 2.0  
Date: July 5, 2025  
Author: Gemini

## **1\. Overview**

The purpose of this Chrome extension is to provide users of [Cursor](https://cursor.com/) with a more detailed and granular view of their AI usage and associated costs. The official dashboard provides a high-level summary; this extension will supplement it by offering raw event data and more flexible time-based aggregations, giving users deeper insight into their consumption patterns. All data processing will occur locally within the user's browser, with no external servers involved.

## **2\. Feature Breakdown & Implementation Plan**

### **2.1. Extension Entry Points**

The user can access the custom dashboard in two ways:

1. **Injected UI Element:**  
   * **Trigger:** When a user navigates to https://cursor.com/dashboard.  
   * **Action:** A content script will inject a solid blue circular button into the top-right corner of the page.  
   * **Result:** Clicking this button will open the extension's main dashboard page (dashboard.html) in a new browser tab.  
2. **Extension Icon:**  
   * **Trigger:** The user clicks the extension's icon in the Chrome toolbar.  
   * **Action:** This will also open the main dashboard page (dashboard.html) in a new browser tab.

### **2.2. Dashboard Webpage (dashboard.html)**

This local HTML page serves as the main interface for the extension and is composed of two primary components: a summary table and a detailed events table.

### **2.3. Data Fetching and Processing Logic**

Upon loading dashboard.html, the following sequence of API calls will be executed to gather the necessary data.

**Step 1: Get User ID**

* **API Endpoint:** https://cursor.com/api/auth/me  
* **Method:** GET  
* **Purpose:** To retrieve the current user's sub identifier. This ID is required for the next step.  
* **Sample Response:**  
  {  
      "email": "xxxx@xxx.com",  
      "email\_verified": true,  
      "name": "xxxx",  
      "sub": "user\_xxxxxx",  
      "updated\_at": "2025-07-02T04:50:44.586Z"  
  }

**Step 2: Get Billing Cycle Start Date**

* **API Endpoint:** https://cursor.com/api/usage?user={sub\_id} (where {sub\_id} is from Step 1\)  
* **Method:** GET  
* **Purpose:** To retrieve the startOfMonth date, which indicates the beginning of the user's current billing cycle.  
* **Sample Response:**  
  {  
      "startOfMonth": "2025-06-27T11:48:21.000Z"  
  }

**Step 3: Determine Query Start Date**

* The logic will compare two dates:  
  1. The billing cycle start date (startOfMonth from Step 2).  
  2. The first day of the current calendar month.  
* The **earlier** of these two dates will be used as the startDate for fetching usage events. This ensures all potentially relevant data for the current billing and calendar months is retrieved.

**Step 4: Fetch All Usage Events**

* **API Endpoint:** https://cursor.com/api/dashboard/get-filtered-usage-events  
* **Method:** POST  
* **Logic:** Since the API is paginated, a loop is required to fetch all events from the determined startDate to the current time.  
  * **Initial Call:** Make a first call with page: 1 and pageSize: 300\.  
  * **Payload:**  
    {  
        "teamId": 0,  
        "startDate": "{calculated\_start\_timestamp\_ms}",  
        "endDate": "{current\_timestamp\_ms}",  
        "page": 1,  
        "pageSize": 300  
    }

  * **Pagination:** The response from the first call includes totalUsageEventsCount. This value will be used to calculate the total number of pages needed (totalPages \= Math.ceil(totalUsageEventsCount / 300)). The script will then iterate from page 2 to totalPages to fetch all remaining event data.  
  * **Progress Feedback:** After each page is fetched, the UI will be updated to show progress (e.g., "Fetched page 2 of 10 (600 events)") with a progress bar indicating completion percentage.  
  * **Aggregation:** All usageEventsDisplay arrays from the paginated responses will be concatenated into a single master list of events in memory.

### **2.4. Component 1: Summary Table**

This table provides an aggregated view of costs over several predefined timeframes. The calculations will be performed client-side after all usage events have been fetched.

**Table Structure:**

| Metric | Last 4 Hours | Last 24 Hours | Last 48 Hours | Last 7 Days | Billing (Since M/D) | Since Month D |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Requests Costs | (sum) | (sum) | (sum) | (sum) | (sum) | (sum) |
| Total Costs (USD) | (sum/100) | (sum/100) | (sum/100) | (sum/100) | (sum/100) | (sum/100) |
| Usage Based Costs | (sum) | (sum) | (sum) | (sum) | (sum) | (sum) |

Calculation Logic:  
For each timeframe column, the master list of events will be filtered based on the event timestamp. The values for requestsCosts, totalCents, and usageBasedCosts of the filtered events will be summed up to populate the corresponding cells in each metric row. The totalCents values will be divided by 100 to display as USD dollars in the "Total Costs (USD)" row. The billing column header will display the billing cycle start date in the format "Billing (Since M/D)". The calendar month column header will display the current month's first date in the format "Since Month D" (e.g., "Since July 1").

### **2.5. Component 2: Detail Table**

This table displays the raw, flattened data for every single usage event fetched.

**Table Columns & Data Transformation Rules:**

| Column Name | Source Path | Transformation Rule |
| :---- | :---- | :---- |
| # | (calculated) | Row number starting from 1, 2, 3, etc. |
| timestamp | timestamp | Convert from Unix milliseconds to a human-readable local time string (YYYY-MM-DD HH:MI:SS). |
| model | model | None. |
| kind | kind | Remove "USAGE_EVENT_KIND_" prefix if present. |
| requestsCosts | requestsCosts | None. |
| totalCents | tokenUsage.totalCents | None. |
| usageBasedCosts | usageBasedCosts | If the value is "-", display it as 0\. Otherwise, display the numerical value. |
| isTokenBasedCall | isTokenBasedCall | None. |
| maxMode | maxMode | If this property does not exist on the event object, the value is false. If true, the cell should be highlighted in blue. |
| inputTokens | tokenUsage.inputTokens | None. |
| outputTokens | tokenUsage.outputTokens | None. |
| cacheWriteTokens | tokenUsage.cacheWriteTokens | None. |
| cacheReadTokens | tokenUsage.cacheReadTokens | None. |
| owningUser | owningUser | None. |

## **3\. Technical Stack**

* **Language:** JavaScript (ES6+)  
* **Markup:** HTML5  
* **Styling:** CSS3  
* **Manifest:** manifest.json (Version 3\)

No external frameworks (e.g., React, Vue) are required for this version.

## **4\. UI/UX Enhancements**

* **Progress Feedback:** During data fetching, display a progress bar and status text showing current page being fetched (e.g., "Fetched page 3 of 8 (900 events)").  
* **Sticky Header:** The detail table header should remain visible when scrolling through the table with a maximum height of 600px.  
* **Visual Highlighting:** Max mode events should be highlighted with blue background in the detail table.  
* **Date Display:** The billing cycle start date should be displayed in the billing column header as "Billing (Since M/D)". The calendar month column header should display "Since Month D" showing the current month's first date.
* **Row Numbering:** The detail table should include a "#" column showing sequential row numbers starting from 1.

## **5\. Out of Scope for V1**

* **Data Caching:** The first version will fetch all data live on every page load. A future version could implement caching (e.g., using chrome.storage.local) to improve performance and reduce API calls.  
* **Data Visualization:** No charts or graphs will be included in V1.  
* **Advanced Filtering/Sorting:** The detail table will be presented as-is without user-configurable sorting or filtering capabilities.