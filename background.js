// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Cursor Usage Details extension installed');
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Cursor Usage Details extension started');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('usage.html')
  });
}); 