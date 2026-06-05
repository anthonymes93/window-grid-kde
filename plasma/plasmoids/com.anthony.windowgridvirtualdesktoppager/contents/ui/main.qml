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

    property string currentActivityId: ""
    property var activityDesktopNames: ({})
    property int uiRevision: 0
    property string pendingActivityCommand: ""
    property string pendingLoadCommand: ""

    readonly property int desktopWidth: Math.max(48, Kirigami.Units.gridUnit * 3)
    readonly property int desktopHeight: Math.max(18, Kirigami.Units.gridUnit)

    Layout.minimumWidth: pagerRow.implicitWidth
    Layout.minimumHeight: desktopHeight
    Layout.preferredWidth: pagerRow.implicitWidth
    Layout.preferredHeight: desktopHeight

    Plasmoid.status: pagerModel.shouldShowPager ? PlasmaCore.Types.ActiveStatus : PlasmaCore.Types.HiddenStatus

    function shellQuote(value) {
        return "'" + String(value).replace(/'/g, "'\\''") + "'";
    }

    function runCommand(command) {
        executableSource.connectSource(command);
    }

    function getCurrentActivityId() {
        return currentActivityId.length > 0 ? currentActivityId : activityInfo.currentActivity;
    }

    function setCurrentActivityId(activityId) {
        if (activityId.length === 0 || currentActivityId === activityId) {
            return;
        }

        currentActivityId = activityId;
        updateUI();
    }

    function refreshCurrentActivityId() {
        if (pendingActivityCommand.length > 0) {
            return;
        }

        pendingActivityCommand = "sh -c " + shellQuote("qdbus6 org.kde.ActivityManager /ActivityManager/Activities CurrentActivity 2>/dev/null || qdbus org.kde.ActivityManager /ActivityManager/Activities CurrentActivity 2>/dev/null || true");
        runCommand(pendingActivityCommand);
    }

    function loadNames() {
        if (pendingLoadCommand.length > 0) {
            return;
        }

        pendingLoadCommand = "sh -c " + shellQuote("mkdir -p \"$HOME/.config\"; test -f \"$HOME/.config/activity-desktop-names.json\" || printf '{}' > \"$HOME/.config/activity-desktop-names.json\"; cat \"$HOME/.config/activity-desktop-names.json\"");
        runCommand(pendingLoadCommand);
    }

    function parseLoadedNames(stdout) {
        try {
            var parsed = stdout.length > 0 ? JSON.parse(stdout) : {};

            if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
                activityDesktopNames = {};
                updateUI();
                return;
            }

            activityDesktopNames = parsed;
            updateUI();
        } catch (error) {
            activityDesktopNames = {};
            updateUI();
        }
    }

    function desktopName(index) {
        var names = activityDesktopNames[getCurrentActivityId()];

        if (Array.isArray(names) && names[index] && names[index].length > 0) {
            return names[index];
        }

        return "Desktop " + (index + 1);
    }

    function updateUI() {
        uiRevision += 1;
    }

    TaskManager.ActivityInfo {
        id: activityInfo

        onCurrentActivityChanged: {
            root.setCurrentActivityId(currentActivity);
            root.refreshCurrentActivityId();
        }
    }

    P5Support.DataSource {
        id: executableSource

        engine: "executable"

        onNewData: function(sourceName, data) {
            var stdout = String(data.stdout || "").trim();

            if (sourceName === root.pendingActivityCommand) {
                root.setCurrentActivityId(stdout.length > 0 ? stdout : activityInfo.currentActivity);
                disconnectSource(sourceName);
                root.pendingActivityCommand = "";
                return;
            }

            if (sourceName === root.pendingLoadCommand) {
                root.parseLoadedNames(stdout);
                disconnectSource(sourceName);
                root.pendingLoadCommand = "";
                return;
            }

            disconnectSource(sourceName);
        }
    }

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

    Timer {
        interval: 2000
        repeat: true
        running: true

        onTriggered: root.refreshCurrentActivityId()
    }

    Timer {
        interval: 1000
        repeat: true
        running: true

        onTriggered: root.loadNames()
    }

    Row {
        id: pagerRow

        anchors.fill: parent
        spacing: 1

        Repeater {
            model: pagerModel

            delegate: Rectangle {
                id: desktopButton

                required property int index
                readonly property bool active: index === pagerModel.currentPage
                readonly property string title: root.uiRevision >= 0 ? root.desktopName(index) : ""

                width: root.desktopWidth
                height: root.desktopHeight
                color: active ? Kirigami.Theme.highlightColor : Qt.rgba(0.16, 0.17, 0.18, 1)
                border.width: 1
                border.color: active ? Kirigami.Theme.focusColor : Qt.rgba(0.06, 0.07, 0.08, 1)

                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor

                    PlasmaComponents3.ToolTip.delay: Kirigami.Units.toolTipDelay
                    PlasmaComponents3.ToolTip.visible: containsMouse
                    PlasmaComponents3.ToolTip.text: desktopButton.title

                    onClicked: pagerModel.changePage(desktopButton.index)
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
