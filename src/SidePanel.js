// SidePanel.js

import { meet } from '@googleworkspace/meet-addons/meet.addons';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, onAuthStateChanged, connectAuthEmulator } from "firebase/auth";
import { getDatabase, onValue, ref, set, serverTimestamp, connectDatabaseEmulator } from "firebase/database";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions"; // If you emulate functions
import { getStorage, connectStorageEmulator } from "firebase/storage"; // If you emulate storage

const CLOUD_PROJECT_NUMBER = '331777483172';
// TODO(binp): Rename to indicate this is the Cloud Function URL.
const FIREBASE_CLOUD_FUNCTION_URL = 'https://process-guest-info-por44kzjjq-uc.a.run.app/process_guest_info';
// const FIREBASE_CLOUD_FUNCTION_URL = 'https://us-central1-interview-proctor.cloudfunctions.net/process_guest_info';
const MEET_Origin_URL = 'https://meet.google.com';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAr5BXnNexqOGuVoXikWZS4hSUKFh8cmDA",
  authDomain: "interview-proctor.firebaseapp.com",
  databaseURL: "https://interview-proctor-default-rtdb.firebaseio.com",
  projectId: "interview-proctor",
  storageBucket: "interview-proctor.firebasestorage.app",
  messagingSenderId: "124879970402",
  appId: "1:124879970402:web:80ce4ae7b862d6be7db13b",
  measurementId: "G-1SCPSVG9F2"
};

