// SidePanel.js

import { meet } from '@googleworkspace/meet-addons/meet.addons';

const CLOUD_PROJECT_NUMBER = '331777483172';
const SERVER_URL = 'https://helloworld-331777483172.us-west1.run.app/processes';

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded. Initializing Addon with Role Selection and Timeline.');

  // --- DOM References ---
  const statusElement = document.getElementById('status');
  const errorElement = document.getElementById('error-message');
  const bodyElement = document.body;
  const roleSelectionDiv = document.getElementById('role-selection');
  const hostButton = document.getElementById('host-button');
  const guestButton = document.getElementById('guest-button');
  const guestStatusDetail = document.getElementById('guest-status-detail');
  // Host UI Elements
  const hostGuestName = document.getElementById('host-guest-name');
  const hostOverallStatusIcon = document.getElementById('host-overall-status-icon');
  const hostLastUpdate = document.getElementById('host-last-update');
  const hostProcessesSection = document.getElementById('host-processes-section');
  const hostProcessesStatus = document.getElementById('host-processes-status');
  const hostProcessesList = document.getElementById('host-processes-list');
  const hostTabsSection = document.getElementById('host-tabs-section');
  const hostTabsStatus = document.getElementById('host-tabs-status');
  const hostTabsList = document.getElementById('host-tabs-list');
  const hostScreenshotSection = document.getElementById('host-screenshot-section');
  const hostScreenshotStatus = document.getElementById('host-screenshot-status');
  const hostScreenshotDetails = document.getElementById('host-screenshot-details');
  const hostTimelineSection = document.getElementById('host-timeline-section'); // New Timeline Section
  const hostTimelineList = document.getElementById('host-timeline-list'); // New Timeline List UL

  // --- State Variables (same as before) ---
  let isHost = false;
  let roleSelected = false;
  let session = null;
  let sidePanelClient = null;
  let currentGuestData = null; // Store data for the single guest
  let pollIntervalId = null; // For host polling

  // Create the session and side panel client and hold on them.
  async function setUpAddon() {
    if (session == null) {
      session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });  
    }
    if (sidePanelClient == null) {
      sidePanelClient = await session.createSidePanelClient();
    }
  }

  // --- Helper Functions (updateStatus, displayError, updateHostProcessList - same as before) ---
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

  /** Updates the Host dashboard based on currentGuestData */
  function updateHostDashboard() {
    if (!isHost || !roleSelected) return;

    if (!currentGuestData) {
      hostGuestName.textContent = 'Guest: ---';
      hostOverallStatusIcon.textContent = '⚪';
      hostOverallStatusIcon.className = 'status-icon unknown';
      hostLastUpdate.textContent = 'Last Update: Waiting for guest...';
      // Reset detail sections
      hostProcessesSection.style.display = 'block'; // Show sections initially
      hostProcessesStatus.textContent = '---';
      hostProcessesStatus.className = 'status-text unknown';
      hostProcessesList.innerHTML = '';
      hostTabsSection.style.display = 'block';
      hostTabsStatus.textContent = '---';
      hostTabsStatus.className = 'status-text unknown';
      hostTabsList.innerHTML = '';
      hostScreenshotSection.style.display = 'block';
      hostScreenshotStatus.textContent = '---';
      hostScreenshotStatus.className = 'status-text unknown';
      hostScreenshotDetails.textContent = '';
      // Reset timeline
      hostTimelineSection.style.display = 'block';
      hostTimelineList.innerHTML = '<li><i>Waiting for guest data...</i></li>';
      return;
    }

    // Update header
    hostGuestName.textContent = `Guest: ${currentGuestData.name || 'Unknown'}`;
    hostLastUpdate.textContent = `Last Update: ${currentGuestData.lastUpdate ? new Date(currentGuestData.lastUpdate).toLocaleTimeString() : 'N/A'}`;

    // Determine overall status and update details
    let overallStatus = 'ok'; // ok, warning, alert

    // --- Process Status ---
    // **ASSUMPTION**: currentGuestData contains objects like:
    // processes: { status: 'ok'|'warning'|'alert', details: ['proc1', 'proc2'] }
    // tabs: { status: 'ok', details: ['url1'] }
    // screenshots: { status: 'warning', details: 'Possible phone detected' }
    // timelineEvents: [ { timestamp: 'ISO_string', description: 'Event text' }, ... ]
    const processInfo = currentGuestData.processes || { status: 'unknown', details: [] };
    hostProcessesStatus.textContent = processInfo.status.toUpperCase();
    hostProcessesStatus.className = `status-text ${processInfo.status}`;
    hostProcessesList.innerHTML = ''; // Clear previous list
    if (processInfo.status !== 'ok' && processInfo.details.length > 0) {
      processInfo.details.forEach(proc => { /* ... create and append li ... */ });
      hostProcessesSection.style.display = 'block';
      if (processInfo.status === 'alert') overallStatus = 'alert';
      else if (processInfo.status === 'warning') overallStatus = 'warning';
    } else {
       hostProcessesStatus.textContent = 'OK'; // Explicitly show OK if no details
       hostProcessesStatus.className = `status-text ok`;
       // hostProcessesSection.style.display = 'none'; // Optional: Hide section if OK
    }

    // --- Tabs Status --- (Similar logic)
    const tabInfo = currentGuestData.tabs || { status: 'unknown', details: [] };
    hostTabsStatus.textContent = tabInfo.status.toUpperCase();
    hostTabsStatus.className = `status-text ${tabInfo.status}`;
    hostTabsList.innerHTML = '';
     if (tabInfo.status !== 'ok' && tabInfo.details.length > 0) {
        tabInfo.details.forEach(tab => { /* ... create and append li ... */ });
        hostTabsSection.style.display = 'block';
        if (tabInfo.status === 'alert') overallStatus = 'alert';
        else if (tabInfo.status === 'warning' && overallStatus === 'ok') overallStatus = 'warning';
     } else {
        hostTabsStatus.textContent = 'OK';
        hostTabsStatus.className = `status-text ok`;
        // hostTabsSection.style.display = 'none'; // Optional: Hide section if OK
     }

    // --- Screenshot Status --- (Different display)
    const screenInfo = currentGuestData.screenshots || { status: 'unknown', details: '' };
    hostScreenshotStatus.textContent = screenInfo.status.toUpperCase();
    hostScreenshotStatus.className = `status-text ${screenInfo.status}`;
    hostScreenshotDetails.textContent = '';
    if (screenInfo.status !== 'ok' && screenInfo.details) {
        hostScreenshotDetails.textContent = screenInfo.details;
        hostScreenshotSection.style.display = 'block';
        if (screenInfo.status === 'alert') overallStatus = 'alert';
        else if (screenInfo.status === 'warning' && overallStatus === 'ok') overallStatus = 'warning';
    } else {
        hostScreenshotStatus.textContent = 'OK';
        hostScreenshotStatus.className = `status-text ok`;
        // hostScreenshotSection.style.display = 'none'; // Optional: Hide section if OK
    }

     // --- NEW: Update Timeline ---
     hostTimelineList.innerHTML = ''; // Clear previous timeline
     const events = currentGuestData.timelineEvents || [];
     if (events.length > 0) {
         // Sort events if needed (assuming backend doesn't sort) - newest first
         events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

         events.forEach(event => {
             const li = document.createElement('li');
             const timestampSpan = document.createElement('span');
             const descriptionSpan = document.createElement('span');

             timestampSpan.className = 'timestamp';
             // Format timestamp nicely
             timestampSpan.textContent = `[${new Date(event.timestamp).toLocaleTimeString()}]`;

             descriptionSpan.className = 'description';
             descriptionSpan.textContent = event.description;

             li.appendChild(timestampSpan);
             li.appendChild(descriptionSpan);
             hostTimelineList.appendChild(li);
         });
         hostTimelineSection.style.display = 'block';
     } else {
         // Optionally hide timeline section if empty, or show placeholder
         hostTimelineList.innerHTML = '<li><i>No recent events logged.</i></li>';
         // hostTimelineSection.style.display = 'none';
     }


    // Update overall status icon based on highest severity found
    let overallIcon = '🟢';
    let overallIconClass = 'ok';
    if (overallStatus === 'alert') { overallIcon = '🔴'; overallIconClass = 'alert'; }
    else if (overallStatus === 'warning') { overallIcon = '🟡'; overallIconClass = 'warning'; }
    hostOverallStatusIcon.textContent = overallIcon;
    hostOverallStatusIcon.className = `status-icon ${overallIconClass}`;
  }

  // --- Function to Fetch Data for Host (Unchanged, but processes new data structure) ---
  async function fetchHostData() {
    if (!isHost || !roleSelected) return;
    console.log('Host fetching data...');
    updateStatus('Host mode fetching data...');
    try {
        const response = await fetch(SERVER_URL, { method: 'GET', mode: 'cors', cache: 'no-cache' });
        if (!response.ok) { throw new Error(`HTTP error ${response.status}`); }
        const serverData = await response.json();
        //TODO(binp: we might want to change this.
        if (serverData.success && typeof serverData.data === 'object') {
            console.log('Host received data:', serverData.data);
            let guestId = null;
            for (const userId in serverData.data) {
                if (ownUserInfo && userId !== ownUserInfo.userSessionId) { guestId = userId; break; }
            }
            if (guestId) {
                // **ASSUMPTION**: serverData.data[guestId] now contains:
                // { name: '..', lastUpdate: '..', processes: { status: '..', details: [] }, tabs: {...}, screenshots: {...}, timelineEvents: [...] }
                currentGuestData = serverData.data[guestId];
                console.log('Displaying data for guest:', guestId);
            } else {
                console.log('No guest data found in response.');
                currentGuestData = null;
            }
            updateHostDashboard(); // Update UI
            updateStatus(`Host mode listening. Last fetch: ${new Date().toLocaleTimeString()}`);
        } else {
          throw new Error(serverData.error || 'Invalid data format');
        }
    } catch (error) {
      console.error('Error fetching data from server:', error);
      displayError(`Network error fetching data: ${error.message}`);
      updateStatus('Network Error (GET)');
    }
  }

  // --- Mode Initialization (Called AFTER role selection) ---
  async function startSelectedMode(chosenIsHost) {
    if (roleSelected) {
      console.warn("Role already selected; no need to run this again.");
      return;
    }
    roleSelected = true;
    isHost = chosenIsHost;

    console.log(`Role selected: ${isHost ? 'Host' : 'Guest'}`);
    displayError(null);
    bodyElement.classList.add('role-selected');
    bodyElement.classList.add(isHost ? 'host-mode' : 'guest-mode');

    updateStatus('Initializing codoing session...');
    try {
      console.log('Make sure the sidePanelClient has initialized...');
      // Use the stored sdkInstance from registerSdk()
      if (!sidePanelClient) {
        console.log("The addon session and side panel has not been initialed. doing now...")
        await setUpAddon();
      }
      console.log('The side panel has started/joined.');
      updateStatus(isHost ? 'Host mode listening.' : 'Guest mode ready to send.');

      if (isHost) {
        sidePanelClient.startActivity();
        // HOST: Listen for broadcasts
        // Inside Host logic in startSelectedMode, after setting isHost=true
        // Inside Host logic in startSelectedMode, after setting isHost=true

        // Start polling
        fetchHostData(); // Fetch immediately
        pollIntervalId = setInterval(fetchHostData, 15000); // Fetch every 15 seconds (adjust interval as needed)

      } else {
        // GUEST: Send 'addonOpened' message to the window.top.
         const meetOrigin = 'https://meet.google.com';
         console.log("Guest sending 'addonOpened' message to target:", meetOrigin);
         window.top.postMessage({ type: 'addonOpened' }, meetOrigin);
         updateStatus('Guest mode active. Waiting for process info from extension.');
         guestStatusDetail.textContent = 'Waiting for process info from extension...';
      }

    } catch (err) {
      console.error('Error starting collaboration:', err);
      displayError(`Collaboration failed: ${err.message || err}`);
      updateStatus('Collaboration Error');
      roleSelected = false;
      bodyElement.className = ''; // Reset mode classes
    }
  }

  // --- Message Handler (for communication FROM Content Script TO Addon - same logic) ---
  function handleMessage(event) {
    const expectedOrigin = 'https://meet.google.com';
    if (event.origin !== expectedOrigin) { return; }

    const message = event.data;
    console.log('Addon received message from parent window:', message);

    // GUESTS process messages from the extension
    if (!isHost && roleSelected && message?.type === 'processUpdate') {
      console.log('Guest received process update from extension:', message.data);
      guestStatusDetail.textContent = `Sending process info (${message.data?.length || 0})...`;
      displayError(null);


      // Inside Guest logic, when processes are received from extension
      const payload = {
        userId: 'binp_guest', // Get actual user ID from SDK
        userName: 'binp Guest', // Get actual name from SDK
        processes: message.data || [] // Assuming message.data has the process list
      };

      fetch(SERVER_URL, {
        method: 'POST',
        mode: 'cors', // Required for cross-origin requests
        cache: 'no-cache',
        headers: {
            'Content-Type': 'application/json'
        },
        // Use redirect: 'follow' if needed, but Apps Script usually doesn't redirect POSTs
        body: JSON.stringify(payload)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
            console.log('Successfully POSTed data to server:', data);
            updateStatus(`Process info sent (${payload.processes.length}).`);
            guestStatusDetail.textContent = `Process info sent (${payload.processes.length}). Waiting for next update...`;
        } else {
            console.error('Server returned error:', data.error);
            displayError(`Server error: ${data.error}`);
            updateStatus('Server Error (POST)');
        }
      })
      .catch(error => {
        console.error('Error POSTing data to server:', error);
        displayError(`Network error sending data: ${error.message}`);
        updateStatus('Network Error (POST)');
        guestStatusDetail.textContent = 'Error sending process info.';
      });
    } else if (!isHost && roleSelected && (message?.type === 'daemonError' || message?.type === 'daemonDisconnected')) {
       console.warn('Received daemon status from extension:', message.type, message.data);
       displayError(`Extension reported: ${message.type} ${message.data || ''}`);
       updateStatus('Extension Error');
       guestStatusDetail.textContent = `Extension reported an error: ${message.type}.`;
    }
  }

  // --- Initialization & Event Listeners ---
  hostButton.addEventListener('click', () => startSelectedMode(true));
  guestButton.addEventListener('click', () => startSelectedMode(false));
  window.addEventListener('message', handleMessage);
  setUpAddon(); // Complete the set up of the addon and create session, sidePanelClient and coDoingClient.
  // window.addEventListener('unload', () => { /* ... cleanup ... */ });
  // Remember to clear the interval on unload or if mode changes
  window.addEventListener('unload', () => {
    window.removeEventListener('message', handleMessage);
    if (pollIntervalId) clearInterval(pollIntervalId);   // Clear polling on unload
  });


}); // End DOMContentLoaded listener

