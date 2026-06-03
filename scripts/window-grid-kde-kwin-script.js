var WINDOW_GRID_KDE_SERVICE = "com.anthony.WindowGridKDE";
var WINDOW_GRID_KDE_PATH = "/WindowGridKDE";
var WINDOW_GRID_KDE_INTERFACE = "com.anthony.WindowGridKDE";

var selectedWindowsById = {};
var knownWindowsById = {};
var isWaitingForMoveRequest = false;

function valueOrEmpty(value) {
    return value === undefined || value === null ? "" : String(value);
}

function normalizeId(value) {
    return valueOrEmpty(value).replace(/[{}]/g, "").trim();
}

function getWindowIdentifier(window) {
    if (window.internalId !== undefined && window.internalId !== null) {
        return { value: String(window.internalId), source: "internalId" };
    }
    if (window.windowId !== undefined && window.windowId !== null) {
        return { value: String(window.windowId), source: "windowId" };
    }
    return { value: String(window), source: "String(window)" };
}

function getWindowIdValue(window) {
    if (window.windowId !== undefined && window.windowId !== null) {
        return String(window.windowId);
    }
    return "";
}

function getDesktopIds(window) {
    var desktopIds = [];
    var desktops = window.desktops || [];
    for (var i = 0; i < desktops.length; i += 1) {
        var d = desktops[i];
        if (d && d.id !== undefined && d.id !== null) {
            desktopIds.push(String(d.id));
        }
    }
    return desktopIds;
}

function describeDesktopList(desktops) {
    var ids = [];
    var names = [];
    var list = desktops || [];
    for (var i = 0; i < list.length; i += 1) {
        var d = list[i];
        if (d) { ids.push(valueOrEmpty(d.id)); names.push(valueOrEmpty(d.name)); }
    }
    return "ids=[" + ids.join(",") + "], names=[" + names.join(",") + "]";
}

function safeReadProperty(object, propertyName) {
    try { return valueOrEmpty(object[propertyName]); }
    catch (e) { return "ERROR:" + e; }
}

function arraysEqual(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (var i = 0; i < left.length; i += 1) {
        if (String(left[i]) !== String(right[i])) return false;
    }
    return true;
}

function readActivitiesArray(window) {
    try {
        if (window.activities !== undefined && window.activities !== null) {
            return window.activities;
        }
    } catch (e) {
        print("Window Grid KDE: readActivitiesArray activities error=" + e);
    }
    try {
        if (window.activityList !== undefined && window.activityList !== null) {
            return window.activityList;
        }
    } catch (e) {
        print("Window Grid KDE: readActivitiesArray activityList error=" + e);
    }
    return [];
}

function describeActivities(window) {
    var acts = readActivitiesArray(window);
    if (!acts || acts.length === undefined) return valueOrEmpty(acts);
    var parts = [];
    for (var i = 0; i < acts.length; i += 1) {
        parts.push(valueOrEmpty(acts[i]));
    }
    return "[" + parts.join(",") + "]";
}

function callbackArgsToString(args) {
    try { return JSON.stringify(args); }
    catch (e) { return String(args); }
}

function findDesktopById(desktopId) {
    var desktops = workspace.desktops || [];
    for (var i = 0; i < desktops.length; i += 1) {
        var d = desktops[i];
        if (d && String(d.id) === String(desktopId)) return d;
    }
    return null;
}

function findWindowById(windowId) {
    var normalizedRequest = normalizeId(windowId);
    var selectedWindow = selectedWindowsById[normalizedRequest] || selectedWindowsById[windowId];

    if (selectedWindow) {
        print("Window Grid KDE: matched selectedWindowsById for id=" + normalizedRequest + " caption=" + valueOrEmpty(selectedWindow.caption));
        return selectedWindow;
    }

    var knownWindow = knownWindowsById[normalizedRequest] || knownWindowsById[windowId];
    if (knownWindow) {
        print("Window Grid KDE: matched knownWindowsById for id=" + normalizedRequest);
        return knownWindow;
    }

    var windows = workspace.stackingOrder || [];
    print("Window Grid KDE: searching stackingOrder count=" + String(windows.length));

    for (var i = 0; i < windows.length; i += 1) {
        var w = windows[i];
        var identifier = getWindowIdentifier(w);
        var rawInternalId = valueOrEmpty(w.internalId);
        var normInternalId = normalizeId(rawInternalId);
        var rawWindowId = getWindowIdValue(w);
        var normWindowId = normalizeId(rawWindowId);

        print("Window Grid KDE: candidate caption=" + valueOrEmpty(w.caption) +
            " internalId=" + rawInternalId + " norm=" + normInternalId +
            " windowId=" + rawWindowId + " norm=" + normWindowId +
            " resourceClass=" + valueOrEmpty(w.resourceClass));

        if (normalizedRequest === normInternalId || normalizedRequest === normWindowId) {
            knownWindowsById[normalizedRequest] = w;
            knownWindowsById[identifier.value] = w;
            return w;
        }
    }
    return null;
}

function freshWindowLookup(normalizedWindowId) {
    var windows = workspace.stackingOrder || [];
    for (var i = 0; i < windows.length; i += 1) {
        var w = windows[i];
        var normInternalId = normalizeId(valueOrEmpty(w.internalId));
        var normWindowId = normalizeId(getWindowIdValue(w));
        if (normalizedWindowId === normInternalId || normalizedWindowId === normWindowId) {
            return w;
        }
    }
    return null;
}

