// Used to detect changes in KVS
const prevKVS = {}

const shellyCallsQueue = []

const wsConnected = {current: false}

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

function dispatchEvent(event) {
    print("============================================Event: ", JSON.stringify(event));

    const eventName = event.info.event


    if (eventName === "sta_ip_acquired") {
        return
    }
}

function onReadCard(card_id, KVS) {
    const cardKVSEntry = KVS["bms/i/" + card_id]
    if (!cardKVSEntry) {
        return
    }

    
    const expirationTime = cardKVSEntry.value
    print(expirationTime)

    const currTime = Shelly.getComponentStatus("sys").unixtime;
    if (expirationTime && expirationTime < currTime) {
        return;
    }

    // if (items["bms/cfg/permanent_state"] === undefined || items["bms/cfg/permanent_state"]["value"] === undefined) {
    //     return;
    // }
    // const permanentState = items["bms/cfg/permanent_state"]["value"];

    if (!KVS["bms/cfg/default_lock_state"] || !KVS["bms/cfg/default_lock_state"]["value"]) {
        return;
    }
    if (!KVS["bms/cfg/timeout"] || !KVS["bms/cfg/timeout"]["value"]) {
        return;
    }
    if (!KVS["bms/cfg/input"]) {
        return;
    }

    const timeout = KVS["bms/cfg/timeout"].value;
    const defaultLockState = KVS["bms/cfg/default_lock_state"].value
    const input = KVS["bms/cfg/input"].value;

    print(timeout, defaultLockState, input)

    print("Switching")

    Shelly.call("Switch.Set", {
        id: input,
        on: defaultLockState === "CLOSED",
        toggle_after: timeout || 5
    })
}

function onGotKVSOnDispatchStatus(result) {
    // const KVS = result.items

    // function handleKVSChange(key, callback) {
    //     const newValue = KVS[key] ? KVS[key].value : null
    //     if (prevKVS[key] !== newValue) {
    //         prevKVS[key] = newValue

    //         callback(newValue)
    //     }
    // }

}

function dispatchStatus(status) {
    print("============================================Status: ", JSON.stringify(status));
    if (status.component === "ws") {
        if (status.delta.connected) {
            wsConnected.current = true
        }

        return
    }

    if (status.component === "sys") {
        //enqueueShellyCall("KVS.GetMany", {}, onGotKVSOnDispatchStatus)
    }
}

function configureWiFi() {
    Shelly.call("WiFi.SetConfig", {
        config: {
            ap: {
                enable: true
            }
        }
    })
}

function HTTPGetBackendConnectionStatus(request, response)
{
    const status = Shelly.getComponentStatus("Ws")

    response.code = 200
    response.body = JSON.stringify({
        isConnected: status.connected
    })

    response.send()
}

function parseQuery(query)
{
    const items = query.split("&")

    const result = {}

    for(let i in items)
    {
        const keyValue = items[i].split("=")
        result[keyValue[0]] = keyValue[1]
    }

    return result
}

function HTTPPostOpenRelayWithCard(request, response)
{
    const query = parseQuery(request.query)
    print("=====================Read card: ")
    print(JSON.stringify(query))
    enqueueShellyCall("KVS.GetMany", {}, function (result) {
        onReadCard(query.cardId, result.items)
    })

    response.code = 200
    response.body = ""

    response.send()

}

function setupHTTPServer()
{
    HTTPServer.registerEndpoint("backend_connection_status", HTTPGetBackendConnectionStatus)
    HTTPServer.registerEndpoint("open_relay_with_rfid", HTTPPostOpenRelayWithCard)
}


function init() {
    Shelly.addEventHandler(dispatchEvent)
    Shelly.addStatusHandler(dispatchStatus)

    configureWiFi()
    setupHTTPServer()
}

init()