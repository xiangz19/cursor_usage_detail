# **PRD V2.1: Caching & Performance Enhancements**

Version: 2.7  
Date: July 5, 2025  
Author: Gemini  
Related Document: PRD & Implementation Plan: Cursor Usage Stats Extension (V2)

## **1\. Overview of Enhancements**

This document outlines the V2.1 enhancements for the Cursor Usage Stats Extension. The primary goal of this update is to significantly improve performance and reduce loading times by implementing a local caching mechanism. By storing event data locally, the extension will only need to fetch the most recent events, providing a much faster experience for the user. This version introduces intelligent caching that preserves historical data across billing cycles and a more scalable, user-friendly UI for large datasets.

## **2\. Caching Implementation Details**

### **2.1. Caching Technology**

* **Database:** IndexedDB will be used for local, persistent storage of event data. It is well-suited for storing large amounts of structured data client-side.  
* **Schema:**  
  * **events Object Store:** This will store the individual usage event objects. The event timestamp will be the keyPath for efficient time-based queries.  
  * **metadata Object Store:** A simple key-value store to hold information about the cache itself and user context. It will contain:
    * cache_start: The timestamp (in milliseconds) of the oldest event stored in the cache.  
    * cache_end: The timestamp (in milliseconds) of the newest event stored in the cache.
    * user_sub: The current user's sub id (always cached).
    * billing_start_date: The current billing start date (only cached if it is within one month from now).

### **2.2. Data Loading & Caching Logic**

The data fetching process will use a refined, sequential logic that minimizes data transfer and blocks UI rendering until all data is ready, ensuring the user only sees the final, complete state.

1. **User and Billing Info Caching:**
   * On page load, the extension first attempts to read `user_sub` and `billing_start_date` from the cache.
   * If `user_sub` is present, it is used directly; if not, the API is called and the result is cached.
   * For `billing_start_date`, the cached value is used only if it is within one month from now; otherwise, the API is called and the result is cached.
   * Only call the APIs if the cache is missing or stale.
2. **Determine Required Range:** Calculate the required_start date (the earlier of the billing start date or the first day of the current calendar month) and required_end (current time).  
3. **Data Synchronization:** Upon page load, immediately show a loading indicator (as in the current version). Perform the following data synchronization steps sequentially:  
   * **Step 3a: Fill Historical Gap**  
     * Check if required_start < cache_start.  
     * If true, fetch the historical range [required_start, cache_start] from the server.  
     * Upon successful fetch, save the new historical events to IndexedDB. **It is critical to then update the cache_start metadata value to required_start to reflect the new, older boundary of the cache.**  
   * **Step 3b: Fill Recent Gap**  
     * Define the recent range as [(cache_end - 30 minutes), required_end].  
     * Fetch this range from the server.  
     * Upon successful fetch:  
       1. In IndexedDB, delete all events where timestamp >= (cache_end - 30 minutes).  
       2. Save the newly fetched recent events to IndexedDB.  
       3. Update the cache_end metadata value to required_end. **This step is crucial to ensure the next page load correctly identifies the most recent cached event.**  
4. **Load Final Data for Display:**  
   * After all synchronization steps are complete, query IndexedDB for the full [required_start, required_end] range to get the complete, up-to-date dataset.  
   * **Sort all events by timestamp descending (latest event first) before display.**
5. **Render UI:**  
   * Hide the loading indicator.  
   * Display the final, loaded data in the summary and detail tables.

### **2.3. Data De-duplication Strategy**

The process is designed to be inherently free of duplicates. The "delete and replace" strategy for the recent data ensures that the overlapping 30-minute window is always replaced with fresh data from the server. The historical gap fill only adds data to a time range that was previously empty.

## **3\. UI and User-Facing Changes**

### **3.1. Cache Management UI**

- The "Clear Current Month's Cache" and "Clear All Cache" buttons are located in the top right corner of the header, inline and smaller for a compact look.
- The "New Version" label has been removed from the UI for a cleaner appearance.
- When the "Clear Current Month's Cache" button is clicked (after a custom confirmation modal), the extension will:
  1. Calculate the current_month_start_date (same logic as required_start).
  2. In IndexedDB, delete all events from the events store where timestamp >= current_month_start_date.
  3. Update the cache_end metadata value to be current_month_start_date. This ensures the cache's boundary is valid before reloading.
  4. Force a page reload. The caching logic will then automatically detect the missing data and re-fetch it from the new cache_end.
- When the "Clear All Cache" button is clicked (after a custom confirmation modal), the extension will:
  1. Completely clear the IndexedDB database (both events and metadata stores).
  2. Force a page reload, triggering a full data fetch from the server as if it were the first run.

### **3.2. Details Table (Usage Events Detail)**

- The details table supports paging for large datasets.
- Page size is user-selectable via a dropdown: 10, 50, 200, 500 (default: 10).
- Paging controls are shown only at the top of the details table
- **Events are always sorted by timestamp descending (latest event first).**

### **3.3. General UI**

- The UI is optimized for large event histories and efficient navigation.
- All changes above are blended into the main interface for a seamless user experience.

## **4\. Updated Data Flow**

graph TD  
    A[Start Page Load] --> B{Read user_sub and billing_start_date from cache};  
    B -- valid --> C{Calculate required_start};  
    B -- missing/stale --> D[Fetch user_sub and/or billing_start_date from API, cache if valid];  
    D --> C;  
    C --> E[Show Loading Indicator];  
    E --> F{Is required_start < cache_start?};  
    F -- Yes --> G[Fetch & Save Historical Gap];  
    F -- No --> H[No Historical Gap];  
    G --> I{Fetch Recent Gap};  
    H --> I;  
    I --> J[Delete Overlap in DB];  
    J --> K[Save Recent Gap Data];  
    K --> L[All Sync Complete];  
    L --> M[Load final data for [required_start, now] from DB, sort descending];  
    M --> N[Hide Loading Indicator & Display Data];
