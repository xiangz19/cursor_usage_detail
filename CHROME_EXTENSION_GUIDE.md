
# Chrome Extension Development Guide: Cursor Usage Stats

This document outlines the logic for creating a Chrome extension that displays Cursor usage statistics.

## Core Functionality

The extension's primary function is to fetch, process, and display usage data from the Cursor API. It should present this data in two main sections: a summary and a detailed table.

### 1. API Interaction

- **Endpoint:** `https://www.cursor.com/api/dashboard/get-monthly-invoice`
- **Method:** `POST`
- **Payload:**
  ```json
  {
      "month": <month>,
      "year": <year>,
      "includeUsageEvents": true
  }
  ```
  - `month`: 0-indexed (e.g., 0 for January).
  - `year`: The full year (e.g., 2025).
- **Authentication:** The browser automatically sends the necessary authentication cookie (`WorkosCursorSessionToken`) with requests to the `cursor.com` domain. For this to work, the extension's manifest file (`manifest.json`) must include host permissions for `https://www.cursor.com/`.

### 2. Data Processing

The API returns a JSON object containing a `usageEvents` array. Each event in this array needs to be processed and transformed into a structured format for display.

#### Sample Event Data

Here are two typical usage events to illustrate the data structure:

```json
{
    "timestamp": "1751000670649",
    "details": {
        "fastApply": {}
    },
    "subscriptionProductId": "pro-legacy",
    "status": "default",
    "owningUser": "xxxxxxxxx",
    "priceCents": 0
}
```

```json
{
    "timestamp": "1751000461352",
    "details": {
        "toolCallComposer": {
            "modelIntent": "claude-4-sonnet-thinking",
            "overrideNumRequestsCounted": 1,
            "isHeadless": false,
            "isTokenBasedCall": true,
            "tokenUsage": {
                "inputTokens": 1481,
                "outputTokens": 9496,
                "cacheWriteTokens": 20039,
                "cacheReadTokens": 202782,
                "totalCents": 28.28638458251953
            },
            "maxMode": false
        },
        "overrideNumRequestsCounted": 1
    },
    "subscriptionProductId": "pro-legacy",
    "status": "default",
    "owningUser": "xxxxxxxxxx",
    "priceCents": 28.28638458251953
}
```

#### a. Event Parsing

For each event, extract and transform the following fields:

- **`event_time`**: Convert the `timestamp` field (in milliseconds) to a `YYYY-MM-DD HH:MM:SS` formatted string.
- **`type`**: Determine from the `details` object by checking which key exists (`toolCallComposer`, `composer`, `fastApply`, `chat`, or `cmdK`). If none of these keys exist, set to `other`.
- **`model`**: Extract from `details[type].modelIntent` or `details[type].model` (prefer `modelIntent`).
- **`type_other`**: If type is `other`, store the entire `details` object as a JSON string.
- **`maxMode`**: Extract from `details[type].maxMode` (boolean).
- **`isTokenBasedCall`**: Extract from `details[type].isTokenBasedCall` (boolean).
- **`requestCount`**: **Priority order**: First use `priceCents / 4` (rounded to 1 decimal). If `priceCents` is not available, fall back to `details[type].overrideNumRequestsCounted`, then `details.overrideNumRequestsCounted`.
- **`subscriptionProductId`**: Use the `subscriptionProductId` field. If not present, fall back to `usagePriceId`.
- **`isSlow`**: Boolean indicating if the request was slow.
- **`status`**: The status of the event (e.g., "default", "errored").

#### b. Tool Call Aggregation

The `fastApply` events are used to count consecutive tool calls. This creates a new computed field called `toolcall`:

1. Iterate through the events and maintain a counter starting at 0
2. For each `fastApply` event: increment the counter
3. For each non-`fastApply` event: assign the current counter value to a new `toolcall` property on that event, then reset counter to 0
4. After processing, filter out all `fastApply` events from the final dataset

