pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents3
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as P5Support
import org.kde.plasma.plasmoid
import org.kde.taskmanager as TaskManager

PlasmoidItem {
    id: root

    property string currentActivityId: ""
    property var activityDesktopNames: ({})
    property int uiRevision: 0
    property int editingDesktopIndex: -1
    property string editingActivityId: ""
    property string pendingActivityCommand: ""
    property string pendingLoadCommand: ""
    property string pendingSaveCommand: ""
    property string pendingSwitchCommand: ""
    property string pendingReorderCommand: ""
    property string pendingRenameCommand: ""
    property string hoveredDesktopTitle: ""
    property int dragFromIndex: -1
    property int dragTargetIndex: -1
    property bool dragMoved: false

    readonly property int desktopMinWidth: Math.max(54, Kirigami.Units.gridUnit * 3)
    readonly property int desktopHeight: Math.max(24, Kirigami.Units.gridUnit * 1.35)

    Layout.minimumWidth: pagerRow.implicitWidth
    Layout.minimumHeight: desktopHeight
    Layout.preferredWidth: pagerRow.implicitWidth
    Layout.preferredHeight: desktopHeight

    Plasmoid.status: PlasmaCore.Types.ActiveStatus
    toolTipMainText: ""
    toolTipSubText: ""

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

    function saveNames() {
        var json = JSON.stringify(activityDesktopNames, null, 2);
        pendingSaveCommand = "sh -c " + shellQuote("mkdir -p \"$HOME/.config\"; printf %s " + shellQuote(json) + " > \"$HOME/.config/activity-desktop-names.json\"");
        runCommand(pendingSaveCommand);
    }

    function desktopName(index) {
        var names = activityDesktopNames[getCurrentActivityId()];

        if (Array.isArray(names) && names[index] && names[index].length > 0) {
            return names[index];
        }

        return "Untitled";
    }

    function hasCustomDesktopName(index) {
        var names = activityDesktopNames[getCurrentActivityId()];

        return Array.isArray(names) && typeof names[index] === "string" && names[index].length > 0;
    }

    function saveName(activityId, index, name) {
        if (activityId.length === 0 || index < 0) {
            return;
        }

        var desktopCount = virtualDesktopInfo.desktopIds ? virtualDesktopInfo.desktopIds.length : 0;
        var nextNames = JSON.parse(JSON.stringify(activityDesktopNames || {}));
        var names = Array.isArray(nextNames[activityId]) ? nextNames[activityId] : [];

        while (names.length < desktopCount) {
            names.push("");
        }

        names[index] = String(name).trim();
        nextNames[activityId] = names;
        activityDesktopNames = nextNames;
        saveNames();
        updateUI();
    }

    function openRenameWindow(index) {
        if (pendingRenameCommand.length > 0) {
            return;
        }

        editingDesktopIndex = index;
        editingActivityId = getCurrentActivityId();

        var currentName = hasCustomDesktopName(index) ? desktopName(index) : "";
        pendingRenameCommand = "sh -c " + shellQuote(
            "kdialog --title " + shellQuote("Rename Desktop") +
            " --inputbox " + shellQuote("Desktop name:") +
            " " + shellQuote(currentName)
        );
        runCommand(pendingRenameCommand);
    }

    function desktopId(index) {
        var desktopIds = virtualDesktopInfo.desktopIds || [];
        return desktopIds[index] ? String(desktopIds[index]) : "";
    }

    function isCurrentDesktop(index) {
        return desktopId(index) === String(virtualDesktopInfo.currentDesktop);
    }

    function switchToDesktop(index) {
        if (pendingSwitchCommand.length > 0) {
            return;
        }

        pendingSwitchCommand = "sh -c " + shellQuote("qdbus6 org.kde.KWin /KWin org.kde.KWin.setCurrentDesktop " + String(index + 1) + " 2>/dev/null || qdbus org.kde.KWin /KWin org.kde.KWin.setCurrentDesktop " + String(index + 1) + " 2>/dev/null || true");
        runCommand(pendingSwitchCommand);
    }

    function moveArrayItem(items, fromIndex, toIndex, count) {
        var result = [];
        for (var i = 0; i < count; i += 1) {
            result.push(i < items.length ? items[i] : "");
        }

        var moved = result.splice(fromIndex, 1)[0];
        result.splice(toIndex, 0, moved);
        return result;
    }

    function reorderCurrentActivityNames(fromIndex, toIndex) {
        var activityId = getCurrentActivityId();
        if (activityId.length === 0 || fromIndex === toIndex) {
            return;
        }

        var desktopCount = virtualDesktopInfo.desktopIds ? virtualDesktopInfo.desktopIds.length : 0;
        var nextNames = JSON.parse(JSON.stringify(activityDesktopNames || {}));
        var names = Array.isArray(nextNames[activityId]) ? nextNames[activityId] : [];
        nextNames[activityId] = moveArrayItem(names, fromIndex, toIndex, desktopCount);
        activityDesktopNames = nextNames;
        saveNames();
        updateUI();
    }

    function requestDesktopContentReorder(fromIndex, toIndex) {
        if (pendingReorderCommand.length > 0 || fromIndex === toIndex) {
            return;
        }

        pendingReorderCommand = "sh -c " + shellQuote(
            "qdbus6 com.anthony.WindowGridKDE /WindowGridKDE com.anthony.WindowGridKDE.ReorderDesktopContents " +
            shellQuote(String(fromIndex)) + " " +
            shellQuote(String(toIndex)) + " " +
            shellQuote(getCurrentActivityId()) +
            " >/dev/null 2>&1 || qdbus com.anthony.WindowGridKDE /WindowGridKDE com.anthony.WindowGridKDE.ReorderDesktopContents " +
            shellQuote(String(fromIndex)) + " " +
            shellQuote(String(toIndex)) + " " +
            shellQuote(getCurrentActivityId()) +
            " >/dev/null 2>&1 || true"
        );
        runCommand(pendingReorderCommand);
    }

    function indexFromPagerX(x) {
        var desktopCount = virtualDesktopInfo.desktopIds ? virtualDesktopInfo.desktopIds.length : 0;
        for (var i = 0; i < desktopCount; i += 1) {
            var item = desktopRepeater.itemAt(i);
            if (!item) {
                continue;
            }

            if (x < item.x + item.width / 2) {
                return i;
            }
        }

        return Math.max(0, desktopCount - 1);
    }

    function finishDrag(fromIndex, toIndex) {
        dragFromIndex = -1;
        dragTargetIndex = -1;
        dragMoved = false;

        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
            return;
        }

        reorderCurrentActivityNames(fromIndex, toIndex);
        requestDesktopContentReorder(fromIndex, toIndex);
    }

    function updateUI() {
        uiRevision += 1;
    }

    TaskManager.VirtualDesktopInfo {
        id: virtualDesktopInfo

        onCurrentDesktopChanged: root.updateUI()
        onDesktopIdsChanged: root.updateUI()
        onDesktopNamesChanged: root.updateUI()
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

            if (sourceName === root.pendingSaveCommand) {
                disconnectSource(sourceName);
                root.pendingSaveCommand = "";
                return;
            }

            if (sourceName === root.pendingSwitchCommand) {
                disconnectSource(sourceName);
                root.pendingSwitchCommand = "";
                root.updateUI();
                return;
            }

            if (sourceName === root.pendingReorderCommand) {
                disconnectSource(sourceName);
                root.pendingReorderCommand = "";
                root.updateUI();
                return;
            }

            if (sourceName === root.pendingRenameCommand) {
                var exitCode = Number(data["exit code"]);
                disconnectSource(sourceName);
                root.pendingRenameCommand = "";
                if (exitCode === 0) {
                    root.saveName(root.editingActivityId, root.editingDesktopIndex, stdout);
                }
                root.editingDesktopIndex = -1;
                root.editingActivityId = "";
                root.updateUI();
                return;
            }

            disconnectSource(sourceName);
        }
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

        onTriggered: {
            root.loadNames();
            root.updateUI();
        }
    }

    Row {
        id: pagerRow

        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        spacing: 1

        Repeater {
            id: desktopRepeater

            model: virtualDesktopInfo.desktopIds ? virtualDesktopInfo.desktopIds.length : 0

            delegate: Rectangle {
                id: desktopButton

                required property int index
                readonly property bool active: {
                    root.uiRevision;
                    return root.isCurrentDesktop(index);
                }
                readonly property string title: root.uiRevision >= 0 ? root.desktopName(index) : ""
                readonly property bool hasCustomTitle: {
                    root.uiRevision;
                    return root.hasCustomDesktopName(index);
                }
                readonly property int windowCount: desktopTasks.count
                readonly property bool editing: root.editingDesktopIndex === index

                width: Math.max(
                    root.desktopMinWidth,
                    titleLabel.implicitWidth + Math.max(18, countLabel.implicitWidth + 8) + 21
                )
                height: root.desktopHeight
                radius: 2
                color: active ? Kirigami.Theme.highlightColor : Qt.rgba(0.12, 0.13, 0.14, 1)
                opacity: root.dragFromIndex === index ? 0.68 : 1
                border.width: 1
                border.color: root.dragMoved && root.dragTargetIndex === index
                    ? Kirigami.Theme.positiveTextColor
                    : active ? Kirigami.Theme.focusColor : Qt.rgba(0.04, 0.05, 0.06, 1)

                TaskManager.TasksModel {
                    id: desktopTasks

                    virtualDesktop: root.desktopId(desktopButton.index)
                    activity: root.getCurrentActivityId()
                    filterByVirtualDesktop: true
                    filterByActivity: root.getCurrentActivityId().length > 0
                    filterByScreen: false
                    filterMinimized: false
                    filterNotMinimized: false
                    filterHidden: false
                    separateLaunchers: false
                    launcherList: []
                    groupMode: TaskManager.TasksModel.GroupDisabled

                    onCountChanged: root.updateUI()
                }

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 6
                    anchors.rightMargin: 5
                    spacing: 4

                    PlasmaComponents3.Label {
                        id: titleLabel

                        Layout.fillWidth: true
                        Layout.alignment: Qt.AlignVCenter
                        text: desktopButton.title
                        color: desktopButton.active ? Kirigami.Theme.highlightedTextColor : Kirigami.Theme.textColor
                        opacity: desktopButton.hasCustomTitle ? 1 : 0.2
                        elide: Text.ElideNone
                        font.pixelSize: Math.max(10, Math.round(Kirigami.Theme.defaultFont.pixelSize * 0.82))
                        font.bold: desktopButton.active
                        horizontalAlignment: Text.AlignLeft
                        verticalAlignment: Text.AlignVCenter
                        textFormat: Text.PlainText
                    }

                    Rectangle {
                        id: countBadge

                        Layout.alignment: Qt.AlignVCenter
                        Layout.preferredWidth: Math.max(18, countLabel.implicitWidth + 8)
                        Layout.preferredHeight: Math.max(14, countLabel.implicitHeight + 2)
                        radius: 2
                        color: desktopButton.active
                            ? Qt.rgba(Kirigami.Theme.highlightedTextColor.r, Kirigami.Theme.highlightedTextColor.g, Kirigami.Theme.highlightedTextColor.b, 0.18)
                            : Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.10)
                        border.width: 1
                        border.color: desktopButton.active
                            ? Qt.rgba(Kirigami.Theme.highlightedTextColor.r, Kirigami.Theme.highlightedTextColor.g, Kirigami.Theme.highlightedTextColor.b, 0.25)
                            : Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.16)

                        PlasmaComponents3.Label {
                            id: countLabel

                            anchors.centerIn: parent
                            text: String(desktopButton.windowCount)
                            color: desktopButton.active ? Kirigami.Theme.highlightedTextColor : Kirigami.Theme.textColor
                            opacity: desktopButton.windowCount > 0 ? 0.92 : 0.45
                            font.pixelSize: Math.max(9, Math.round(Kirigami.Theme.defaultFont.pixelSize * 0.74))
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                            textFormat: Text.PlainText
                        }
                    }
                }

                MouseArea {
                    id: desktopMouseArea

                    anchors.fill: parent
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    enabled: !desktopButton.editing
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    property real pressXInRow: 0

                    onPressed: function(mouse) {
                        if (mouse.button === Qt.RightButton) {
                            root.dragFromIndex = -1;
                            root.dragTargetIndex = -1;
                            root.dragMoved = false;
                            return;
                        }

                        pressXInRow = desktopButton.x + mouse.x;
                        root.dragFromIndex = desktopButton.index;
                        root.dragTargetIndex = desktopButton.index;
                        root.dragMoved = false;
                    }

                    onPositionChanged: function(mouse) {
                        if (root.dragFromIndex < 0) {
                            return;
                        }

                        var currentX = desktopButton.x + mouse.x;
                        if (Math.abs(currentX - pressXInRow) > 8) {
                            root.dragMoved = true;
                        }

                        if (root.dragMoved) {
                            root.dragTargetIndex = root.indexFromPagerX(currentX);
                        }
                    }

                    onReleased: function(mouse) {
                        if (mouse.button === Qt.RightButton) {
                            root.dragFromIndex = -1;
                            root.dragTargetIndex = -1;
                            root.dragMoved = false;
                            root.openRenameWindow(desktopButton.index);
                            return;
                        }

                        var fromIndex = root.dragFromIndex;
                        var toIndex = root.dragMoved ? root.indexFromPagerX(desktopButton.x + mouse.x) : fromIndex;

                        if (root.dragMoved) {
                            root.finishDrag(fromIndex, toIndex);
                            return;
                        }

                        root.dragFromIndex = -1;
                        root.dragTargetIndex = -1;
                        root.dragMoved = false;
                        root.switchToDesktop(desktopButton.index);
                    }

                    onCanceled: {
                        root.dragFromIndex = -1;
                        root.dragTargetIndex = -1;
                        root.dragMoved = false;
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
