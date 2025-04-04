// SidePanel.js

import { meet } from '@googleworkspace/meet-addons/meet.addons';

const CLOUD_PROJECT_NUMBER = '331777483172';

/**
 * Prepares the add-on Side Panel Client, and adds an event to launch the
 * activity in the main stage when the main button is clicked.
 */
export async function setUpAddon() {
    const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
    });
    const sidePanelClient = await session.createSidePanelClient();
    console.log("setUpAddon is called now.");
}

// Wait for the DOM to be fully loaded before running script
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Loaded. Initializing Addon (Externally Hosted).');
    console.log('window.name: ', window.name, 'document.name: ', document.name);
  
    // Get references to DOM elements
    const processListElement = document.getElementById('process-list');
    const statusElement = document.getElementById('status');
    const errorElement = document.getElementById('error-message');
  
    // --- Helper Functions (same as before) ---
  
    function updateProcessList(processes) {
      processListElement.innerHTML = '';
      if (!processes || processes.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No matching processes found.';
        processListElement.appendChild(li);
      } else {
        processes.forEach(procName => {
          const li = document.createElement('li');
          li.textContent = procName;
          processListElement.appendChild(li);
        });
      }
    }
  
    function updateStatus(text) {
      statusElement.textContent = `Status: ${text}`;
    }
  
    function displayError(text) {
      if (text) {
        errorElement.textContent = text;
        errorElement.style.display = 'block';
      } else {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
      }
    }
  
    // --- Meet Add-on SDK Initialization ---
    const meetOrigin = 'https://binp.github.io';
    console.log("Addon sending 'addonOpened' message to target:", meetOrigin);
    try {
        window.postMessage({ type: 'addonOpened' }, meetOrigin);
        updateStatus('Connecting to extension...');
    } catch (e) {
        console.error("Error sending addonOpened message:", e);
        displayError("Failed to communicate with Meet page.");
        updateStatus("Initialization Error");
    }


    // --- postMessage Communication Logic ---
  
    function handleMessage(event) {
      // SECURITY CHECK: ALWAYS verify the origin of the sender
      const expectedOrigin = 'https://meet.google.com';
      if (event.origin !== expectedOrigin) {
          console.warn(`Ignoring message from unexpected origin: ${event.origin}. Expected '${expectedOrigin}'`);
          return; // Stop processing if origin doesn't match
      }
  
      console.log('Addon received message:', event.data, 'from origin:', event.origin);
      const message = event.data;
  
      displayError(null); // Clear previous error
  
      switch (message?.type) {
        case 'processUpdate':
          updateProcessList(message.data || []);
          updateStatus(`Monitoring active. Last update: ${new Date().toLocaleTimeString()}`);
          break;
        case 'daemonError':
          displayError(`Daemon Error: ${message.data}`);
          updateStatus('An error occurred.');
          updateProcessList([]);
          break;
        case 'daemonDisconnected':
          displayError(null);
          updateStatus('Daemon disconnected. Monitoring stopped.');
          updateProcessList([]);
          break;
        default:
          console.log('Addon received unknown message type:', message);
          break;
      }
    }
  
    // Add the event listener for messages from the parent window (Meet)
    window.addEventListener('message', handleMessage);
    console.log('Message listener added for parent communication.');
  
    // Cleanup listener on unload
    window.addEventListener('unload', () => {
       console.log('Addon unloading. Removing message listener.');
       window.removeEventListener('message', handleMessage);
    });
  
  }); // End DOMContentLoaded listener