function logAllCandidateWindowIds() {
    var windows = workspace.stackingOrder || [];
    var parts = [];
    for (var i = 0; i < windows.length; i += 1) {
        var w = windows[i];
        parts.push(valueOrEmpty(w.caption) +
            " internalId=" + valueOrEmpty(w.internalId) +
            " norm=" + normalizeId(w.internalId) +
            " windowId=" + getWindowIdValue(w) +
            " norm=" + normalizeId(getWindowIdValue(w)) +
            " resourceClass=" + valueOrEmpty(w.resourceClass));
    }
    print("Window Grid KDE: all candidate window IDs: " + parts.join(" | "));
}

function logDesktopList() {
    var desktops = workspace.desktops || [];
    var parts = [];
    for (var i = 0; i < desktops.length; i += 1) {
        var d = desktops[i];
        parts.push(String(i + 1) + ":" + d.name + "(" + d.id + ")");
    }
    print("Window Grid KDE: available desktops: " + parts.join(", "));
}

function getCurrentWorkspaceActivity() {
    try {
        var act = workspace.currentActivity;
        if (act !== undefined && act !== null) return String(act);
    } catch (e) {
        print("Window Grid KDE: workspace.currentActivity error=" + e);
    }
    return "";
}

function getCurrentWorkspaceDesktop() {
    try {
        var d = workspace.currentDesktop;
        if (d !== undefined && d !== null) {
            return valueOrEmpty(d.id) + "/" + valueOrEmpty(d.name);
        }
    } catch (e) {
        print("Window Grid KDE: workspace.currentDesktop error=" + e);
    }
    return "unknown";
}

// Log specific diagnostic properties: onAllActivities, isOnAllActivities, activities, activity, skipTaskbar, desktopFileName
function logActivityDiagnostics(window, tag) {
    var onAllActivities = safeReadProperty(window, "onAllActivities");
    var isOnAllActivities = safeReadProperty(window, "isOnAllActivities");
    var activities = safeReadProperty(window, "activities");
    var activity = safeReadProperty(window, "activity");
    var skipTaskbar = safeReadProperty(window, "skipTaskbar");
    var desktopFileName = safeReadProperty(window, "desktopFileName");
    print("Window Grid KDE: " + tag + " onAllActivities=" + onAllActivities +
        " isOnAllActivities=" + isOnAllActivities +
        " activities=" + activities +
        " activity=" + activity);
    print("Window Grid KDE: " + tag + " skipTaskbar=" + skipTaskbar +
        " desktopFileName=" + desktopFileName);
}

function checkAndLogActivityStatus(label, window, targetActivityId, currentWorkspaceActivity) {
    var acts = readActivitiesArray(window);
    var onCurrent = false;
    var onTarget = false;
    var actStrings = [];

    for (var i = 0; i < acts.length; i += 1) {
        var a = String(acts[i]);
        actStrings.push(a);
        if (a === String(currentWorkspaceActivity)) onCurrent = true;
        if (a === String(targetActivityId)) onTarget = true;
    }

    var onAll = actStrings.length === 0;
    var onAllRaw = safeReadProperty(window, "onAllActivities");
    var isOnAllRaw = safeReadProperty(window, "isOnAllActivities");
    if (onAllRaw === "true") onAll = true;

    print("Window Grid KDE: [STATUS:" + label + "] acts=[" + actStrings.join(",") + "]" +
        " | onCurrentActivity=" + onCurrent +
        " | onTargetActivity=" + onTarget +
        " | onAllActivities(computed)=" + onAll +
        " | onAllActivities(raw)=" + onAllRaw +
        " | isOnAllActivities(raw)=" + isOnAllRaw);
    print("Window Grid KDE: [STATUS:" + label + "] desktops=" + describeDesktopList(window.desktops));
}

// Fresh lookup from workspace.stackingOrder, log activity state and diagnosis
function verifyActivityAssignment(label, normalizedWindowId, targetActivityId, currentActivityId, requestId) {
    var tag = "[VERIFY:" + label + ":REQ:" + requestId + "]";

    print("Window Grid KDE: " + tag + " starting fresh stackingOrder lookup for id=" + normalizedWindowId);

    var freshWindow = freshWindowLookup(normalizedWindowId);

    if (!freshWindow) {
        print("Window Grid KDE: " + tag + " FRESH LOOKUP FAILED - window not in stackingOrder (closed or unmapped)");
        print("Window Grid KDE: " + tag + " CONCLUSION: cannot verify - window unavailable");
        return;
    }

    print("Window Grid KDE: " + tag + " fresh window found caption=" + valueOrEmpty(freshWindow.caption));

    var acts = readActivitiesArray(freshWindow);
    var actStrings = [];
    var onCurrent = false;
    var onTarget = false;

    for (var i = 0; i < acts.length; i += 1) {
        var a = String(acts[i]);
        actStrings.push(a);
        if (a === String(currentActivityId)) onCurrent = true;
        if (a === String(targetActivityId)) onTarget = true;
    }

    var onAllRaw = safeReadProperty(freshWindow, "onAllActivities");
    var isOnAllRaw = safeReadProperty(freshWindow, "isOnAllActivities");
    var onAll = actStrings.length === 0 || onAllRaw === "true";

    var freshDesktopDesc = describeDesktopList(freshWindow.desktops);
    print("Window Grid KDE: " + tag + " fresh activities=[" + actStrings.join(",") + "]");
    print("Window Grid KDE: " + tag + " fresh desktops=" + freshDesktopDesc);
    print("Window Grid KDE: " + tag + " fresh onAllActivities=" + onAllRaw + " isOnAllActivities=" + isOnAllRaw);
    print("Window Grid KDE: " + tag + " STATUS: onCurrent=" + onCurrent + " onTarget=" + onTarget + " onAll=" + onAll);

    if (onAll) {
        print("Window Grid KDE: " + tag + " DIAGNOSIS: window is on ALL activities — activities property may be COSMETIC; KWin backend reset to all-activities or assignment was ignored");
    } else if (onTarget && !onCurrent) {
        print("Window Grid KDE: " + tag + " DIAGNOSIS: window is ONLY on target activity — KWin backend membership CHANGED successfully");
    } else if (onTarget && onCurrent) {
        print("Window Grid KDE: " + tag + " DIAGNOSIS: window is on BOTH current and target — two-phase partial; may need to remove current");
    } else if (onCurrent && !onTarget) {
        print("Window Grid KDE: " + tag + " DIAGNOSIS: window is still on OLD activity only — activities property is COSMETIC; KWin backend did NOT change");
    } else if (actStrings.length > 0) {
        print("Window Grid KDE: " + tag + " DIAGNOSIS: window is on unexpected activities=[" + actStrings.join(",") + "] — neither current nor target");
    } else {
        print("Window Grid KDE: " + tag + " DIAGNOSIS: activities array empty (on all?) — inconclusive");
    }
}

