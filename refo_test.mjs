// Used to detect changes in KVS
const prevKVS = {}

// Possible values: 
// null - disconnected
// "wifi"
// "relay_AP"
let connectedAP = { current: null }

let switchingWifi = { current: false }

const wsTimerHandler = { current: null }
const wifiCheckTimerHandler = { current: null }

const shellyCallsQueue = []

const wifiReconnectAttempts = 1
const wifiReconnectAttemptsLeft = { current: wifiReconnectAttempts }
const wifiDisconnectedForSwitching = { current: false }

const relayServerScriptId = { current: null }

const relayIP = "192.168.33.1"

function callNext() {
    const call = shellyCallsQueue[0]
    if (!call) {
        return
    }

    function onComplete(result) {
        print("onComplete")

        if (call[2]) {
            try {
                print("Calling callback for: ", call[0], "with result: ", JSON.stringify(result))
                call[2](result)
            }
            catch (e) {
                console.log("Shelly call caught an error: ", e)
            }
        }

        print("pop the call from queue. Calls left: ", shellyCallsQueue.length)

        shellyCallsQueue.splice(0, 1)
        callNext()
    }

    Shelly.call(call[0], call[1], onComplete)
}

function enqueueShellyCall(method, params, callback) {
    shellyCallsQueue.push([method, params, callback])

    if (shellyCallsQueue.length === 1) {
        callNext()
    }
}

function sendHTTPWithAuth(method, relative_uri, KVS, data, callback) {
    if (!KVS.relay_password) {
        print("No password")
        return
    }

    const url = "http://admin:" + KVS.relay_password.value + "@" + relayIP + "/script/" + relayServerScriptId.current + relative_uri

    const dataCopy = JSON.parse(JSON.stringify(data))
    dataCopy.url = url

    Shelly.call(method, dataCopy, callback)
}

function hasRelayAP(callback) {
    enqueueShellyCall("KVS.Get", { key: "relay_AP" }, function (result) {
        callback(!!result && !!result.value)
    })
}

// Switch when still connected to a network
function forceSwitchWifi() {
    wifiDisconnectedForSwitching.current = true

    // Simply disable the current STA. On "sta_disconnected" the network will be switched (see function 'dispatchEvent')
    enqueueShellyCall("WiFi.SetConfig", {
        config: {
            sta: {
                enable: false
            }
        }
    })
}

function selectWiFiNetwork(config) {
    if (switchingWifi.current) {
        return
    }

    switchingWifi.current = true
    enqueueShellyCall("WiFi.SetConfig", {
        config: {
            sta: {
                ssid: config.ssid,
                pass: config.pass,
                enable: true,
                is_open: !config.pass
            },
            sta1: {
                ssid: "",
                pass: "",
                enable: false
            }
        }
    }, function () {
        switchingWifi.current = false
    })
}

function selectMainNetwork() {
    enqueueShellyCall("KVS.Get", { key: "wifi" }, function (main_wifi) {
        print("Main Wifi: ", main_wifi.value);

        try {
            selectWiFiNetwork(JSON.parse(main_wifi.value))
        }
        catch (e) {
            print("Failed to parse wifi");
        }
    })
}

function switchWiFiNetwork() {
    const wifiConfig = Shelly.getComponentConfig("WiFi")

    wifiDisconnectedForSwitching.current = false

    function onGotNetworks(main_wifi, relay_AP) {
        if (wifiConfig.sta.ssid == main_wifi.ssid) {
            selectWiFiNetwork(relay_AP)
        }
        else {
            selectWiFiNetwork(main_wifi)
        }
    }

    function onGotMainWifi(main_wifi) {
        enqueueShellyCall("KVS.Get", { "key": "relay_AP" }, function (relay_AP) {
            print("Wifi: ", main_wifi.value, relay_AP.value);
            try {
                onGotNetworks(JSON.parse(main_wifi.value), JSON.parse(relay_AP.value))
            }
            catch (e) {
                print("Failed to parse wifi or relay AP");
            }
        })
    }

    enqueueShellyCall("KVS.Get", { "key": "wifi" }, onGotMainWifi)
}

