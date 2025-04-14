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
  // const guestStatusDetail = document.getElementById('guest-status-detail');
  // Guest UI Elements
  const guestConnectionStatusDiv = document.getElementById('guest-connection-status'); // New status div
  const extensionLink = document.getElementById('extension-link'); // Link element
  const daemonLink = document.getElementById('daemon-link'); // Link element
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

  /** Safely formats list items to prevent HTML injection */
  function createListItem(text) {
    const li = document.createElement('li');
    li.textContent = text; // Use textContent for safety
    return li;
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
      hostProcessesStatus.textContent = '---'; hostProcessesStatus.className = 'status-text unknown'; hostProcessesList.innerHTML = '';
      hostTabsStatus.textContent = '---'; hostTabsStatus.className = 'status-text unknown'; hostTabsList.innerHTML = '';
      hostScreenshotStatus.textContent = '---'; hostScreenshotStatus.className = 'status-text unknown'; hostScreenshotDetails.textContent = '';
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
    // processInfo: { status: 'ok'|'warning'|'alert', flaggedProcesses: ['proc1', 'proc2'] }
    const processInfo = currentGuestData.processInfo || { status: 'unknown', flaggedProcesses: [] };
    hostProcessesStatus.textContent = processInfo.status.toUpperCase();
    hostProcessesStatus.className = `status-text ${processInfo.status}`;
    hostProcessesList.innerHTML = ''; // Clear previous list
    if (processInfo.status !== 'ok' && processInfo.flaggedProcesses.length > 0) {
      processInfo.flaggedProcesses.forEach(proc => hostProcessesList.appendChild(createListItem(proc)));
      hostProcessesSection.style.display = 'block';
      if (processInfo.status === 'alert') overallStatus = 'alert';
      else if (processInfo.status === 'warning') overallStatus = 'warning';
    } else {
       hostProcessesStatus.textContent = 'OK';
       hostProcessesStatus.className = `status-text ok`;
       hostProcessesList.innerHTML = '<li><i>No flagged processes.</i></li>'; // Show OK status
       // hostProcessesSection.style.display = 'none'; // Optional: Hide section if OK
    }

    // --- Tabs Status ---
    // **ASSUMPTION**: currentGuestData.openedTabInfo = { status: 'ok'|'warning', flaggedTabs: ['url1'] }
    const tabInfo = currentGuestData.openedTabInfo || { status: 'unknown', flaggedTabs: [] };
    hostTabsStatus.textContent = tabInfo.status.toUpperCase();
    hostTabsStatus.className = `status-text ${tabInfo.status}`;
    hostTabsList.innerHTML = '';
    if (tabInfo.status !== 'ok' && tabInfo.flaggedTabs.length > 0) {
      tabInfo.flaggedTabs.forEach(tab => hostTabsList.appendChild(createListItem(tab)));
      hostTabsSection.style.display = 'block';
      if (tabInfo.status === 'alert') overallStatus = 'alert'; // Assuming tabs can trigger alerts
      else if (tabInfo.status === 'warning' && overallStatus === 'ok') overallStatus = 'warning';
    } else {
      hostTabsStatus.textContent = 'OK';
      hostTabsStatus.className = `status-text ok`;
      hostTabsList.innerHTML = '<li><i>No restricted tabs detected.</i></li>';
      // hostTabsSection.style.display = 'none'; // Optional: Hide section if OK
    }


    // --- Screenshot Status ---
    // **ASSUMPTION**: currentGuestData.screenshotInfo = { status: 'ok'|'warning'|'alert', details: '...' }
    const screenInfo = currentGuestData.screenshotInfo || { status: 'unknown', details: '' };
    hostScreenshotStatus.textContent = screenInfo.status.toUpperCase();
    hostScreenshotStatus.className = `status-text ${screenInfo.status}`;
    hostScreenshotDetails.textContent = ''; // Clear previous details
    if (screenInfo.status !== 'ok' && screenInfo.details) {
        hostScreenshotDetails.textContent = screenInfo.details; // Use textContent for safety
        hostScreenshotSection.style.display = 'block';
        if (screenInfo.status === 'alert') overallStatus = 'alert';
        else if (screenInfo.status === 'warning' && overallStatus === 'ok') overallStatus = 'warning';
    } else {
        hostScreenshotStatus.textContent = 'OK';
        hostScreenshotStatus.className = `status-text ok`;
        hostScreenshotDetails.textContent = 'No issues detected.';
        // hostScreenshotSection.style.display = 'none'; // Optional: Hide section if OK
    }


    // --- Update Timeline ---
    // **ASSUMPTION**: currentGuestData.timelineEvents = [ { timestamp: 'ISO_string', description: 'Event text' }, ... ]
    hostTimelineList.innerHTML = ''; // Clear previous timeline
    const events = currentGuestData.timelineEvents || [];
    if (events.length > 0) {
        // Sort events newest first (assuming backend doesn't)
        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        // Limit number of events shown? e.g., events.slice(0, 20)
        events.forEach(event => {
            const li = document.createElement('li');
            const timestampSpan = document.createElement('span');
            const descriptionSpan = document.createElement('span');
            timestampSpan.className = 'timestamp';
            timestampSpan.textContent = `[${new Date(event.timestamp).toLocaleTimeString()}]`;
            descriptionSpan.className = 'description';
            descriptionSpan.textContent = event.description; // Use textContent
            li.appendChild(timestampSpan);
            li.appendChild(descriptionSpan);
            hostTimelineList.appendChild(li);
        });
        hostTimelineSection.style.display = 'block';
    } else {
        hostTimelineList.innerHTML = '<li><i>No recent events logged.</i></li>';
    }


    // Update overall status icon based on highest severity found
    // Update overall status icon
    let overallIcon = '🟢'; let overallIconClass = 'ok';
    if (overallStatus === 'alert') { overallIcon = '🔴'; overallIconClass = 'alert'; }
    else if (overallStatus === 'warning') { overallIcon = '🟡'; overallIconClass = 'warning'; }
    hostOverallStatusIcon.textContent = overallIcon;
    hostOverallStatusIcon.className = `status-icon ${overallIconClass}`;
  }

  // --- Function to Fetch Data for Host ---
  async function fetchHostData() {
    if (!isHost || !roleSelected) return;
    console.log('Host fetching data...');
    updateStatus('Host mode fetching data...');
    try {
        const response = await fetch(SERVER_URL, { method: 'GET', mode: 'cors', cache: 'no-cache' });
        if (!response.ok) { throw new Error(`HTTP error ${response.status}`); }
        const serverData = await response.json();
        console.log('Host received data:', serverData);
        //TODO(binp): we might want to change this.
        if (typeof serverData === 'object' && serverData !== null) {
            //TODO: The code only work in the single guest mode.
            for (const userId in serverData) {
                // **ASSUMPTION**: serverData.data[guestId] now contains:
                // { name: '..', lastUpdate: '..', processes: { status: '..', details: [] }, tabs: {...}, screenshots: {...}, timelineEvents: [...] }
                currentGuestData = serverData[userId];
                console.log('Displaying data for guest:', userId);
                updateHostDashboard(); // Update UI
                updateStatus(`Host mode listening. Last fetch: ${new Date().toLocaleTimeString()}`);
            }
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
    bodyElement.className = 'role-selected ' + (isHost ? 'host-mode' : 'guest-mode'); // Set body class

    console.log("meetingId: ", meet.addon.meetingId, " meetingCode: ", meet.addon.meetingCode);
    updateStatus('Initializing codoing session...');
    try {
      console.log('Make sure the sidePanelClient has initialized...');
      // Use the stored sdkInstance from registerSdk()
      if (!sidePanelClient) {
        console.log("The addon session and side panel has not been initialed. doing now...")
        await setUpAddon();
      }
      console.log('The side panel has started/joined.');
      // updateStatus(isHost ? 'Host mode listening.' : 'Guest mode ready to send.');

      if (isHost) {
        sidePanelClient.startActivity({
          sidePanelUrl: "https://binp.github.io/addon/src/SidePanel.html"
        });
        // HOST: Listen for broadcasts
        // Inside Host logic in startSelectedMode, after setting isHost=true
        // Inside Host logic in startSelectedMode, after setting isHost=true
        updateStatus('Host mode active. Fetching initial data...');
        updateHostDashboard();
        // Start polling
        fetchHostData(); // Fetch immediately
        if (!pollIntervalId) pollIntervalId = setInterval(fetchHostData, 15000); // Fetch every 15 seconds (adjust interval as needed)
      } else {
        // GUEST: Send 'addonOpened' message to the window.top.
         const meetOrigin = 'https://meet.google.com';
         console.log("Guest sending 'addonOpened' message to target:", meetOrigin);
         window.top.postMessage({ type: 'addonOpened' }, meetOrigin);

         // Set initial guest status text.  
         guestConnectionStatusDiv.textContent = 'Status: Waiting for connection from extension...';
         updateStatus('Guest mode active.');

        // Set placeholder links (REPLACE with actual URLs)
        extensionLink.href = 'https://binp.github.io'; // TODO: Replace with Chrome Web Store link
        daemonLink.href = 'https://binp.github.io'; // TODO: Replace with Daemon download link
      }

    } catch (err) {
      console.error('Error starting collaboration:', err);
      displayError(`Collaboration failed: ${err.message || err}`);
      updateStatus('Collaboration Error');
      roleSelected = false;    // Allow re-selection?
      bodyElement.className = ''; // Reset mode classes
    }
  }

  // --- Message Handler (for communication FROM Content Script TO Addon) ---
  function handleMessage(event) {
    const expectedOrigin = 'https://meet.google.com';
    if (event.origin !== expectedOrigin) { return; }

    const message = event.data;
    console.log('Addon received message from parent window:', message);

    // GUESTS process messages from the extension
    if (!isHost && roleSelected && message?.type === 'proctorUpdate') {
      console.log('Guest received process update from extension:', message.data);
      // Update connection status
      guestConnectionStatusDiv.textContent = `Status: Connected (Last update: ${new Date().toLocaleTimeString()})`;
      updateStatus(`Process info received (${message.data?.length || 0}). Sending to server...`);

      // Inside Guest logic, when processes are received from extension
      const payload = {
        userId: 'binp000001',  // No way to get the real user ID.
        userName: 'Binbin Peng',  // No way to get the user name.
        processes: message.data || {} // Assuming message.data is empty json.
      };
      console.log('Send the payload to the backend server: (${payload})')

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
            guestConnectionStatusDiv.textContent = `Process info sent (${payload.processes.length}). Waiting for next update...`;
        } else {
            console.error('Server returned error:', data.error);
            guestConnectionStatusDiv.textContent = `Status: Error sending data! ${data.error}`;
            updateStatus('Server Error (POST)');
        }
      })
      .catch(error => {
        console.error('Error POSTing data to server:', error);
        // displayError(`Network error sending data: ${error.message}`);
        updateStatus('Network Error (POST)');
        guestConnectionStatusDiv.textContent = 'Error sending process info.';
      });
    } else if (!isHost && roleSelected && (message?.type === 'daemonError' || message?.type === 'daemonDisconnected')) {
       console.warn('Received daemon status from extension:', message.type, message.data);
       // displayError(`Extension reported: ${message.type} ${message.data || ''}`);
       updateStatus('Extension Error');
       guestConnectionStatusDiv.textContent = `Extension reported an error: ${message.type}.`;
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