**Note:** The `toolcall` field does not exist in the original API response - it is computed during processing.

### 3. User Interface

The UI should be a single page with a summary section and a details table. The styling should be clean and modern.

#### a. Summary Section

The summary section should display a compact table with metrics as rows and time periods as columns:

**Table Structure:**
```
| Metric        | Today | This Month | Last 4 Hours | Last 24 Hours | Last 48 Hours |
|---------------|-------|------------|--------------|---------------|---------------|
| Record Count  | X     | X          | X            | X             | X             |
| Request Total | X.X   | X.X        | X.X          | X.X           | X.X           |
```

**Metrics:**
- **Record Count:** The total number of events (after filtering out `fastApply` events).
- **Request Total:** The sum of `requestCount` for all events (displayed to 1 decimal place).

**Time Periods:**
- **Today:** Events from 00:00:00 today to now
- **This Month:** Events from the 1st of current month to now
- **Last 4 Hours:** Events from 4 hours ago to now
- **Last 24 Hours:** Events from 24 hours ago to now
- **Last 48 Hours:** Events from 48 hours ago to now

#### b. Details Table

The details table should display the processed event data in a scrollable table with the following 12 columns:

| Column | Header | Data Source | Description |
|--------|--------|-------------|-------------|
| 1 | **#** | Row index | Sequential row number (1, 2, 3, ...) |
| 2 | **Time** | `event_time` | Formatted timestamp (YYYY-MM-DD HH:MM:SS) |
| 3 | **Type** | `type` | Event type (`toolCallComposer`, `composer`, `chat`, `cmdK`, `other`) |
| 4 | **Model** | `model` | Model name (e.g., `claude-4-sonnet-thinking`) |
| 5 | **Requests** | `requestCount` | Request count (decimal, e.g., 7.1, 2.5) |
| 6 | **Product** | `subscriptionProductId` | Subscription product (e.g., `pro-legacy`) |
| 7 | **Slow?** | `isSlow` | "Yes" (red text) or "No" |
| 8 | **Status** | `status` | Event status (e.g., `default`, `errored`) |
| 9 | **Other** | `type_other` | JSON string if type is `other`, otherwise empty |
| 10 | **fastApply** | `toolcall` (computed) | Number of consecutive fastApply events before this event |
| 11 | **Max** | `maxMode` | "Yes" or "No" |
| 12 | **Token Based** | `isTokenBasedCall` | "Yes" or "No" |

**Important Notes:**
- `fastApply` events are NOT displayed in this table (they are filtered out after aggregation)
- The `fastApply` column shows the count of consecutive `fastApply` events that occurred before each displayed event
- Rows are sorted by timestamp (most recent first)
- The table should have a sticky header and be horizontally scrollable

### 4. UI Styling

- Use a clean, modern design with a light theme.
- Use a sans-serif font.
- The summary table should be clearly separated from the details table.
- The details table should be well-structured with clear headings.
- Highlight rows with specific conditions:
  - `maxMode` is true: Use a light blue background (`#e3f2fd`)
  - `status` is "errored": Use a light red background (`#ffebee`)
- Highlight specific cells:
  - `isSlow` is true: Display "Yes" in red text (`#d32f2f`) with bold weight

### 5. User Interaction

- The user should be able to select the year and month for which to view usage data using two distinct dropdown lists (one for year, one for month).
- The data should be fetched and the view updated automatically when the user changes the selection in either the year or month dropdown.


## Extension Entry Point

The Chrome extension should activate when the user navigates to `https://www.cursor.com/dashboard?tab=usage`.

1.  **Visual Indicator:** A small, solid blue circle should be injected into the top-right corner of the `https://www.cursor.com/dashboard?tab=usage` page. This circle will serve as the entry point for the usage details view.
2.  **Interaction:** When this blue circle is clicked, a new browser tab should open, displaying the detailed usage statistics page. This new tab will be the main UI of the Chrome extension, rendering the summary and detailed table as described in the "User Interface" section.