function checkWifiStatus(select_main_if_disconnected) {
    const wifiStatus = Shelly.getComponentStatus("WiFi")
    print("Got wifi status: ", JSON.stringify(wifiStatus))

    if (wifiStatus.ssid === null) {
        print("Not connected to wifi")
        if (select_main_if_disconnected) {
            selectMainNetwork()
        }
        return
    }


    function onGotWiFiUrl(result) {
        try {
            const wifiSSID = JSON.parse(result.value).ssid

            connectedAP.current = wifiStatus.ssid === wifiSSID ? "wifi" : "relay_AP"

            if (connectedAP.current === "wifi") {
                setWSConnectTimer()
            }
            else {
                getRelayServerScriptId()
                setBackendConnectionChecker()
            }

            updateWSConfig()

            print(connectedAP.current)
        }
        catch (e) {
            print("Failed to parse wifi config")
        }
    }

    enqueueShellyCall("KVS.Get", { key: "wifi" }, onGotWiFiUrl)

}

function setWSConnectTimer() {
    print("Ws timer set")
    if (wsTimerHandler.current) {
        Timer.clear(wsTimerHandler.current)
    }

    function onTimeOut() {
        const status = Shelly.getComponentStatus("Ws")
        console.log("WS time passed. Status: ", JSON.stringify(status))
        if (!status.connected) {
            print("WS connection timed out after 1 minute. Switching to the other wifi network.")
            hasRelayAP(function (hasRelayAP) {
                if (hasRelayAP) {
                    forceSwitchWifi()
                }
            })
        }
    }

    wsTimerHandler.current = Timer.set(60 * 1000, false, onTimeOut)
}

function dispatchEvent(event) {
    print("============================================Event: ");
    print(JSON.stringify(event))

    const eventName = event.info.event
    print(eventName)


    if (eventName === "sta_connect_fail") {
        wifiReconnectAttemptsLeft.current--
        if (wifiReconnectAttemptsLeft.current <= 0) {
            wifiReconnectAttemptsLeft.current = wifiReconnectAttempts
            switchWiFiNetwork()
        }
    }

    if (eventName === "sta_disconnected") {
        if (event.info.reason === 8 && !wifiDisconnectedForSwitching.current) {
            return
        }

        wifiReconnectAttemptsLeft.current = wifiReconnectAttempts

        switchWiFiNetwork()
    }

    if (eventName === "sta_connect_fail" || eventName === "sta_disconnected") {
        connectedAP.current = null
        if (wifiCheckTimerHandler.current) {
            Timer.clear(wifiCheckTimerHandler.current)
            wifiCheckTimerHandler.current = null
        }


        return
    }

    if (eventName === "sta_ip_acquired") {
        if (connectedAP.current === "relay_AP") {
            getRelayServerScriptId()
        }
        return
    }

    if (eventName === "sta_connected") {
        checkWifiStatus()
        return
    }


    // "sta_connecting"

}

function onGotKVSOnDispatchStatus(result) {
    const KVS = result.items

    function handleKVSChange(key, callback) {
        const newValue = KVS[key] ? KVS[key].value : null
        if (prevKVS[key] !== newValue) {
            prevKVS[key] = newValue

            callback(newValue)
        }
    }

    handleKVSChange("wifi", function (wifi) {
        selectWiFiNetwork(JSON.parse(wifi))
    })

    handleKVSChange("relay_AP", function (relay_AP) {
        if (connectedAP.current === "relay_AP") {
            selectWiFiNetwork(JSON.parse(relay_AP))
        }
    })

    handleKVSChange("websocket_server", function () {
        if (connectedAP.current === "wifi") {
            updateWSConfig()
        }
        else {
            selectMainNetwork()
        }
    })

    handleKVSChange("relay_ip", function (wifi) {
        if (connectedAP.current === "relay_AP") {
            updateWSConfig()
        }
    })
}

function dispatchStatus(status) {
    print("Status change: ", JSON.stringify(status))

    if (status.component === "ws") {
        if (!status.delta.connected) {
            forceSwitchWifi()
        }

        return
    }

    if (status.component === "sys") {
        enqueueShellyCall("KVS.GetMany", {}, onGotKVSOnDispatchStatus)

        return
    }

}