function tryActivityAssignment(targetWindow, activityId, currentWorkspaceActivity, tag) {
    var targetIdStr = String(activityId);
    var currentIdStr = String(currentWorkspaceActivity);

    // Strategy 1: direct [String(activityId)]
    print("Window Grid KDE: " + tag + " [STRAT-1] activities=[String(activityId)]");
    try {
        targetWindow.activities = [targetIdStr];
        var r1 = readActivitiesArray(targetWindow);
        print("Window Grid KDE: " + tag + " [STRAT-1] immediately after: acts=" + describeActivities(targetWindow) + " onAllActivities=" + safeReadProperty(targetWindow, "onAllActivities"));
        if (arraysEqual(r1, [targetIdStr])) {
            print("Window Grid KDE: " + tag + " [STRAT-1] READ-BACK matches target — awaiting backend verification");
            return true;
        }
        print("Window Grid KDE: " + tag + " [STRAT-1] read-back did not match. actual=[" + r1.join(",") + "]");
    } catch (e) {
        print("Window Grid KDE: " + tag + " [STRAT-1] error: " + e);
    }

    // Strategy 2: two-phase — set [current+target] then [target]
    print("Window Grid KDE: " + tag + " [STRAT-2] two-phase [current,target] -> [target]");
    try {
        if (currentIdStr.length > 0 && currentIdStr !== targetIdStr) {
            targetWindow.activities = [currentIdStr, targetIdStr];
            print("Window Grid KDE: " + tag + " [STRAT-2] phase-1 acts=" + describeActivities(targetWindow) + " onAllActivities=" + safeReadProperty(targetWindow, "onAllActivities"));
        }
        targetWindow.activities = [targetIdStr];
        var r2 = readActivitiesArray(targetWindow);
        print("Window Grid KDE: " + tag + " [STRAT-2] phase-2 acts=" + describeActivities(targetWindow) + " onAllActivities=" + safeReadProperty(targetWindow, "onAllActivities"));
        if (arraysEqual(r2, [targetIdStr])) {
            print("Window Grid KDE: " + tag + " [STRAT-2] READ-BACK matches target — awaiting backend verification");
            return true;
        }
        print("Window Grid KDE: " + tag + " [STRAT-2] read-back did not match. actual=[" + r2.join(",") + "]");
    } catch (e) {
        print("Window Grid KDE: " + tag + " [STRAT-2] error: " + e);
    }

    // Strategy 3: activityList
    print("Window Grid KDE: " + tag + " [STRAT-3] activityList=[String(activityId)]");
    try {
        targetWindow.activityList = [targetIdStr];
        var r3 = readActivitiesArray(targetWindow);
        print("Window Grid KDE: " + tag + " [STRAT-3] acts=" + describeActivities(targetWindow));
        if (arraysEqual(r3, [targetIdStr])) {
            print("Window Grid KDE: " + tag + " [STRAT-3] READ-BACK matches");
            return true;
        }
    } catch (e) {
        print("Window Grid KDE: " + tag + " [STRAT-3] error: " + e);
    }

    // Strategy 4: setOnActivities
    print("Window Grid KDE: " + tag + " [STRAT-4] typeof setOnActivities=" + typeof targetWindow.setOnActivities);
    if (typeof targetWindow.setOnActivities === "function") {
        try {
            targetWindow.setOnActivities([targetIdStr]);
            var r4 = readActivitiesArray(targetWindow);
            print("Window Grid KDE: " + tag + " [STRAT-4] acts=" + describeActivities(targetWindow));
            if (arraysEqual(r4, [targetIdStr])) {
                print("Window Grid KDE: " + tag + " [STRAT-4] READ-BACK matches");
                return true;
            }
        } catch (e) {
            print("Window Grid KDE: " + tag + " [STRAT-4] error: " + e);
        }
    }

    // Strategy 5: setOnActivity
    print("Window Grid KDE: " + tag + " [STRAT-5] typeof setOnActivity=" + typeof targetWindow.setOnActivity);
    if (typeof targetWindow.setOnActivity === "function") {
        try {
            targetWindow.setOnActivity(targetIdStr, true);
            var currentAfterAdd = readActivitiesArray(targetWindow);
            for (var si = 0; si < currentAfterAdd.length; si += 1) {
                var removeAct = String(currentAfterAdd[si]);
                if (removeAct !== targetIdStr) {
                    targetWindow.setOnActivity(removeAct, false);
                }
            }
            var r5 = readActivitiesArray(targetWindow);
            print("Window Grid KDE: " + tag + " [STRAT-5] after cleanup acts=" + describeActivities(targetWindow));
            if (arraysEqual(r5, [targetIdStr])) {
                print("Window Grid KDE: " + tag + " [STRAT-5] READ-BACK matches");
                return true;
            }
        } catch (e) {
            print("Window Grid KDE: " + tag + " [STRAT-5] error: " + e);
        }
    }

    // Strategy 6: workspace.sendWindowToActivity
    print("Window Grid KDE: " + tag + " [STRAT-6] typeof workspace.sendWindowToActivity=" + typeof workspace.sendWindowToActivity);
    if (typeof workspace.sendWindowToActivity === "function") {
        try {
            workspace.sendWindowToActivity(targetWindow, targetIdStr);
            var r6 = readActivitiesArray(targetWindow);
            print("Window Grid KDE: " + tag + " [STRAT-6] acts=" + describeActivities(targetWindow));
            if (arraysEqual(r6, [targetIdStr])) {
                print("Window Grid KDE: " + tag + " [STRAT-6] READ-BACK matches");
                return true;
            }
        } catch (e) {
            print("Window Grid KDE: " + tag + " [STRAT-6] error: " + e);
        }
    }

    print("Window Grid KDE: " + tag + " [ALL-STRATS-FAILED] final acts=" + describeActivities(targetWindow) + " onAllActivities=" + safeReadProperty(targetWindow, "onAllActivities"));
    return false;
}

