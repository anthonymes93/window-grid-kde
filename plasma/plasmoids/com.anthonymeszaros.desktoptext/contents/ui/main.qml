import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as Controls
import org.kde.plasma.plasmoid
import org.kde.kirigami as Kirigami
import org.kde.plasma.plasma5support as P5Support
import org.kde.taskmanager as TaskManager

PlasmoidItem {
    id: root

    preferredRepresentation: compactRepresentation

    TaskManager.VirtualDesktopInfo {
        id: virtualDesktopInfo
    }

    TaskManager.ActivityInfo {
        id: activityInfo
    }

    property string currentDesktopId: String(virtualDesktopInfo.currentDesktop)
    property string currentActivityId: ""
    property string pendingText: ""
    property string savedText: ""
    property var activityDesktopNames: ({})
    property int uiRevision: 0
    property string pendingLoadCommand: ""
    property string pendingSaveCommand: ""
    property string pendingActivityCommand: ""
    readonly property string defaultTitle: "Untitled"

    property var desktopTexts: {
        try { return JSON.parse(plasmoid.configuration.desktopTexts); }
        catch(e) { return {}; }
    }

    function shellQuote(value) {
        return "'" + String(value).replace(/'/g, "'\\''") + "'";
    }

    function runCommand(command) {
        executableSource.connectSource(command);
    }

    function setCurrentActivityId(activityId) {
        if (activityId.length === 0 || currentActivityId === activityId) {
            return;
        }

        currentActivityId = activityId;
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

    function saveNames() {
        var json = JSON.stringify(activityDesktopNames, null, 2);
        pendingSaveCommand = "sh -c " + shellQuote("mkdir -p \"$HOME/.config\"; printf %s " + shellQuote(json) + " > \"$HOME/.config/activity-desktop-names.json\"");
        runCommand(pendingSaveCommand);
    }

    function parseLoadedNames(stdout) {
        try {
            var parsed = stdout.length > 0 ? JSON.parse(stdout) : {};

            if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
                activityDesktopNames = {};
                uiRevision += 1;
                return;
            }

            activityDesktopNames = parsed;
            uiRevision += 1;
        } catch (error) {
            activityDesktopNames = {};
            uiRevision += 1;
        }
    }

    function currentDesktopIndex() {
        var desktops = virtualDesktopInfo.desktopIds || virtualDesktopInfo.desktops || [];

        for (var i = 0; i < desktops.length; i += 1) {
            if (String(desktops[i]) === currentDesktopId) {
                return i;
            }
        }

        return 0;
    }

    function currentText() {
        var names = activityDesktopNames[currentActivityId];
        var index = currentDesktopIndex();

        if (Array.isArray(names) && names[index] && names[index].length > 0) {
            return names[index];
        }

        return desktopTexts[currentDesktopId] || "";
    }

    function saveText(text) {
        var obj = JSON.parse(JSON.stringify(activityDesktopNames || {}));
        var names = Array.isArray(obj[currentActivityId]) ? obj[currentActivityId] : [];
        var index = currentDesktopIndex();

        while (names.length <= index) {
            names.push("");
        }

        names[index] = text.trim();
        obj[currentActivityId] = names;
        activityDesktopNames = obj;
        uiRevision += 1;
        saveNames();
    }

    function resetText() {
        var obj = JSON.parse(JSON.stringify(activityDesktopNames || {}));
        var names = Array.isArray(obj[currentActivityId]) ? obj[currentActivityId] : [];
        var index = currentDesktopIndex();

        while (names.length <= index) {
            names.push("");
        }

        names[index] = defaultTitle;
        obj[currentActivityId] = names;

        var legacyTexts = JSON.parse(JSON.stringify(desktopTexts || {}));
        delete legacyTexts[currentDesktopId];
        plasmoid.configuration.desktopTexts = JSON.stringify(legacyTexts);

        activityDesktopNames = obj;
        pendingText = defaultTitle;
        savedText = defaultTitle;
        uiRevision += 1;
        saveNames();
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

            if (sourceName === root.pendingSaveCommand) {
                disconnectSource(sourceName);
                root.pendingSaveCommand = "";
                return;
            }

            if (sourceName === root.pendingActivityCommand) {
                root.setCurrentActivityId(stdout.length > 0 ? stdout : String(activityInfo.currentActivity));
                disconnectSource(sourceName);
                root.pendingActivityCommand = "";
                return;
            }

            disconnectSource(sourceName);
        }
    }

    Connections {
        target: activityInfo

        function onCurrentActivityChanged() {
            root.setCurrentActivityId(activityInfo.currentActivity);
            root.refreshCurrentActivityId();
        }
    }

    Timer {
        interval: 1000
        repeat: true
        running: true

        onTriggered: {
            root.refreshCurrentActivityId();
            root.loadNames();
        }
    }

    Component.onCompleted: {
        setCurrentActivityId(activityInfo.currentActivity);
        refreshCurrentActivityId();
        loadNames();
    }

    // Defer the save so it doesn't interfere with Plasma's popup state machine
    onExpandedChanged: {
        if (expanded) {
            savedText = currentText();
            pendingText = currentText();
        } else {
            var textToSave = pendingText;
            Qt.callLater(function() { saveText(textToSave); });
        }
    }

    // ── Panel label ──────────────────────────────────────
    compactRepresentation: MouseArea {
        id: compactRoot

        implicitWidth: Math.max(panelLabel.implicitWidth + plasmoid.configuration.labelPadding, 60)
        hoverEnabled: true
        cursorShape: Qt.IBeamCursor

        // Force-cycle false→true so the change event always fires,
        // even if Plasma left expanded=true after an outside-click dismiss
        onClicked: {
            root.expanded = false;
            Qt.callLater(function() { root.expanded = true; });
        }

        Rectangle {
            anchors { fill: parent; leftMargin: 4; rightMargin: 4 }
            radius: 4
            color: Kirigami.Theme.highlightColor
            opacity: compactRoot.containsMouse ? 0.12 : 0
            Behavior on opacity { NumberAnimation { duration: 100 } }
        }

        Text {
            id: panelLabel
            anchors.verticalCenter: parent.verticalCenter
            anchors.horizontalCenter: plasmoid.configuration.textAlignment === "center"
                ? parent.horizontalCenter : undefined
            anchors.left: plasmoid.configuration.textAlignment === "left"
                ? parent.left : undefined
            anchors.right: plasmoid.configuration.textAlignment === "right"
                ? parent.right : undefined
            anchors.leftMargin: plasmoid.configuration.textAlignment === "left"
                ? plasmoid.configuration.labelPadding / 2 : 0
            anchors.rightMargin: plasmoid.configuration.textAlignment === "right"
                ? plasmoid.configuration.labelPadding / 2 : 0
            text: {
                root.uiRevision;
                return root.currentText() || "click to set text";
            }
            font.bold: true
            font.pointSize: 14
            color: {
                root.uiRevision;
                return root.currentText() && root.currentText() !== root.defaultTitle
                    ? Kirigami.Theme.textColor
                    : Kirigami.Theme.disabledTextColor;
            }
            opacity: {
                root.uiRevision;
                return root.currentText() === root.defaultTitle ? 0.2 : 1;
            }
            renderType: Text.NativeRendering
        }

        Controls.ToolTip {
            visible: compactRoot.containsMouse && !root.expanded
            text: "Click to edit"
            delay: 800
        }
    }

    // ── Edit popup ───────────────────────────────────────
    fullRepresentation: Item {
        implicitWidth: 260
        implicitHeight: 140

        // Timer gives the popup time to fully render before grabbing focus
        Timer {
            id: focusTimer
            interval: 50
            onTriggered: {
                editField.forceActiveFocus();
                editField.selectAll();
            }
        }

        // Runs every time the popup opens (not just first time)
        Connections {
            target: root
            function onExpandedChanged() {
                if (root.expanded) {
                    editField.text = root.currentText();
                    focusTimer.start();
                }
            }
        }

        ColumnLayout {
            anchors { fill: parent; margins: 12 }
            spacing: 10

            // ── Text input ───────────────────────────────
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Controls.TextField {
                    id: editField
                    Layout.fillWidth: true
                    placeholderText: "Text for this desktop…"
                    font.pointSize: 12

                    onTextChanged: root.pendingText = text

                    Keys.onReturnPressed: root.expanded = false
                    Keys.onEnterPressed:  root.expanded = false
                    Keys.onEscapePressed: {
                        root.pendingText = root.savedText;
                        root.expanded = false;
                    }
                }

                Controls.Button {
                    text: "Reset"
                    Layout.preferredWidth: 72
                    onClicked: {
                        editField.text = root.defaultTitle;
                        root.resetText();
                        root.expanded = false;
                    }
                }
            }

            // ── Padding slider ───────────────────────────
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Controls.Label { text: "Padding"; font.pointSize: 10 }

                Controls.Slider {
                    Layout.fillWidth: true
                    from: 0; to: 100; stepSize: 2
                    value: plasmoid.configuration.labelPadding
                    onMoved: plasmoid.configuration.labelPadding = Math.round(value)
                }

                Controls.Label {
                    text: plasmoid.configuration.labelPadding + "px"
                    font.pointSize: 10
                    Layout.minimumWidth: 36
                }
            }

            // ── Alignment buttons ────────────────────────
            RowLayout {
                Layout.fillWidth: true
                spacing: 4

                Controls.ButtonGroup { id: alignGroup }

                Repeater {
                    model: [
                        { label: "Left",   val: "left"   },
                        { label: "Center", val: "center" },
                        { label: "Right",  val: "right"  }
                    ]
                    Controls.Button {
                        text: modelData.label
                        checkable: true
                        checked: plasmoid.configuration.textAlignment === modelData.val
                        Controls.ButtonGroup.group: alignGroup
                        Layout.fillWidth: true
                        onClicked: plasmoid.configuration.textAlignment = modelData.val
                    }
                }

            }
        }
    }
}
