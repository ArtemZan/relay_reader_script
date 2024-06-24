// Used to detect changes in KVS
var prevKVS = {};
var shellyCallsQueue = [];
var wsConnected = { current: false };
function callNext() {
    var call = shellyCallsQueue[0];
    if (!call) {
        return;
    }
    function onComplete(result) {
        print("onComplete");
        if (call[2]) {
            try {
                print("Calling callback for: ", call[0], "with result: ", JSON.stringify(result));
                call[2](result);
            }
            catch (e) {
                print("Shelly call caught an error: ", e);
            }
        }
        print("pop the call from queue. Calls left: ", shellyCallsQueue.length);
        shellyCallsQueue.splice(0, 1);
        callNext();
    }
    Shelly.call(call[0], call[1], onComplete);
}
function enqueueShellyCall(method, params, callback) {
    shellyCallsQueue.push([method, params, callback]);
    if (shellyCallsQueue.length === 1) {
        callNext();
    }
}
function logTime() {
    enqueueShellyCall("Sys.GetStatus", null, function (sys) {
        try {
            print("Current time: ", sys.time, ", unixtime: ", sys.unixtime, ", uptime: ", sys.uptime);
        }
        catch (e) {
            print("Failed to log time: ", e);
        }
    });
}
function dispatchEvent(event) {
    print("============================================Event: ", JSON.stringify(event));
    var eventName = event.info.event;
    if (eventName === "sta_ip_acquired") {
        return;
    }
}
function turnTheSwitch(KVS) {
    logTime();
    if (!KVS["bms/cfg/default_lock_state"] || !KVS["bms/cfg/default_lock_state"].value) {
        return;
    }
    if (!KVS["bms/cfg/timeout"] || !KVS["bms/cfg/timeout"].value) {
        return;
    }
    if (!KVS["bms/cfg/input"]) {
        return;
    }
    var timeout = KVS["bms/cfg/timeout"].value;
    var defaultLockState = KVS["bms/cfg/default_lock_state"].value;
    var input = KVS["bms/cfg/input"].value;
    print(timeout, defaultLockState, input);
    print("Switching");
    Shelly.call("Switch.Set", {
        id: input,
        on: defaultLockState === "OPEN",
        toggle_after: timeout || 5
    });
}
function onReadCard(card_id, KVS) {
    logTime();
    var cardKVSEntry = KVS["bms/i/" + card_id];
    if (!cardKVSEntry) {
        return "CARD_DECLINED" /* UNLOCK_RESULT.CARD_DECLINED */;
    }
    var expirationTime = cardKVSEntry.value;
    print(expirationTime);
    var currTime = Shelly.getComponentStatus("Sys").unixtime;
    if (expirationTime && expirationTime < currTime) {
        return "CARD_DECLINED" /* UNLOCK_RESULT.CARD_DECLINED */;
    }
    // if (items["bms/cfg/permanent_state"] === undefined || items["bms/cfg/permanent_state"]["value"] === undefined) {
    //     return;
    // }
    // const permanentState = items["bms/cfg/permanent_state"]["value"];
    turnTheSwitch(KVS);
    return "DOOR_UNLOCKED" /* UNLOCK_RESULT.DOOR_UNLOCKED */;
}
// function onGotKVSOnDispatchStatus(result: {items: KVS}) {
//     const KVS = result.items
//     function handleKVSChange(key: string, callback: (newValue: string) => void) {
//         const newValue = KVS[key] ? KVS[key].value : null
//         if (prevKVS[key] !== newValue) {
//             prevKVS[key] = newValue
//             callback(newValue)
//         }
//     }
//     function onAccepted(value?: string) {
//         if (value) {
//             turnTheSwitch(KVS)
//             enqueueShellyCall("KVS.Delete", { key: "accepted" })
//         }
//     }
//     handleKVSChange("accepted", onAccepted)
// }
function dispatchStatus(status) {
    print("============================================Status: ", JSON.stringify(status));
    if (status.component === "ws") {
        if (status.delta.connected) {
            wsConnected.current = true;
        }
        return;
    }
    // if (status.component === "sys") {
    //     enqueueShellyCall("KVS.GetMany", {
    //         match: ""
    //     }, onGotKVSOnDispatchStatus)
    // }
}
function configureWiFi() {
    Shelly.call("Wifi.SetConfig", {
        config: {
            ap: {
                enable: true
            }
        }
    });
}
function parseQuery(query) {
    var items = query.split("&");
    var result = {};
    for (var i in items) {
        var keyValue = items[i].split("=");
        result[keyValue[0]] = keyValue[1];
    }
    return result;
}
function getKVSOneByOne(keys, onResolve) {
    var kvs = {};
    var index = 0;
    function onGotItem(result) {
        kvs[keys[index]] = result;
        index++;
        getKVSItem();
    }
    function getKVSItem() {
        if (index === keys.length) {
            onResolve(kvs);
            return;
        }
        enqueueShellyCall("KVS.Get", {
            key: keys[index]
        }, onGotItem);
    }
}
function HTTPPostOpenRelayWithCard(request, response) {
    var query = parseQuery(request.query);
    print("=====================Read card: ");
    print(JSON.stringify(query));
    getKVSOneByOne([
        "bms/i/".concat(query.cardId),
        "bms/cfg/default_lock_state",
        "bms/cfg/timeout",
        "bms/cfg/input"
    ], function (result) {
        print(result);
        var status = onReadCard(query.cardId, result.items);
        response.code = 200;
        response.body = JSON.stringify({
            status: status
        });
        response.send();
    });
    // enqueueShellyCall("KVS.GetMany", {
    //     match: `bms/i/${query.cardId}|bms/cfg/default_lock_state|bms/cfg/timeout|bms/cfg/input`
    // }, function (result) {
    //     const status = onReadCard(query.cardId, result.items)
    //     response.code = 200
    //     response.body = JSON.stringify({
    //         status
    //     })
    //     response.send()
    // })
}
function setupHTTPServer() {
    HTTPServer.registerEndpoint("open_relay_with_rfid", HTTPPostOpenRelayWithCard);
}
function init() {
    Shelly.addEventHandler(dispatchEvent);
    Shelly.addStatusHandler(dispatchStatus);
    configureWiFi();
    setupHTTPServer();
}
init();