function scheduleActivityVerification(normalizedWindowId, activityId, currentWorkspaceActivity, requestId) {
    var capturedWinId = normalizedWindowId;
    var capturedActivityId = activityId;
    var capturedCurrentActivity = currentWorkspaceActivity;
    var capturedRequestId = requestId;

    if (typeof callDBus !== "function") {
        print("Window Grid KDE: [VERIFY] callDBus unavailable, skipping timed verification");
        return;
    }

    callDBus(
        WINDOW_GRID_KDE_SERVICE, WINDOW_GRID_KDE_PATH, WINDOW_GRID_KDE_INTERFACE,
        "Sleep", capturedRequestId, capturedWinId, "500",
        function(retReqId, retWinId) {
            print("Window Grid KDE: [VERIFY:500ms] workspace.currentActivity=" + getCurrentWorkspaceActivity() +
                " workspace.currentDesktop=" + getCurrentWorkspaceDesktop());
            verifyActivityAssignment("500ms", retWinId, capturedActivityId, capturedCurrentActivity, retReqId);

            callDBus(
                WINDOW_GRID_KDE_SERVICE, WINDOW_GRID_KDE_PATH, WINDOW_GRID_KDE_INTERFACE,
                "Sleep", retReqId, retWinId, "1500",
                function(retReqId2, retWinId2) {
                    print("Window Grid KDE: [VERIFY:2000ms] workspace.currentActivity=" + getCurrentWorkspaceActivity() +
                        " workspace.currentDesktop=" + getCurrentWorkspaceDesktop());
                    verifyActivityAssignment("2000ms", retWinId2, capturedActivityId, capturedCurrentActivity, retReqId2);
                }
            );
        }
    );
}