// --- Emulator Configuration ---
const USE_EMULATORS = true; // Set to true for local testing, false for production

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded. Initializing Addon with Role Selection and Timeline.');

  // --- DOM References ---
  const statusElement = document.getElementById('status');
  const errorElement = document.getElementById('error-message');
  const collectDataButton = document.getElementById('collect-data-button'); // Add new reference

  const bodyElement = document.body;
  const roleSelectionDiv = document.getElementById('role-selection');
  const hostButton = document.getElementById('host-button');
  // Social login buttons
  const loginSectionDiv = document.getElementById('login-section');
  const loginGoogleButton = document.getElementById('login-google');
  const loginFacebookButton = document.getElementById('login-facebook');
  const loginMicrosoftButton = document.getElementById('login-microsoft');
  const loginErrorMessage = document.getElementById('login-error-message');


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
  let meetingInfo = null;
  let currentGuestData = null; // Store data for the single guest
  let pollIntervalId = null; // For host polling
  let sessionID = null;
  let commandsListenerRef = null; // Variable to store the listener for /commands

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
  // Initialize Firebase Authentication and get a reference to the service
  const auth = getAuth(app);
  const db = getDatabase(app);
  const functions = getFunctions(app); // Initialize Functions
  const storage = getStorage(app); // Initialize Storage
  const googleProvider = new GoogleAuthProvider();
  const facebookProvider = new FacebookAuthProvider();
  // TODO: Add MS Provider

  if (USE_EMULATORS) {
    console.log("Connecting to Firebase Emulators...");
    connectAuthEmulator(auth, "http://localhost:9099");
    connectDatabaseEmulator(db, "localhost", 9000);
    // For Functions, if your FIREBASE_CLOUD_FUNCTION_URL is for a callable function,
    // you'd use connectFunctionsEmulator. If it's a direct HTTP trigger,
    // you'd change FIREBASE_CLOUD_FUNCTION_URL to point to the local functions emulator.
    connectFunctionsEmulator(functions, "localhost", 5001); // For callable functions
    connectStorageEmulator(storage, "localhost", 9199);
  }

  // Create the session and side panel client and hold on them.
  async function setUpAddon() {
    if (session == null) {
      session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });  
    }
    if (sidePanelClient == null) {
      sidePanelClient = await session.createSidePanelClient();
      meetingInfo = await sidePanelClient.getMeetingInfo();
      console.log("Meeting ID:", meetingInfo.meetingId);
      console.log("Meeting Code:", meetingInfo.meetingCode);
    }
  }

  /**
   * Sends a command to the session.
   *
   * @param {string} commandType - The type of command to send (e.g., "collect").
   * @returns {Promise<void>} A promise that resolves when the command has been sent.
   */
  async function sendCommandToSession(commandType) {
    if (!auth.currentUser || !sessionID) {
      console.warn('sendCommandToSession: User not logged in or session not initialized.');
      return;
    }
    const currentTime = serverTimestamp();
    const sessionCommandsRef = ref(db, `sessions/${sessionID}/commands`);
    try {
      await set(sessionCommandsRef, { command: commandType, time: currentTime });
      console.log(`sendCommandToSession: Sent '${commandType}' command to session ${sessionID}`);
    } catch (error) {
      console.error('sendCommandToSession: Error sending command:', error);
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

  /** Updates the Host dashboard based on currentGuestData (CandidateInfo format) */
  function updateHostDashboard() {
    if (!isHost || !roleSelected) return;

    // --- Reset UI if no data ---
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
      // Ensure sections are hidden initially or when data is cleared
      hostProcessesSection.style.display = 'none';
      hostTabsSection.style.display = 'none';
      hostScreenshotSection.style.display = 'none';
      hostTimelineSection.style.display = 'none';
      return;
    }

    // --- Update Header ---
    // Use guestName and collectionTime from CandidateInfo
    hostGuestName.textContent = `Guest: ${currentGuestData.userName || 'Unknown'}`;
    hostLastUpdate.textContent = `Last Update: ${currentGuestData.collectionTime ? new Date(currentGuestData.collectionTime).toLocaleString() : 'N/A'}`; // Use toLocaleString for date+time

    // --- Determine Overall Status ---
    // Start with 'ok', escalate based on findings.
    // Consider the daemon's reported status and error first.
    let overallStatus = 'ok'; // ok, warning, alert
    let overallIcon = '🟢';
    let overallIconClass = 'ok';

    if (currentGuestData.error) {
        overallStatus = 'alert'; // Daemon reported an error
        displayError(`Guest Daemon Error: ${currentGuestData.error}`); // Show daemon error prominently
    } else if (currentGuestData.status && currentGuestData.status !== 'ok' && currentGuestData.status !== 'success') {
        // If daemon status is something other than ok/success, treat as warning (adjust as needed)
        overallStatus = 'warning';
        displayError(null); // Clear previous error if status is just a warning now
    } else {
        displayError(null); // Clear error message if status is ok
    }


    // --- Process Status ---
    const flaggedProcesses = currentGuestData.flaggedProcesses || [];
    hostProcessesList.innerHTML = ''; // Clear previous list
    if (flaggedProcesses.length > 0) {
      hostProcessesStatus.textContent = 'FLAGGED';
      hostProcessesStatus.className = 'status-text warning'; // Treat flagged processes as warning
      flaggedProcesses.forEach(proc => {
          const detail = `${proc.processName} (PID: ${proc.pid || 'N/A'})${proc.title ? ` - ${proc.title}` : ''}`;
          hostProcessesList.appendChild(createListItem(detail));
      });
      hostProcessesSection.style.display = 'block';
      if (overallStatus === 'ok') overallStatus = 'warning'; // Escalate overall status if needed
    } else {
       hostProcessesStatus.textContent = 'OK';
       hostProcessesStatus.className = 'status-text ok';
       hostProcessesList.innerHTML = '<li><i>No flagged processes.</i></li>';
       hostProcessesSection.style.display = 'block'; // Keep section visible even if OK
    }

    // --- Tabs Status ---
    const flaggedTabs = currentGuestData.flaggedTabs || [];
    hostTabsList.innerHTML = ''; // Clear previous list
    if (flaggedTabs.length > 0) {
      hostTabsStatus.textContent = 'FLAGGED';
      hostTabsStatus.className = 'status-text warning'; // Treat flagged tabs as warning
      flaggedTabs.forEach(tab => {
          const detail = `${tab.title || 'Untitled Tab'} - ${tab.url || 'N/A'}`;
          hostTabsList.appendChild(createListItem(detail));
      });
      hostTabsSection.style.display = 'block';
      if (overallStatus === 'ok') overallStatus = 'warning'; // Escalate overall status
    } else {
      hostTabsStatus.textContent = 'OK';
      hostTabsStatus.className = 'status-text ok';
      hostTabsList.innerHTML = '<li><i>No restricted tabs detected.</i></li>';
      hostTabsSection.style.display = 'block'; // Keep section visible even if OK
    }

    // --- Screenshot Status ---
    const screenshots = currentGuestData.screenshot || [];
    hostScreenshotDetails.textContent = ''; // Clear previous details
    if (screenshots.length > 0) {
        hostScreenshotStatus.textContent = 'CAPTURED';
        hostScreenshotStatus.className = 'status-text ok'; // Screenshots themselves aren't necessarily bad
        screenshots.forEach(ss => {
            const detail = `Display ${ss.displayId || 'N/A'}: ${ss.imageSize || ss.originalSize || 'Size unknown'} (${ss.format || 'format unknown'})`;
            // NOTE: Displaying the actual image (ss.imageData) would require creating an <img> tag
            // and setting its src to `data:image/${ss.format};base64,${ss.imageData}`.
            // Be cautious with performance if images are large or frequent.
            // For now, just listing details:
            const p = document.createElement('p');
            p.textContent = detail;
            hostScreenshotDetails.appendChild(p);
        });
        hostScreenshotSection.style.display = 'block';
        // Screenshots don't usually change overall status unless there's a specific rule
    } else {
        hostScreenshotStatus.textContent = 'N/A';
        hostScreenshotStatus.className = 'status-text unknown';
        hostScreenshotDetails.textContent = 'No screenshots received in this update.';
        hostScreenshotSection.style.display = 'block'; // Keep section visible
    }


    // --- Update Timeline (Adapted) ---
    // Use collectionTime and status/error for a simple log entry
    hostTimelineList.innerHTML = ''; // Clear previous timeline (or prepend for history)
    const timestamp = currentGuestData.collectionTime ? new Date(currentGuestData.collectionTime).toLocaleTimeString() : 'No timestamp';
    let logEntry = `Update received. Status: ${currentGuestData.status || 'N/A'}.`;
    if (currentGuestData.error) {
        logEntry += ` Error: ${currentGuestData.error}`;
    } else {
        const issues = [];
        if (flaggedProcesses.length > 0) issues.push(`${flaggedProcesses.length} flagged process(es)`);
        if (flaggedTabs.length > 0) issues.push(`${flaggedTabs.length} flagged tab(s)`);
        if (issues.length > 0) {
            logEntry += ` Issues: ${issues.join(', ')}.`;
        } else {
            logEntry += ` No issues detected.`;
        }
    }

    const li = document.createElement('li');
    const timestampSpan = document.createElement('span');
    const descriptionSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = `[${timestamp}]`;
    descriptionSpan.className = 'description';
    descriptionSpan.textContent = logEntry; // Use textContent
    li.appendChild(timestampSpan);
    li.appendChild(descriptionSpan);
    hostTimelineList.appendChild(li); // Consider prepending: hostTimelineList.prepend(li);
    hostTimelineSection.style.display = 'block';


    // --- Finalize Overall Status Icon ---
    // Set icon based on the final overallStatus determined above
    if (overallStatus === 'alert') {
        overallIcon = '🔴'; overallIconClass = 'alert';
    } else if (overallStatus === 'warning') {
        overallIcon = '🟡'; overallIconClass = 'warning';
    } else { // ok
        overallIcon = '🟢'; overallIconClass = 'ok';
    }
    hostOverallStatusIcon.textContent = overallIcon;
    hostOverallStatusIcon.className = `status-icon ${overallIconClass}`;
  }

  // --- Function to Fetch the CandidateInfo Data from the candidate side for Host ---
  let hostCandidatesListenerRef = null; // Variable to store the listener for /sessions/sessionID/candidates/

  function subscribeToCandidateUpdates() {
    if (!isHost || !roleSelected || !sessionID) {
      console.warn("Host subscribe skipped: Conditions not met (isHost, roleSelected, sessionID).");
      return;
    }

    console.log(`Host subscribing to candidate updates for session: ${sessionID}`);
    updateStatus('Host mode subscribing to candidate updates...');

    const candidatesRef = ref(db, `sessions/${sessionID}/candidates`);

    // Detach previous listener if it exists
    if (hostCandidatesListenerRef) {
      hostCandidatesListenerRef();
      console.log('Firebase: Detached previous host candidates listener.');
      hostCandidatesListenerRef = null; // Clear the reference
    }

    // Attach the new listener
    hostCandidatesListenerRef = onValue(candidatesRef, (snapshot) => {
      console.log("Firebase: Received candidate updates:", snapshot.val());
      const candidatesData = snapshot.val();
      if (candidatesData) {
        // Assuming candidatesData is an object where each key is a candidate's UID
        Object.keys(candidatesData).forEach(candidateUID => {
          const candidateNode = candidatesData[candidateUID];
          if (candidateNode && candidateNode.updates) {
            // candidateNode.updates is an object where keys are random Firebase push IDs
            // We usually want the latest update. Firebase push IDs are chronologically sortable.
            const updateKeys = Object.keys(candidateNode.updates).sort(); // Sort to get them in order
            if (updateKeys.length > 0) {
              const latestUpdateKey = updateKeys[updateKeys.length - 1]; // Get the last (latest) key
              currentGuestData = candidateNode.updates[latestUpdateKey]; // This is your CandidateInfo
              console.log(`Latest update for ${candidateUID}:`, currentGuestData);
              updateHostDashboard(); // Update the UI with the latest data
            }
          }
        });
      } else {
        currentGuestData = null; // No candidates or no data
        updateHostDashboard(); // Clear or reset the dashboard
      }
    }, (error) => {
      console.error('Firebase: Error listening for candidate updates:', error);
      displayError(`Error listening for candidate updates: ${error.message}`);
    });
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
    displayError(null); // Clear any previous general errors

    // Explicitly hide role selection now that a role is chosen.
    // Login section is already hidden because the user must be logged in to see role selection.
    roleSelectionDiv.style.display = 'none';

    // Manage body classes correctly to show appropriate content section
    // and ensure 'logged-in' class (set by onAuthStateChanged) is preserved.
    bodyElement.classList.add('role-selected');
    if (isHost) {
      bodyElement.classList.add('host-mode');
      bodyElement.classList.remove('guest-mode'); // Ensure other mode is not active
      // --- Firebase Realtime Database Operations for Host ---
      const user = auth.currentUser;
      if (user && meetingInfo) {
        const userID = user.uid;
        const userName = user.displayName || 'Unknown Host'; // Fallback for userName
        // TODO(binp): Remove this fake sessionID which is for testing only now.
        sessionID = "ee1e9e3d-b56f-47d1-81e6-37c1e5a69703"
        // sessionID = crypto.randomUUID(); // Generate UUID for session
        const currentTime = serverTimestamp(); // Use server-side timestamp

        // 1. Write to /users/userID/sessions/sessionID
        const userSessionRef = ref(db, `users/${userID}/sessions/${sessionID}`);
        set(userSessionRef, {
          startTime: currentTime,
          meetingId: meetingInfo.meetingId,
          meetingCode: meetingInfo.meetingCode,
          role: "interviewer"
        }).catch(error => console.error("Firebase: Error writing user session data:", error));

        // 2. Write to /sessions/sessionID/commands once during the starting.

        // 3. Write to /sessions/sessionID/interviewers/userID
        const sessionInterviewerRef = ref(db, `sessions/${sessionID}/interviewers/${userID}`);
        set(sessionInterviewerRef, {
          name: userName,
          joinTime: currentTime
        }).catch(error => console.error("Firebase: Error writing interviewer data:", error));

        console.log(`Firebase: Host data written for session ${sessionID}`);
      } else {
        console.warn("Firebase: User not logged in or meetingInfo not available, skipping host data write.");
      }
      // --- End Firebase Operations ---

      // Ensure the button is visible in host mode
      if (collectDataButton) {
        collectDataButton.style.display = 'block'; // Show the button
      }

    } else {
      bodyElement.classList.add('guest-mode');
      bodyElement.classList.remove('host-mode'); // Ensure other mode is not active
    }

    if (meetingInfo) {
      console.log("meetingId: ", meetingInfo.meetingId, " meetingCode: ", meetingInfo.meetingCode);
    } else {
      console.log("meetingInfo is still null");
    }

    updateStatus('Initializing codoing session...');

    try {
      console.log('Make sure the sidePanelClient has initialized...');
      // Use the stored sdkInstance from registerSdk()
      if (!sidePanelClient) {
        console.log("The addon session and side panel has not been initialed. doing now...")
        await setUpAddon();
      }
      console.log('The side panel has started/joined.');

      if (isHost) {
        sidePanelClient.startActivity({
          sidePanelUrl: "https://binp.github.io/addon/src/SidePanel.html",
          additionalData: JSON.stringify({
            "sessionID": sessionID
          })
        });
        // Inside Host logic in startSelectedMode, after setting isHost=true
        updateStatus('Host mode active. Fetching initial data...');
        updateHostDashboard();
        subscribeToCandidateUpdates(); // Start the real-time listener
      } else {
        // GUEST: Send 'addonOpened' message to the window.top.
        console.log("Guest sending 'addonOpened' message to target:", MEET_Origin_URL);
        window.top.postMessage({ type: 'addonOpened' }, MEET_Origin_URL);

        // Set initial guest status text.
        guestConnectionStatusDiv.textContent = 'Status: Waiting for connection from extension...';
        updateStatus('Guest mode active.');
        // Set placeholder links (REPLACE with actual URLs)
        extensionLink.href = 'https://binp.github.io'; // TODO: Replace with Chrome Web Store link
        daemonLink.href = 'https://binp.github.io'; // TODO: Replace with Daemon download link

        // Get the sessionID from the startActivity message.
        // const startingState = client.getActivityStartingState();
        // const additionalData = JSON.parse(startingState.additionalData);
        // sessionID = additionalData.sessionID
        // TODO(binp): Remove this fake sessionID which is for testing only now.
        sessionID = "ee1e9e3d-b56f-47d1-81e6-37c1e5a69703"

        // Firebase Realtime Database Operations for Guest
        if (sessionID) {
          console.log(`Firebase: Setting up listener for session commands in session: ${sessionID}`);
          const sessionCommandsRef = ref(db, `sessions/${sessionID}/commands`);

          commandsListenerRef = onValue(sessionCommandsRef, (snapshot) => {
            if (snapshot.exists()) {
              const command = snapshot.val().command; // Get command value
              console.log(`Firebase: Received command: ${command}`);
              if (command === 'collect') {
                console.log(`Firebase: Sending 'collectData' message to the extension.`);
                // Send a message to the Chrome extension to collect data
                window.top.postMessage({ type: 'collectNow' }, MEET_Origin_URL);
              }
            } else {
              console.log(`Firebase: No data at /sessions/${sessionID}/commands`);
            }
          }, (error) => {
            console.error('Firebase: Error listening for commands:', error);
            displayError(`Error listening for commands: ${error.message}`);
          });
        } else {
          console.warn("Firebase: sessionID is not available. Cannot set up the listener for commands.");
        }
      }

      if (isHost) {
         updateStatus(`Host mode listening. Fetching initial data...`);
      } else {
         updateStatus(`Guest mode waiting for command...`);
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
      console.log('Guest received process update from extension:', message.payload);
      // Update connection status
      guestConnectionStatusDiv.textContent = `Status: Connected (Last update: ${new Date().toLocaleTimeString()})`;
      updateStatus(`Process info received (${message.payload?.length || 0}). Sending to server...`);

       // Inside Guest logic, when processes are received from extension
       const candidateInfo = message.payload.candidateInfo
      const currentUser = auth.currentUser;
      if (currentUser && meetingInfo) {
        // TODO(binp): Remove this fake userId which is only for testing.
        // candidateInfo.userId = currentUser.uid;
        candidateInfo.userId = "99kknnViFDPkjMuW68JmSqPbLa99"
        candidateInfo.userName = currentUser.displayName || 'Unknown Guest';
        candidateInfo.sessionId = sessionID;
        candidateInfo.meetingId = meetingInfo.meetingId;
        candidateInfo.meetingCode = meetingInfo.meetingCode;
      } else {
        // Fallback or error handling if user or meetingInfo is not available
        console.warn("Guest: User not logged in or meetingInfo not available for enriching candidateInfo.");
        candidateInfo.userId = 'guest_fallback_uid'; // Provide a fallback
        candidateInfo.userName = 'Unknown Guest';
        candidateInfo.sessionId = 'ee1e9e3d-b56f-47d1-81e6-37c1e5a69703';
        candidateInfo.meetingId = meetingInfo?.meetingId || 'unknown_meeting_id';
        candidateInfo.meetingCode = meetingInfo?.meetingCode || 'unknown_meeting_code';
      }

      console.log('Send the payload to the backend server: ', candidateInfo)
      // Adjust FIREBASE_CLOUD_FUNCTION_URL if using Functions emulator for HTTP triggers
      const functionUrl = USE_EMULATORS
        ? `http://localhost:5001/${firebaseConfig.projectId}/us-central1/process_guest_info` // Adjust region and function name as needed
        : FIREBASE_CLOUD_FUNCTION_URL;
      fetch(functionUrl, {
        method: 'POST',
        mode: 'cors', // Required for cross-origin requests
        cache: 'no-cache',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(candidateInfo)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
            console.log('Successfully POSTed data to server:', data);
            updateStatus(`Guest info sent.`);
            guestConnectionStatusDiv.textContent = `Guest info sent. Waiting for next update...`;
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

  // --- Firebase Auth Listeners ---
  // Listen to the state change in the auth to know if user is signed in or not.
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is signed in, see docs for a list of available properties
      // https://firebase.google.com/docs/reference/js/auth.user
      console.log('User is signed in:', user);
      displayLoginError(null); // Clear any previous login errors
      bodyElement.classList.add('logged-in'); // Add class for CSS rules (e.g., to hide login section)

      loginSectionDiv.style.display = 'none';   // Explicitly hide login section
      roleSelectionDiv.style.display = 'flex';  // Explicitly show role selection (uses flex for its layout)

      // Proceed to initialize the addon
      await setUpAddon();
      // Set default value of the status
      updateStatus('Please select your role above.'); // Status when role selection is shown
    } else {
      // User is signed out
      console.log('User is signed out');
      bodyElement.classList.remove('logged-in'); // Remove class
      // Also remove role-specific classes if the user signs out after selecting a role
      bodyElement.classList.remove('role-selected', 'host-mode', 'guest-mode');

      loginSectionDiv.style.display = 'flex';   // Explicitly show login section (uses flex for its layout)
      roleSelectionDiv.style.display = 'none';  // Explicitly hide role selection
      updateStatus('Please log in to continue.'); // Status when login is shown
    }
  });

  // Helper to show/hide login error messages
  function displayLoginError(text) {
    if (text) {
      loginErrorMessage.textContent = text;
      loginErrorMessage.style.display = 'block';
    } else {
      loginErrorMessage.textContent = '';
      loginErrorMessage.style.display = 'none';
    }
  }

  // Handle Google Sign-In
  loginGoogleButton.addEventListener('click', () => {
    signInWithPopup(auth, googleProvider)
      .then((result) => {
        // This gives you a Google Access Token. You can use it to access the Google API.
        // const credential = GoogleAuthProvider.credentialFromResult(result);
        // const token = credential.accessToken;
        const user = result.user;
        console.log('Google sign-in successful:', user);
      }).catch((error) => {
        console.error('Google sign-in error:', error);
        displayLoginError('Google login failed. ' + error.message);
      });
  });

  // Handle Facebook Sign-In
  loginFacebookButton.addEventListener('click', () => {
    signInWithPopup(auth, facebookProvider)
      .then((result) => {
        // const credential = FacebookAuthProvider.credentialFromResult(result);
        // const token = credential.accessToken;
        const user = result.user;
        console.log('Facebook sign-in successful:', user);
      }).catch((error) => {
        console.error('Facebook sign-in error:', error);
        displayLoginError('Facebook login failed. ' + error.message);
      });
  });

  // TODO: Handle Microsoft Sign-In

  // --- Initialization & Event Listeners ---
  hostButton.addEventListener('click', () => startSelectedMode(true));
  guestButton.addEventListener('click', () => startSelectedMode(false));
  window.addEventListener('message', handleMessage);
  setUpAddon(); // Complete the set up of the addon and create session, and sidePanelClient.

  // Event listener for the "Collect Data" button
  if (collectDataButton) {
    collectDataButton.addEventListener('click', () => sendCommandToSession('collect'));
  }

  // Remember to clear the interval on unload or if mode changes
  window.addEventListener('unload', () => {
    window.removeEventListener('message', handleMessage);
    // Detach the command listener if it was set up
    if (commandsListenerRef) {
      try {
        commandsListenerRef(); // Detach the listener
        console.log('Firebase: Removed command listener for session.');
        commandsListenerRef = null; // Clear the reference
      } catch (error) {
        console.error('Firebase: Error removing command listener:', error);
      }
    }
    // Detach the host candidates listener if it was set up
    if (hostCandidatesListenerRef) {
      try {
        hostCandidatesListenerRef(); // Detach the listener
        console.log('Firebase: Removed host candidates listener.');
        hostCandidatesListenerRef = null; // Clear the reference
      } catch (error) {
        console.error('Firebase: Error removing host candidates listener:', error);
      }
    }
    if (app){
      deleteApp(app).then(() => {
         console.log("App deleted");
       });
    }
    if (pollIntervalId) clearInterval(pollIntervalId);   // Clear polling on unload
  });

}); // End DOMContentLoaded listener
