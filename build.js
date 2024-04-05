System.register("file1", [], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    function A() {
    }
    exports_1("A", A);
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("reader_relay_script", ["file1"], function (exports_2, context_2) {
    "use strict";
    var file1_1, prevKVS, shellyCallsQueue, wsConnected;
    var __moduleName = context_2 && context_2.id;
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
    function dispatchEvent(event) {
        print("============================================Event: ", JSON.stringify(event));
        var eventName = event.info.event;
        if (eventName === "sta_ip_acquired") {
            return;
        }
    }
    function turnTheSwitch(KVS) {
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
            on: defaultLockState === "CLOSED",
            toggle_after: timeout || 5
        });
    }
    function onReadCard(card_id, KVS) {
        var cardKVSEntry = KVS["bms/i/" + card_id];
        if (!cardKVSEntry) {
            return;
        }
        var expirationTime = cardKVSEntry.value;
        print(expirationTime);
        var currTime = Shelly.getComponentStatus("Sys").unixtime;
        if (expirationTime && expirationTime < currTime) {
            return;
        }
        turnTheSwitch(KVS);
    }
    function onGotKVSOnDispatchStatus(result) {
        var KVS = result.items;
        function handleKVSChange(key, callback) {
            var newValue = KVS[key] ? KVS[key].value : null;
            if (prevKVS[key] !== newValue) {
                prevKVS[key] = newValue;
                callback(newValue);
            }
        }
        function onAccepted(value) {
            if (value) {
                turnTheSwitch(KVS);
                enqueueShellyCall("KVS.Delete", { key: "accepted" });
            }
        }
        handleKVSChange("accepted", onAccepted);
    }
    function dispatchStatus(status) {
        print("============================================Status: ", JSON.stringify(status));
        if (status.component === "ws") {
            if (status.delta.connected) {
                wsConnected.current = true;
            }
            return;
        }
        if (status.component === "sys") {
            enqueueShellyCall("KVS.GetMany", {}, onGotKVSOnDispatchStatus);
        }
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
    function HTTPGetBackendConnectionStatus(request, response) {
        var status = Shelly.getComponentStatus("WS");
        response.code = 200;
        response.body = JSON.stringify({
            isConnected: status.connected
        });
        response.send();
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
    function HTTPPostOpenRelayWithCard(request, response) {
        var query = parseQuery(request.query);
        print("=====================Read card: ");
        print(JSON.stringify(query));
        enqueueShellyCall("KVS.GetMany", {}, function (result) {
            onReadCard(query.cardId, result.items);
        });
        response.code = 200;
        response.body = "";
        response.send();
    }
    function setupHTTPServer() {
        HTTPServer.registerEndpoint("backend_connection_status", HTTPGetBackendConnectionStatus);
        HTTPServer.registerEndpoint("open_relay_with_rfid", HTTPPostOpenRelayWithCard);
    }
    function init() {
        Shelly.addEventHandler(dispatchEvent);
        Shelly.addStatusHandler(dispatchStatus);
        configureWiFi();
        setupHTTPServer();
    }
    return {
        setters: [
            function (file1_1_1) {
                file1_1 = file1_1_1;
            }
        ],
        execute: function () {
            file1_1.A();
            prevKVS = {};
            shellyCallsQueue = [];
            wsConnected = { current: false };
            init();
        }
    };
});
