// Only run on the usage tab
if (window.location.href.includes('dashboard?tab=usage') || window.location.href.includes('dashboard&tab=usage')) {
  
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
    
    // Click handler to open usage details
    circle.addEventListener('click', () => {
      const extensionURL = chrome.runtime.getURL('usage.html');
      window.open(extensionURL, '_blank');
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