function handleRFIDRead(tag) {
    print("Scan card: ", tag);
    RFIDScanner.stop();


    try {
        if (connectedAP.current === null) {
            print("The read card is ignored as the reader is not connected to wifi")
            return
        }

        function onGotKVS(result) {
            const KVS = result.items

            sendHTTPWithAuth("HTTP.GET", "/open_relay_with_rfid?cardId=" + tag, KVS, {})

        }



        if (connectedAP.current === "relay_AP") {
            Shelly.call("KVS.GetMany", {}, onGotKVS)
        }
        else {

            // TO DO: don't notify all RPC channels
            Shelly.emitEvent("card_read", {
                cardId: tag
            })
        }
    }
    catch (e) {
        console.log(e)
    }

    Timer.set(100, false, function () {
        print("Start rfid after timeout");
        RFIDScanner.start(handleRFIDRead);
    })
}



function updateWSConfig() {
    function onUpdateConfig(result, error_code, error_message) {
        if (!result) {
            print("Failed to update ws config: ", error_message)
            return
        }

        if (result.restart_required) {
            enqueueShellyCall("Shelly.Reboot")
        }
    }

    function setWSUrl(url) {
        print("Use ws server: ", url)
        enqueueShellyCall("Ws.SetConfig", {
            config: {
                server: url,
                ssl_ca: "*",
                enable: true
            }
        }, onUpdateConfig)
    }

    function onGotServerUrl(result, error_code, error_message) {
        if (error_code || !result) {
            print("Abort ws connection, couldn't take ws url from KVS: ", error_message)
            return
        }

        const server = result.value

        setWSUrl(server)
    }

    print("updateWSConfig")
    if (connectedAP.current === "wifi") {
        enqueueShellyCall("KVS.Get", { "key": "websocket_server" }, onGotServerUrl)
    }
}

function setBackendConnectionChecker() {
    function onGotKVS(result) {
        const KVS = result.items

        sendHTTPWithAuth("HTTP.GET", "/backend_connection_status", KVS, {}, function (response) {
            print("Got response from GET /backend_connection_status: ", JSON.stringify(response))
            if (!response || !response.body_b64) {
                print("No body in the response")
                return
            }

            let body
            try {
                body = JSON.parse(atob(response.body_b64))
            }
            catch (e) {
                print("Failed to parse response body")
                return
            }

            print(body)

            if (body.isConnected) {
                forceSwitchWifi()
            }
        })
    }

    function check() {
        const wsStatus = Shelly.getComponentStatus("Ws")
        const wifiStatus = Shelly.getComponentStatus("WiFi")

        if (wsStatus.connected || !wifiStatus.ssid) {
            return
        }


        Shelly.call("KVS.GetMany", {}, onGotKVS)
    }

    if (wifiCheckTimerHandler.current) {
        Timer.clear(wifiCheckTimerHandler.current)
    }

    wifiCheckTimerHandler.current = Timer.set(60_000, true, check)
}

// Looks for a script named "readers", which is running on the relay, and stores it in relayServerScriptId
function getRelayServerScriptId() {
    if (relayServerScriptId.current) {
        return
    }

    function onGotScripts(response) {
        print("Got scripts: ", response)
        if (!response || !response.body) {
            print("No body in the response")
            return
        }

        const body = JSON.parse(response.body)

        print(body)

        const scripts = body.scripts

        for (let i in scripts) {
            if (scripts[i].name === "readers") {
                relayServerScriptId.current = scripts[i].id
            }
        }
    }

    enqueueShellyCall("KVS.Get", { key: "relay_password" }, function (relay_password) {
        enqueueShellyCall("HTTP.GET", {
            url: "http://admin:" + relay_password.value + "@" + "192.168.33.1/rpc/Script.List"
        }, onGotScripts)
    })
}

function init() {
    Shelly.call("KVS.GetMany", {}, function (result) {
        const keys = Object.keys(result.items)
        for (let i in keys) {
            let key = keys[i]
            let entry = result.items[key]
            prevKVS[key] = (entry ? entry.value : null)
        }
    })

    Shelly.addEventHandler(dispatchEvent)
    Shelly.addStatusHandler(dispatchStatus)

    RFIDScanner.start(handleRFIDRead);

    checkWifiStatus(true)

    updateWSConfig()
}


init()