function checkWifiStatus() {
    var status = Shelly.getComponentStatus("Wifi");
    print("Got wifi status =========================: ", status);
    var connectedToSTA1 = status.ssid === "Artem";
    Shelly.call("Wifi.SetConfig", {
        config: {
            sta: {
                enable: true
            },
            sta1: {
                enable: !connectedToSTA1
            }
        }
    });
}
function dispatchEvent(event) {
    print("Event=========================: ", event);
    if (event.info.event === "sta_ip_acquired") {
        checkWifiStatus();
    }
}
function init() {
    checkWifiStatus();
    Shelly.call("Wifi.SetConfig", {
        config: {
            sta: {
                ssid: "ShellyPro1-EC62608B5314",
                pass: "c4ffe636",
                is_open: false,
                enable: false
            },
            sta1: {
                ssid: "Artem",
                pass: "12345678",
                is_open: false,
                enable: true
            }
        }
    });
    Shelly.addEventHandler(dispatchEvent);
}
init();
