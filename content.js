// Only run on the dashboard page
if (window.location.href.includes('dashboard')) {
  
  // Create popup menu
  function createPopupMenu() {
    const popup = document.createElement('div');
    popup.id = 'cursor-usage-popup';
    popup.style.cssText = `
      position: fixed;
      top: 50px;
      right: 20px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10001;
      display: none;
      min-width: 120px;
    `;
    
    const oldOption = document.createElement('div');
    oldOption.textContent = 'old';
    oldOption.style.cssText = `
      padding: 10px 15px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
      color: #333;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
    `;
    
    const newOption = document.createElement('div');
    newOption.textContent = 'new';
    newOption.style.cssText = `
      padding: 10px 15px;
      cursor: pointer;
      color: #333;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
    `;
    
    // Hover effects
    oldOption.addEventListener('mouseenter', () => {
      oldOption.style.backgroundColor = '#f8f9fa';
    });
    oldOption.addEventListener('mouseleave', () => {
      oldOption.style.backgroundColor = 'white';
    });
    
    newOption.addEventListener('mouseenter', () => {
      newOption.style.backgroundColor = '#f8f9fa';
    });
    newOption.addEventListener('mouseleave', () => {
      newOption.style.backgroundColor = 'white';
    });
    
    // Click handlers
    oldOption.addEventListener('click', () => {
      const extensionURL = chrome.runtime.getURL('usage.html');
      window.open(extensionURL, '_blank');
      popup.style.display = 'none';
    });
    
    newOption.addEventListener('click', () => {
      const extensionURL = chrome.runtime.getURL('dashboard.html');
      window.open(extensionURL, '_blank');
      popup.style.display = 'none';
    });
    
    popup.appendChild(oldOption);
    popup.appendChild(newOption);
    document.body.appendChild(popup);
    
    return popup;
  }
  
  // Create the blue circle indicator
  function createBlueCircle() {
    const circle = document.createElement('div');
    circle.id = 'cursor-usage-circle';
    circle.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 20px;
      height: 20px;
      background-color: #007bff;
      border-radius: 50%;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
      transition: transform 0.1s ease;
    `;
    
    // Hover effect
    circle.addEventListener('mouseenter', () => {
      circle.style.transform = 'scale(1.1)';
    });
    
    circle.addEventListener('mouseleave', () => {
      circle.style.transform = 'scale(1)';
    });
    
    // Create popup menu
    const popup = createPopupMenu();
    
    // Click handler to show popup menu
    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    });
    
    // Hide popup when clicking outside
    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== circle) {
        popup.style.display = 'none';
      }
    });
    
    document.body.appendChild(circle);
  }
  
  // Wait for page to load, then create circle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createBlueCircle);
  } else {
    createBlueCircle();
  }
} 