function moveKnownWindowToActivityAndDesktop(windowId, activityId, desktopId, requestId) {
    var normalizedWindowId = normalizeId(windowId);
    var tag = "[REQ:" + requestId + "]";
    var isActivityOnly = activityId && !desktopId;

    print("Window Grid KDE: " + tag + " windowId=" + windowId + " normalizedWindowId=" + normalizedWindowId);
    print("Window Grid KDE: " + tag + " activityId=" + activityId + " desktopId=" + desktopId + " isActivityOnly=" + isActivityOnly);

    if (!windowId) {
        print("Window Grid KDE: " + tag + " empty windowId (timeout or empty request), continuing to wait");
        waitForMoveRequests();
        return;
    }

    var targetWindow = findWindowById(normalizedWindowId);

    if (!targetWindow) {
        print("Window Grid KDE: " + tag + " no window found for id=" + normalizedWindowId);
        logAllCandidateWindowIds();
        waitForMoveRequests();
        return;
    }

    var targetDesktop = null;

    if (desktopId) {
        targetDesktop = findDesktopById(desktopId);
        if (!targetDesktop) {
            print("Window Grid KDE: " + tag + " no desktop found for id=" + desktopId);
            logDesktopList();
            if (!activityId) {
                waitForMoveRequests();
                return;
            }
            print("Window Grid KDE: " + tag + " continuing with activity-only since desktop not found");
        }
    }

    var currentWorkspaceActivity = getCurrentWorkspaceActivity();
    var currentWorkspaceDesktop = getCurrentWorkspaceDesktop();

    print("Window Grid KDE: " + tag + " window caption=" + valueOrEmpty(targetWindow.caption));
    print("Window Grid KDE: " + tag + " currentWorkspaceActivity=" + currentWorkspaceActivity);
    print("Window Grid KDE: " + tag + " currentWorkspaceDesktop=" + currentWorkspaceDesktop);
    if (targetDesktop) {
        print("Window Grid KDE: " + tag + " targetDesktop=" + valueOrEmpty(targetDesktop.id) + "/" + valueOrEmpty(targetDesktop.name));
    }
    print("Window Grid KDE: " + tag + " targetActivity=" + activityId);
    print("Window Grid KDE: " + tag + " window desktops before=" + describeDesktopList(targetWindow.desktops));

    logActivityDiagnostics(targetWindow, tag + "[BEFORE]");
    checkAndLogActivityStatus("BEFORE", targetWindow, activityId, currentWorkspaceActivity);

    if (activityId) {
        var activityMoveSucceeded = false;

        // ORDER A: activity first, then desktop
        print("Window Grid KDE: " + tag + " [ORDER-A] activity first");
        activityMoveSucceeded = tryActivityAssignment(targetWindow, activityId, currentWorkspaceActivity, tag + "[ORDER-A]");
        logActivityDiagnostics(targetWindow, tag + "[AFTER-ORDER-A-ACTIVITY]");
        checkAndLogActivityStatus("AFTER-ORDER-A-ACTIVITY", targetWindow, activityId, currentWorkspaceActivity);

        if (targetDesktop) {
            try {
                targetWindow.desktops = [targetDesktop];
                print("Window Grid KDE: " + tag + " [ORDER-A] desktops set: " + describeDesktopList(targetWindow.desktops));
            } catch (e) {
                print("Window Grid KDE: " + tag + " [ORDER-A] desktop set error: " + e);
            }
        }

        logActivityDiagnostics(targetWindow, tag + "[AFTER-ORDER-A-DESKTOP]");
        checkAndLogActivityStatus("AFTER-ORDER-A-DESKTOP", targetWindow, activityId, currentWorkspaceActivity);

        if (!activityMoveSucceeded) {
            print("Window Grid KDE: " + tag + " [ORDER-B] activity failed in ORDER-A, fallback: desktop first");
            if (targetDesktop) {
                try {
                    targetWindow.desktops = [targetDesktop];
                    print("Window Grid KDE: " + tag + " [ORDER-B] desktops set: " + describeDesktopList(targetWindow.desktops));
                } catch (e) {
                    print("Window Grid KDE: " + tag + " [ORDER-B] desktop set error: " + e);
                }
            }
            activityMoveSucceeded = tryActivityAssignment(targetWindow, activityId, currentWorkspaceActivity, tag + "[ORDER-B]");
            logActivityDiagnostics(targetWindow, tag + "[AFTER-ORDER-B]");
            checkAndLogActivityStatus("AFTER-ORDER-B", targetWindow, activityId, currentWorkspaceActivity);
        }

        print("Window Grid KDE: " + tag + " final activityMoveSucceeded=" + activityMoveSucceeded);
        print("Window Grid KDE: " + tag + " final acts=" + describeActivities(targetWindow) + " onAllActivities=" + safeReadProperty(targetWindow, "onAllActivities"));
        checkAndLogActivityStatus("FINAL-IMMEDIATE", targetWindow, activityId, currentWorkspaceActivity);

        // Schedule timed verifications via DBus helper Sleep
        scheduleActivityVerification(normalizedWindowId, activityId, currentWorkspaceActivity, requestId);

    } else if (targetDesktop) {
        print("Window Grid KDE: " + tag + " desktop-only move");
        try {
            print("Window Grid KDE: " + tag + " desktop-only BEFORE=" + describeDesktopList(targetWindow.desktops));
            targetWindow.desktops = [targetDesktop];
            print("Window Grid KDE: " + tag + " desktop-only AFTER-IMMEDIATE=" + describeDesktopList(targetWindow.desktops));

            callDBus(
                WINDOW_GRID_KDE_SERVICE,
                WINDOW_GRID_KDE_PATH,
                WINDOW_GRID_KDE_INTERFACE,
                "Sleep",
                requestId,
                normalizedWindowId,
                "500",
                function(retReqId, retWinId) {
                    var freshWindow = freshWindowLookup(retWinId);
                    if (freshWindow) {
                        print("Window Grid KDE: [VERIFY-DESKTOP-500ms:REQ:" + retReqId + "] desktops=" + describeDesktopList(freshWindow.desktops));
                    } else {
                        print("Window Grid KDE: [VERIFY-DESKTOP-500ms:REQ:" + retReqId + "] fresh lookup failed");
                    }
                }
            );
        } catch (e) {
            print("Window Grid KDE: " + tag + " desktop-only error: " + e);
        }
    } else {
        print("Window Grid KDE: " + tag + " no activityId and no targetDesktop — nothing to do");
    }

    waitForMoveRequests();
}

function waitForMoveRequests() {
    print("Window Grid KDE: waitForMoveRequests ENTER isWaiting=" + isWaitingForMoveRequest + " callDBusType=" + typeof callDBus);

    if (isWaitingForMoveRequest || typeof callDBus !== "function") {
        print("Window Grid KDE: waitForMoveRequests SKIP isWaiting=" + isWaitingForMoveRequest + " callDBusType=" + typeof callDBus);
        return;
    }

    isWaitingForMoveRequest = true;
    print("Window Grid KDE: waitForMoveRequests SET true");
    print("Window Grid KDE: waiting for next move request");

    var handled = false;
    var watchdogId = null;
    try {
        watchdogId = setTimeout(function() {
            if (!handled) {
                handled = true;
                isWaitingForMoveRequest = false;
                print("Window Grid KDE: waitForMoveRequests watchdog fired — re-arming after disconnect");
                waitForMoveRequests();
            }
        }, 15000);
    } catch (e) {}

    try {
        callDBus(
            WINDOW_GRID_KDE_SERVICE,
            WINDOW_GRID_KDE_PATH,
            WINDOW_GRID_KDE_INTERFACE,
            "WaitForMoveRequest",
            function(windowId, activityId, desktopId, requestId) {
                if (handled) return;
                handled = true;
                try { clearTimeout(watchdogId); } catch (e) {}
                isWaitingForMoveRequest = false;
                print("Window Grid KDE: waitForMoveRequests SET false inside callback");
                print("Window Grid KDE: WaitForMoveRequest callback windowId=" + valueOrEmpty(windowId) +
                    " activityId=" + valueOrEmpty(activityId) +
                    " desktopId=" + valueOrEmpty(desktopId) +
                    " requestId=" + valueOrEmpty(requestId));
                moveKnownWindowToActivityAndDesktop(
                    valueOrEmpty(windowId),
                    valueOrEmpty(activityId),
                    valueOrEmpty(desktopId),
                    valueOrEmpty(requestId)
                );
            }
        );
    } catch (error) {
        if (!handled) {
            handled = true;
            try { clearTimeout(watchdogId); } catch (e) {}
        }
        isWaitingForMoveRequest = false;
        print("Window Grid KDE: waitForMoveRequests SET false inside catch");
        print("Window Grid KDE: WaitForMoveRequest call failed: " + error);
    }
}

