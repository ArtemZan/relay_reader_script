// Used to detect changes in KVS
const prevKVS = {}

const shellyCallsQueue = []

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

function notifyReadersAboutWifi()
{
    Shelly.emitEvent("KVS.Set", {key: "wifi_restored", value: 1})
}

function dispatchEvent(event)
{
    print("============================================Event: ", JSON.stringify(event));

    const eventName = event.info.event


    if (eventName === "sta_ip_acquired") {
        notifyReadersAboutWifi()
        return
    }
}

function onReadCard(card_id, KVS)
{
    let isValid = false
    // TO DO: check for validity in KVS
    
    if(isValid)
    {
        Shelly.call("Switch.Set", {id: 0, on: true, toggle_after: 5})
    }
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

    handleKVSChange("read_card_id", function (card_id) {
        onReadCard(card_id, KVS)
    })
}

function dispatchStatus(status)
{
    if(status.component === "sys")
    {
        enqueueShellyCall("KVS.GetMany", {}, onGotKVSOnDispatchStatus)
    }
}

function init()
{
    Shelly.addEventHandler(dispatchEvent)
    Shelly.addStatusHandler(dispatchStatus)
}

init()