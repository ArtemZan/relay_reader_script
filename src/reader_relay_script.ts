type KVS = {[key: string]: {value: any}}

// Used to detect changes in KVS
const prevKVS: KVS = {}

type ShellyCall = [Shelly.Method, any, Shelly.MethodCallback]

const shellyCallsQueue: ShellyCall[] = []

const wsConnected = { current: false }

function callNext() {
    const call = shellyCallsQueue[0]
    if (!call) {
        return
    }

    function onComplete(result: any) {
        print("onComplete")

        if (call[2]) {
            try {
                print("Calling callback for: ", call[0], "with result: ", JSON.stringify(result))
                call[2](result)
            }
            catch (e) {
                print("Shelly call caught an error: ", e)
            }
        }

        print("pop the call from queue. Calls left: ", shellyCallsQueue.length)

        shellyCallsQueue.splice(0, 1)
        callNext()
    }

    Shelly.call(call[0], call[1], onComplete)
}

function enqueueShellyCall(method: Shelly.Method, params: any, callback?: Shelly.MethodCallback) {
    shellyCallsQueue.push([method, params, callback])

    if (shellyCallsQueue.length === 1) {
        callNext()
    }
}

function dispatchEvent(event: Shelly.Event) {
    print("============================================Event: ", JSON.stringify(event));

    const eventName = event.info.event


    if (eventName === "sta_ip_acquired") {
        return
    }
}

function turnTheSwitch(KVS: KVS) {
    if (!KVS["bms/cfg/default_lock_state"] || !KVS["bms/cfg/default_lock_state"].value) {
        return;
    }
    if (!KVS["bms/cfg/timeout"] || !KVS["bms/cfg/timeout"].value) {
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

function onReadCard(card_id: string, KVS: KVS) {
    const cardKVSEntry = KVS["bms/i/" + card_id]
    if (!cardKVSEntry) {
        return UNLOCK_RESULT.CARD_DECLINED
    }


    const expirationTime = cardKVSEntry.value
    print(expirationTime)

    const currTime = Shelly.getComponentStatus("Sys").unixtime;
    if (expirationTime && expirationTime < currTime) {
        return UNLOCK_RESULT.CARD_DECLINED
    }

    // if (items["bms/cfg/permanent_state"] === undefined || items["bms/cfg/permanent_state"]["value"] === undefined) {
    //     return;
    // }
    // const permanentState = items["bms/cfg/permanent_state"]["value"];

    turnTheSwitch(KVS)

    return UNLOCK_RESULT.DOOR_UNLOCKED
}

function onGotKVSOnDispatchStatus(result: {items: KVS}) {
    const KVS = result.items

    function handleKVSChange(key: string, callback: (newValue: string) => void) {
        const newValue = KVS[key] ? KVS[key].value : null
        if (prevKVS[key] !== newValue) {
            prevKVS[key] = newValue

            callback(newValue)
        }
    }

    function onAccepted(value?: string) {
        if (value) {
            turnTheSwitch(KVS)
            enqueueShellyCall("KVS.Delete", { key: "accepted" })
        }
    }

    handleKVSChange("accepted", onAccepted)

}

function dispatchStatus(status: Shelly.StatusChangeEvent) {
    print("============================================Status: ", JSON.stringify(status));
    if (status.component === "ws") {
        if (status.delta.connected) {
            wsConnected.current = true
        }

        return
    }

    if (status.component === "sys") {
        enqueueShellyCall("KVS.GetMany", {}, onGotKVSOnDispatchStatus)
    }
}

function configureWiFi() {
    Shelly.call("Wifi.SetConfig", {
        config: {
            ap: {
                enable: true
            }
        }
    })
}


function parseQuery(query: string) {
    const items = query.split("&")

    const result: {[key: string]: string} = {}

    for (let i in items) {
        const keyValue = items[i].split("=")
        result[keyValue[0]] = keyValue[1]
    }

    return result
}

const enum UNLOCK_RESULT {
    DOOR_UNLOCKED = "DOOR_UNLOCKED",
    CARD_DECLINED = "CARD_DECLINED",
    CARD_ADDED = "CARD_ADDED"
}

function HTTPPostOpenRelayWithCard(request: HTTPServer.Request, response: HTTPServer.Response) {
    const query = parseQuery(request.query)
    print("=====================Read card: ")
    print(JSON.stringify(query))
    enqueueShellyCall("KVS.GetMany", {}, function (result) {
        const status = onReadCard(query.cardId, result.items)

        response.code = 200
        response.body = JSON.stringify({
            status
        })
    
        response.send()
    })


}

function setupHTTPServer() {
    HTTPServer.registerEndpoint("open_relay_with_rfid", HTTPPostOpenRelayWithCard)
}


function init() {
    Shelly.addEventHandler(dispatchEvent)
    Shelly.addStatusHandler(dispatchStatus)

    configureWiFi()
    setupHTTPServer()
}

init()