function sendWindowToWindowGridKde(window) {
    var identifier = getWindowIdentifier(window);
    var windowId = identifier.value;
    var normalizedWindowId = normalizeId(windowId);
    var caption = valueOrEmpty(window.caption);
    var resourceClass = valueOrEmpty(window.resourceClass);
    var desktopIdsCsv = getDesktopIds(window).join(",");

    selectedWindowsById[normalizedWindowId] = window;
    knownWindowsById[windowId] = window;
    knownWindowsById[normalizedWindowId] = window;

    print("Window Grid KDE: selected window identifier source=" + identifier.source +
        ", windowId=" + windowId + ", normalizedWindowId=" + normalizedWindowId +
        ", caption=" + caption + ", resourceClass=" + resourceClass +
        ", desktopIdsCsv=" + desktopIdsCsv);
    print("Window Grid KDE: stored selectedWindowsById[" + normalizedWindowId + "] for caption=" + caption);

    if (typeof callDBus !== "function") {
        print("Window Grid KDE: callDBus unavailable in this KWin environment");
        return;
    }

    try {
        callDBus(
            WINDOW_GRID_KDE_SERVICE,
            WINDOW_GRID_KDE_PATH,
            WINDOW_GRID_KDE_INTERFACE,
            "SelectWindow",
            windowId, caption, resourceClass, desktopIdsCsv,
            function() {
                print("Window Grid KDE: SelectWindow callback success for " + caption +
                    " (" + windowId + "), args=" + callbackArgsToString(arguments));
                waitForMoveRequests();
            }
        );
        waitForMoveRequests();
    } catch (error) {
        print("Window Grid KDE: SelectWindow call failed for " + caption + " (" + windowId + "): " + error);
    }
}

registerUserActionsMenu(function(window) {
    return {
        text: "Open in Window Grid KDE",
        triggered: function() {
            sendWindowToWindowGridKde(window);
        }
    };
});

registerShortcut(
    "window-grid-kde-toggle",
    "Window Grid KDE: Toggle Window",
    "Meta+S",
    function() {
        callDBus(
            WINDOW_GRID_KDE_SERVICE,
            WINDOW_GRID_KDE_PATH,
            WINDOW_GRID_KDE_INTERFACE,
            "ToggleWindow",
            function() {}
        );
    }
);

print("Window Grid KDE: [SECTION 1] init complete, calling waitForMoveRequests at t=" + Date.now());
waitForMoveRequests();

/* global callDBus, workspace */

const SERVICE_NAME = 'com.anthony.WindowGridKDE';
const OBJECT_PATH = '/WindowGridKDE';
const INTERFACE_NAME = 'com.anthony.WindowGridKDE';

function log(message) {
  print("Window Grid KDE: " + message);
}

log('[SECTION 2] loaded at t=' + Date.now());

function getWorkspaceWindows() {
  if (typeof workspace.windowList === 'function') {
    return workspace.windowList();
  }

  if (Array.isArray(workspace.windows)) {
    return workspace.windows;
  }

  if (Array.isArray(workspace.stackingOrder)) {
    return workspace.stackingOrder;
  }

  return [];
}

function getWorkspaceDesktops() {
  if (typeof workspace.desktops === 'function') {
    return workspace.desktops();
  }

  if (Array.isArray(workspace.desktops)) {
    return workspace.desktops;
  }

  if (
    workspace.desktops &&
    typeof workspace.desktops.length === 'number' &&
    Number.isFinite(workspace.desktops.length)
  ) {
    const desktops = [];

    for (let index = 0; index < workspace.desktops.length; index += 1) {
      desktops.push(workspace.desktops[index]);
    }

    return desktops;
  }

  return [];
}

function getId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.id === 'string') return value.id;
  if (typeof value.uuid === 'string') return value.uuid;
  return String(value);
}

function describeValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'undefined';

  try {
    return String(value);
  } catch (error) {
    return `[unstringifiable: ${error}]`;
  }
}

function logWorkspaceDesktopApiState() {
  log(`workspace.currentDesktop: ${describeValue(workspace.currentDesktop)}`);
  log(`workspace.desktops: ${describeValue(workspace.desktops)}`);
  log(`workspace.virtualDesktops: ${describeValue(workspace.virtualDesktops)}`);
  log(`typeof workspace.desktops = ${typeof workspace.desktops}`);
  log(
    `workspace.desktops.length = ${
      workspace.desktops && typeof workspace.desktops.length !== 'undefined'
        ? workspace.desktops.length
        : 'undefined'
    }`
  );

  try {
    log(`Object.keys(workspace): ${Object.keys(workspace).join(',')}`);
  } catch (error) {
    log(`Object.keys(workspace) failed: ${error}`);
  }
}

function getCaption(window) {
  return window.caption || window.resourceClass || window.resourceName || window.internalId || 'Untitled window';
}

function getWindowActivityIds(window) {
  return Array.isArray(window.activities) ? window.activities.join(',') : '';
}

function getWindowDesktopIds(window) {
  if (window.onAllDesktops) {
    return 'all';
  }

  if (Array.isArray(window.desktops)) {
    return window.desktops.map((desktop) => getId(desktop)).join(',');
  }

  return getId(window.desktop);
}

function isNormalUserWindow(window) {
  return Boolean(
    window &&
    window.normalWindow &&
    !window.desktopWindow &&
    !window.dock &&
    !window.skipTaskbar
  );
}

function windowBelongsToActivity(window, activityId) {
  const activities = Array.isArray(window.activities) ? window.activities : [];

  if (activities.length === 0) {
    return true;
  }

  return activities.includes(activityId);
}

