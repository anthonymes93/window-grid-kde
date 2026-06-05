pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents3
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as P5Support
import org.kde.plasma.plasmoid
import org.kde.taskmanager as TaskManager
import plasma.applet.org.kde.plasma.pager

PlasmoidItem {
    id: root

    property bool debug: true

    property string currentActivityId: ""
    property var activityDesktopNames: ({})
    property int uiRevision: 0

    property string pendingLoadCommand: ""
    property string pendingSaveCommand: ""
    property string pendingActivityCommand: ""

    property int renameDesktopIndex: -1
    property string renameActivityId: ""

    Layout.minimumWidth: pagerRow.implicitWidth
    Layout.minimumHeight: Kirigami.Units.gridUnit * 2
    Layout.preferredWidth: pagerRow.implicitWidth
    Layout.preferredHeight: Kirigami.Units.gridUnit * 2

    Plasmoid.status: pagerModel.shouldShowPager ? PlasmaCore.Types.ActiveStatus : PlasmaCore.Types.HiddenStatus

    // Activity detection

    function getCurrentActivityId() {
        if (currentActivityId.length > 0) {
            return currentActivityId;
        }

        return activityInfo.currentActivity;
    }

    function setCurrentActivityId(activityId) {
        if (activityId.length === 0 || currentActivityId === activityId) {
            return;
        }

        currentActivityId = activityId;
        debugLog("activity", currentActivityId);
        updateUI();
    }

    function refreshCurrentActivityId() {
        pendingActivityCommand = "sh -c " + shellQuote("qdbus6 org.kde.ActivityManager /ActivityManager/Activities CurrentActivity 2>/dev/null || qdbus org.kde.ActivityManager /ActivityManager/Activities CurrentActivity 2>/dev/null || true");
        runCommand(pendingActivityCommand);
    }

    TaskManager.ActivityInfo {
        id: activityInfo

        onCurrentActivityChanged: {
            root.setCurrentActivityId(currentActivity);
            root.refreshCurrentActivityId();
        }
    }

    Timer {
        id: activityRefreshTimer

        interval: 2000
        repeat: true
        running: true

        onTriggered: root.refreshCurrentActivityId()
    }

    Timer {
        id: namesRefreshTimer

        interval: 1000
        repeat: true
        running: true

        onTriggered: root.loadNames()
    }

    // Storage

    function shellQuote(value) {
        return "'" + String(value).replace(/'/g, "'\\''") + "'";
    }

    function runCommand(command) {
        executableSource.connectSource(command);
    }

    function loadNames() {
        if (pendingLoadCommand.length > 0) {
            return;
        }

        pendingLoadCommand = "sh -c " + shellQuote("mkdir -p \"$HOME/.config\"; test -f \"$HOME/.config/activity-desktop-names.json\" || printf '{}' > \"$HOME/.config/activity-desktop-names.json\"; cat \"$HOME/.config/activity-desktop-names.json\"");
        runCommand(pendingLoadCommand);
    }

    function saveNames() {
        var json = JSON.stringify(activityDesktopNames, null, 2);

        pendingSaveCommand = "sh -c " + shellQuote("mkdir -p \"$HOME/.config\"; printf %s " + shellQuote(json) + " > \"$HOME/.config/activity-desktop-names.json\"");
        runCommand(pendingSaveCommand);
    }

    function recreateNamesFile() {
        activityDesktopNames = {};
        pendingSaveCommand = "sh -c " + shellQuote("mkdir -p \"$HOME/.config\"; printf '{}' > \"$HOME/.config/activity-desktop-names.json\"");
        runCommand(pendingSaveCommand);
        updateUI();
    }

    function parseLoadedNames(stdout) {
        try {
            var parsed = stdout.length > 0 ? JSON.parse(stdout) : {};

            if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
                recreateNamesFile();
                return;
            }

            activityDesktopNames = parsed;
            debugLog("loaded", JSON.stringify(activityDesktopNames));
            updateUI();
        } catch (error) {
            debugLog("invalid-json", error);
            recreateNamesFile();
        }
    }

    function saveName(activityId, desktopIndex, newName) {
        if (activityId.length === 0 || desktopIndex < 0) {
            return;
        }

        var nextNames = JSON.parse(JSON.stringify(activityDesktopNames || {}));
        var names = Array.isArray(nextNames[activityId]) ? nextNames[activityId] : [];

        while (names.length <= desktopIndex) {
            names.push("");
        }

        names[desktopIndex] = newName.trim();
        nextNames[activityId] = names;
        activityDesktopNames = nextNames;

        saveNames();
        updateUI();
    }

    P5Support.DataSource {
        id: executableSource

        engine: "executable"

        onNewData: function(sourceName, data) {
            var stdout = String(data.stdout || "").trim();

            if (sourceName === root.pendingLoadCommand) {
                root.parseLoadedNames(stdout);
                disconnectSource(sourceName);
                root.pendingLoadCommand = "";
                return;
            }

            if (sourceName === root.pendingActivityCommand) {
                root.setCurrentActivityId(stdout.length > 0 ? stdout : activityInfo.currentActivity);
                disconnectSource(sourceName);
                root.pendingActivityCommand = "";
                return;
            }

            if (sourceName === root.pendingSaveCommand) {
                root.debugLog("saved", JSON.stringify(root.activityDesktopNames));
                disconnectSource(sourceName);
                root.pendingSaveCommand = "";
                return;
            }

            disconnectSource(sourceName);
        }
    }

    // Pager model

    PagerModel {
        id: pagerModel

        enabled: root.visible
        pagerType: PagerModel.VirtualDesktops
        showDesktop: true
        showOnlyCurrentScreen: false
        screenName: root.Screen.name
        screenGeometry: Plasmoid.containment.screenGeometry

        onCurrentPageChanged: root.updateUI()
        onCountChanged: root.updateUI()
    }

    // UI state helpers

    function desktopLabel(index) {
        var activityId = getCurrentActivityId();
        var names = activityDesktopNames[activityId];

        if (Array.isArray(names) && names[index] && names[index].length > 0) {
            return names[index];
        }

        return "Desktop " + (index + 1);
    }

    function openRenameDialog(index) {
        renameDesktopIndex = index;
        renameActivityId = getCurrentActivityId();
        renameField.text = desktopLabel(index);
        renameDialog.open();
    }

    function updateUI() {
        uiRevision += 1;
        debugLog("ui", "activity=" + getCurrentActivityId() + " revision=" + uiRevision);
    }

    function debugLog(topic, message) {
        if (debug) {
            console.log("[Activity Desktop Name Pager]", topic, message);
        }
    }

    // Dialogs

    Kirigami.Dialog {
        id: renameDialog

        title: "Rename Desktop"
        preferredWidth: Kirigami.Units.gridUnit * 18
        standardButtons: Kirigami.Dialog.Ok | Kirigami.Dialog.Cancel

        onAccepted: {
            root.saveName(root.renameActivityId, root.renameDesktopIndex, renameField.text);
            close();
        }

        onRejected: close()

        ColumnLayout {
            width: parent.width
            spacing: Kirigami.Units.largeSpacing

            PlasmaComponents3.TextField {
                id: renameField

                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                text: ""

                Keys.onEscapePressed: renameDialog.reject()
            }
        }
    }

    // UI rendering

    Row {
        id: pagerRow

        anchors.centerIn: parent
        spacing: Kirigami.Units.smallSpacing

        Repeater {
            model: pagerModel

            delegate: Rectangle {
                id: desktopButton

                required property int index
                property int revision: root.uiRevision
                property bool active: index === pagerModel.currentPage
                property bool hovered: desktopMouseArea.containsMouse
                property string displayName: root.desktopLabel(index)

                onDisplayNameChanged: labelFade.restart()
                onRevisionChanged: {
                    displayName = root.desktopLabel(index);
                    root.debugLog("desktop-map", index + " -> " + displayName);
                }

                width: Math.max(Kirigami.Units.gridUnit * 5, label.implicitWidth + Kirigami.Units.gridUnit)
                height: Kirigami.Units.gridUnit * 1.75
                radius: 3
                color: active
                    ? Qt.rgba(Kirigami.Theme.highlightColor.r, Kirigami.Theme.highlightColor.g, Kirigami.Theme.highlightColor.b, 0.82)
                    : hovered
                        ? Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.08)
                        : Qt.rgba(Kirigami.Theme.backgroundColor.r, Kirigami.Theme.backgroundColor.g, Kirigami.Theme.backgroundColor.b, 0.45)
                border.width: active ? 2 : 1
                border.color: active
                    ? Kirigami.Theme.focusColor
                    : hovered
                        ? Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.38)
                        : Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.22)

                Behavior on color {
                    ColorAnimation {
                        duration: Kirigami.Units.longDuration
                        easing.type: Easing.OutCubic
                    }
                }

                Behavior on border.color {
                    ColorAnimation {
                        duration: Kirigami.Units.longDuration
                        easing.type: Easing.OutCubic
                    }
                }

                Behavior on border.width {
                    NumberAnimation {
                        duration: Kirigami.Units.shortDuration
                        easing.type: Easing.OutCubic
                    }
                }

                PlasmaComponents3.Label {
                    id: label

                    anchors.fill: parent
                    anchors.margins: Kirigami.Units.smallSpacing
                    text: desktopButton.displayName
                    color: desktopButton.active ? Kirigami.Theme.highlightedTextColor : Kirigami.Theme.textColor
                    opacity: desktopButton.hovered || desktopButton.active ? 1 : 0.88
                    elide: Text.ElideRight
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    textFormat: Text.PlainText

                    Behavior on color {
                        ColorAnimation {
                            duration: Kirigami.Units.longDuration
                            easing.type: Easing.OutCubic
                        }
                    }

                    Behavior on opacity {
                        NumberAnimation {
                            duration: Kirigami.Units.shortDuration
                            easing.type: Easing.OutCubic
                        }
                    }

                    SequentialAnimation {
                        id: labelFade

                        NumberAnimation {
                            target: label
                            property: "opacity"
                            to: 0.55
                            duration: Kirigami.Units.shortDuration
                            easing.type: Easing.OutCubic
                        }

                        NumberAnimation {
                            target: label
                            property: "opacity"
                            to: desktopButton.hovered || desktopButton.active ? 1 : 0.88
                            duration: Kirigami.Units.shortDuration
                            easing.type: Easing.OutCubic
                        }
                    }
                }

                MouseArea {
                    id: desktopMouseArea

                    anchors.fill: parent
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor

                    onClicked: function(mouse) {
                        if (mouse.button === Qt.RightButton) {
                            root.openRenameDialog(desktopButton.index);
                            return;
                        }

                        pagerModel.changePage(desktopButton.index);
                    }
                }
            }
        }
    }

    Component.onCompleted: {
        setCurrentActivityId(activityInfo.currentActivity);
        refreshCurrentActivityId();
        loadNames();
    }
}
