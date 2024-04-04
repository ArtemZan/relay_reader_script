

function dispatchEvent(event) {
    print("============================================Event: ");
    print(JSON.stringify(event))

    const eventName = event.info.event
    print(eventName)
    
    if (eventName === "sta_connect_fail" || eventName === "sta_disconnected") {
        Shelly.call("Wifi.SetConfig", {
            config: {
                sta: {
                    ssid: "ShellyPlus1-80646FDB2A7C",
                    pass: "",
                    enable: true
                }
            }
        })
        return
    }
}

function init()
{
    const status = Shelly.getComponentStatus("Wifi")
    print(status)
    
    Shelly.call("Wifi.SetConfig", {
        config: {
            sta: {
                ssid: "Artem",
                pass: "12345678",
                enable: true
            }
        }
    })

    Shelly.addEventHandler(dispatchEvent)
}


init()