function resolveWindowDesktops(window) {
  if (Array.isArray(window.desktops) && window.desktops.length > 0) {
    return window.desktops;
  }

  if (
    window.desktops &&
    typeof window.desktops.length === 'number' &&
    Number.isFinite(window.desktops.length) &&
    window.desktops.length > 0
  ) {
    const result = [];
    for (let i = 0; i < window.desktops.length; i += 1) {
      result.push(window.desktops[i]);
    }
    return result;
  }

  return [];
}

function windowBelongsToDesktop(window, desktopId) {
  if (window.onAllDesktops) {
    return true;
  }

  const windowDesktops = resolveWindowDesktops(window);
  if (windowDesktops.length > 0) {
    return windowDesktops.some((desktop) => getId(desktop) === desktopId);
  }

  return getId(window.desktop) === desktopId;
}

function findDesktopById(desktopId) {
  const desktops = getWorkspaceDesktops();

  log("Looking for desktop: " + desktopId);
  log("Total desktops returned by getWorkspaceDesktops(): " + desktops.length);

  for (const desktop of desktops) {
    log(
      "Desktop candidate: id=" +
      getId(desktop) +
      " name=" +
      (desktop.name || "")
    );
  }

  return desktops.find((desktop) => getId(desktop) === desktopId) || null;
}

function moveWindowToActivityAndDesktop(window, targetActivityId, targetDesktopId, requestId) {
  const tag = "[BULK:REQ:" + requestId + ":" + getCaption(window) + "]";
  const targetDesktop = findDesktopById(targetDesktopId);
  const currentWorkspaceActivity = getCurrentWorkspaceActivity();

  log("Target desktop object found: " + (targetDesktop ? getId(targetDesktop) : "NO"));

  if (!targetDesktop) {
    log(tag + " no desktop found for id=" + targetDesktopId);
    return;
  }

  log(tag + " window desktops before=" + describeDesktopList(window.desktops));

  let activityMoveSucceeded = false;

  log(tag + " [ORDER-A] activity first");
  activityMoveSucceeded = tryActivityAssignment(
    window,
    targetActivityId,
    currentWorkspaceActivity,
    tag + "[ORDER-A]"
  );

  try {
    window.desktops = [targetDesktop];
    log(tag + " [ORDER-A] desktops set: " + describeDesktopList(window.desktops));
  } catch (error) {
    log(tag + " [ORDER-A] desktop set error: " + error);
  }

  if (!activityMoveSucceeded) {
    log(tag + " [ORDER-B] activity failed in ORDER-A, fallback: desktop first");
    try {
      window.desktops = [targetDesktop];
      log(tag + " [ORDER-B] desktops set: " + describeDesktopList(window.desktops));
    } catch (error) {
      log(tag + " [ORDER-B] desktop set error: " + error);
    }

    activityMoveSucceeded = tryActivityAssignment(
      window,
      targetActivityId,
      currentWorkspaceActivity,
      tag + "[ORDER-B]"
    );
  }

  log(tag + " final activityMoveSucceeded=" + activityMoveSucceeded);
  log(tag + " final desktops=" + describeDesktopList(window.desktops));
}

let lastBulkMoveLayout = null;

function switchToActivityAndDesktop(activityId, desktopId) {
  callDBus(
    'org.kde.ActivityManager',
    '/ActivityManager/Activities',
    'org.kde.ActivityManager.Activities',
    'SetCurrentActivity',
    activityId,
    function() {
      const targetDesktop = findDesktopById(desktopId);
      if (targetDesktop) {
        workspace.currentDesktop = targetDesktop;
      }
    }
  );
}

function handleMoveCurrentDesktop(targetActivityId, targetDesktopId, requestId) {
  if (!targetActivityId || !targetDesktopId) {
    return;
  }

  const moveStartTime = Date.now();
  log('[MOVE START] t=' + moveStartTime + ' | requestId=' + requestId);

  const currentActivityId = workspace.currentActivity;
  const currentDesktop = workspace.currentDesktop;
  const currentDesktopId = currentDesktop && currentDesktop.id
    ? String(currentDesktop.id)
    : "";

  const candidateWindows = getWorkspaceWindows();
  const matchingWindows = candidateWindows.filter((window) =>
    isNormalUserWindow(window) &&
    window.resourceClass !== 'window-grid-kde' &&
    windowBelongsToActivity(window, currentActivityId) &&
    windowBelongsToDesktop(window, currentDesktopId)
  );

  log('Matching windows found: ' + matchingWindows.length);

  // Switch to target immediately so the transition plays while windows move
  switchToActivityAndDesktop(targetActivityId, targetDesktopId);

  lastBulkMoveLayout = [];
  for (const window of matchingWindows) {
    const caption = getCaption(window);
    const geo = window.frameGeometry;
    const savedGeo = geo
      ? { x: geo.x, y: geo.y, width: geo.width, height: geo.height }
      : null;
    const maximizeMode = window.maximizeMode !== undefined ? window.maximizeMode : '(unavailable)';
    const fullScreen = window.fullScreen !== undefined
      ? Boolean(window.fullScreen)
      : (window.fullscreen !== undefined ? Boolean(window.fullscreen) : '(unavailable)');
    const isMaximized = (typeof maximizeMode === 'number' && maximizeMode !== 0) || maximizeMode === true;
    const isFullScreen = fullScreen === true;

    moveWindowToActivityAndDesktop(window, targetActivityId, targetDesktopId, requestId);

    if (savedGeo && !isMaximized && !isFullScreen) {
      lastBulkMoveLayout.push({ window, caption, x: savedGeo.x, y: savedGeo.y, width: savedGeo.width, height: savedGeo.height });
    }
  }

  if (lastBulkMoveLayout.length > 0) {
    callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'Sleep', requestId + '-autorestore', '', '800', function() {
      log('[AUTO RESTORE START]');
      runRestoreLayout();
      log('[AUTO RESTORE COMPLETE]');
    });
    log('[AUTO RESTORE SCHEDULED]');
  }

  log(`MoveCurrentDesktopToActivityAndDesktop complete: requestId=${requestId}`);
}

