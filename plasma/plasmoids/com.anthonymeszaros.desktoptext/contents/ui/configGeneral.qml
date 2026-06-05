import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.taskmanager as TaskManager

Item {
    id: page
    implicitHeight: layout.implicitHeight + Kirigami.Units.gridUnit

    property string cfg_desktopTexts

    TaskManager.VirtualDesktopInfo {
        id: virtualDesktopInfo
    }

    function save(desktopId, text) {
        var obj = {};
        try { obj = JSON.parse(cfg_desktopTexts); } catch(e) {}
        if (text.trim().length > 0) {
            obj[desktopId] = text;
        } else {
            delete obj[desktopId];
        }
        cfg_desktopTexts = JSON.stringify(obj);
    }

    function textFor(desktopId) {
        try {
            const obj = JSON.parse(cfg_desktopTexts);
            return obj[String(desktopId)] || "";
        } catch(e) { return ""; }
    }

    ColumnLayout {
        id: layout
        anchors { left: parent.left; right: parent.right; top: parent.top }
        spacing: Kirigami.Units.smallSpacing

        Kirigami.Heading {
            level: 3
            text: "Text per virtual desktop"
            Layout.bottomMargin: Kirigami.Units.smallSpacing
        }

        Repeater {
            model: virtualDesktopInfo.desktops

            RowLayout {
                Layout.fillWidth: true
                spacing: Kirigami.Units.smallSpacing

                Controls.Label {
                    text: virtualDesktopInfo.desktopNames[index] !== undefined
                        ? virtualDesktopInfo.desktopNames[index]
                        : ("Desktop " + (index + 1))
                    implicitWidth: 110
                    elide: Text.ElideRight
                }

                Controls.TextField {
                    id: field
                    Layout.fillWidth: true
                    placeholderText: "example text"
                    text: page.textFor(modelData)
                    onEditingFinished: page.save(String(modelData), text)
                }
            }
        }
    }
}