function waitForCurrentDesktopMoveRequest() {
  log('[SECTION 2] WaitForCurrentDesktopMoveRequest: callDBus sent at t=' + Date.now());

  let handled = false;
  let watchdogId = null;
  try {
    watchdogId = setTimeout(function() {
      if (!handled) {
        handled = true;
        log('[SECTION 2] WaitForCurrentDesktopMoveRequest: watchdog fired — re-arming after disconnect');
        waitForCurrentDesktopMoveRequest();
      }
    }, 15000);
  } catch (e) {}

  callDBus(
    SERVICE_NAME,
    OBJECT_PATH,
    INTERFACE_NAME,
    'WaitForCurrentDesktopMoveRequest',
    function (targetActivityId, targetDesktopId, requestId) {
      if (handled) return;
      handled = true;
      try { clearTimeout(watchdogId); } catch (e) {}
      log('[SECTION 2] WaitForCurrentDesktopMoveRequest: callback fired at t=' + Date.now() + ' activityId=' + targetActivityId + ' desktopId=' + targetDesktopId + ' requestId=' + requestId);
      try {
        handleMoveCurrentDesktop(targetActivityId, targetDesktopId, requestId);
      } catch (error) {
        log(`MoveCurrentDesktopToActivityAndDesktop failed: ${error}`);
      }
      waitForCurrentDesktopMoveRequest();
    }
  );
}

function runRestoreLayout() {
  if (lastBulkMoveLayout && lastBulkMoveLayout.length > 0) {
    for (let i = 0; i < lastBulkMoveLayout.length; i++) {
      const entry = lastBulkMoveLayout[i];
      try {
        entry.window.frameGeometry = { x: entry.x, y: entry.y, width: entry.width, height: entry.height };
      } catch (e) {
        log('[LAYOUT RESTORE] caption="' + entry.caption + '" | ERROR: ' + e);
      }
    }
  }
}

function waitForRestoreLayoutRequest() {
  log('[SECTION 2] WaitForRestoreLayoutRequest: callDBus sent at t=' + Date.now());

  let handled = false;
  let watchdogId = null;
  try {
    watchdogId = setTimeout(function() {
      if (!handled) {
        handled = true;
        log('[SECTION 2] WaitForRestoreLayoutRequest: watchdog fired — re-arming after disconnect');
        waitForRestoreLayoutRequest();
      }
    }, 15000);
  } catch (e) {}

  callDBus(
    SERVICE_NAME,
    OBJECT_PATH,
    INTERFACE_NAME,
    'WaitForRestoreLayoutRequest',
    function(requestId) {
      if (handled) return;
      handled = true;
      try { clearTimeout(watchdogId); } catch (e) {}
      log('[SECTION 2] WaitForRestoreLayoutRequest: callback fired at t=' + Date.now() + ' requestId=' + requestId);
      if (requestId) {
        runRestoreLayout();
      }
      waitForRestoreLayoutRequest();
    }
  );
}

function resolveWindowActivities(window) {
  if (Array.isArray(window.activities) && window.activities.length > 0) {
    return window.activities;
  }
  if (
    window.activities &&
    typeof window.activities.length === 'number' &&
    Number.isFinite(window.activities.length) &&
    window.activities.length > 0
  ) {
    const result = [];
    for (let i = 0; i < window.activities.length; i += 1) {
      result.push(String(window.activities[i]));
    }
    return result;
  }
  return [];
}

function computeWindowCounts() {
  const allWindows = getWorkspaceWindows();
  const allDesktops = getWorkspaceDesktops();
  const counts = {};

  for (let i = 0; i < allWindows.length; i++) {
    const w = allWindows[i];
    if (!isNormalUserWindow(w)) continue;

    const windowActivities = resolveWindowActivities(w);
    const windowDesktops = w.onAllDesktops ? allDesktops : resolveWindowDesktops(w);

    if (windowDesktops.length === 0 || windowActivities.length === 0) continue;

    for (let ai = 0; ai < windowActivities.length; ai++) {
      const activityId = windowActivities[ai];
      for (let di = 0; di < windowDesktops.length; di++) {
        const desktop = windowDesktops[di];
        const desktopId = desktop && desktop.id ? String(desktop.id) : null;
        if (!desktopId) continue;
        const key = activityId + '|' + desktopId;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }

  return JSON.stringify(counts);
}

function waitForWindowCountsRequest() {
  let handled = false;
  let watchdogId;
  try {
    watchdogId = setTimeout(function() {
      if (!handled) {
        handled = true;
        log('[SECTION 2] WaitForWindowCountsRequest: watchdog fired — re-arming');
        callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'ReceiveWindowCounts', computeWindowCounts(), function() {});
        waitForWindowCountsRequest();
      }
    }, 15000);
  } catch (e) {}

  callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'WaitForWindowCountsRequest', function(trigger) {
    if (handled) return;
    handled = true;
    try { clearTimeout(watchdogId); } catch (e) {}
    if (trigger === 'refresh') {
      callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'ReceiveWindowCounts', computeWindowCounts(), function() {});
    }
    waitForWindowCountsRequest();
  });
}

log('[SECTION 2] init: starting polling loops at t=' + Date.now());
waitForCurrentDesktopMoveRequest();
waitForRestoreLayoutRequest();
waitForWindowCountsRequest();
callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'ReceiveWindowCounts', computeWindowCounts(), function() {});
