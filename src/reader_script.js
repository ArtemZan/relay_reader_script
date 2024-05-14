// Possible values: 
// null - disconnected
// "wifi"
// "relay_AP"
var connectedAP = { current: null };
var shellyCallsQueue = [];
var relayServerScriptId = { current: null };
var wsPingTimer = { current: null };
var wsPongReceived = { current: true };
var wsPingTimedOut = { current: false };
var relayIP = "192.168.33.1";
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
function sendHTTPWithAuth(method, relative_uri, KVS, data, callback) {
    if (!KVS.relay_password) {
        print("No password");
        return;
    }
    var url = "http://admin:" + KVS.relay_password.value + "@" + relayIP + "/script/" + relayServerScriptId.current + relative_uri;
    var dataCopy = JSON.parse(JSON.stringify(data));
    dataCopy.url = url;
    Shelly.call(method, dataCopy, callback);
}
function checkWifiStatus() {
    var wifiStatus = Shelly.getComponentStatus("Wifi");
    var wifiConfig = Shelly.getComponentConfig("Wifi");
    print("Got wifi status: ", JSON.stringify(wifiStatus));
    try {
        connectedAP.current = wifiStatus.ssid === wifiConfig.sta1.ssid ? "wifi" : "relay_AP";
        if (connectedAP.current === "relay_AP") {
            getRelayServerScriptId();
        }
        else {
            startScanningForRelayAP();
        }
        print(connectedAP.current);
    }
    catch (e) {
        print("Failed to parse wifi config");
    }
}
function startScanningForRelayAP() {
    enqueueShellyCall("Wifi.Scan", null, function (result) {
        var networks = result.results;
        var wifiConfig = Shelly.getComponentConfig("Wifi");
        for (var _i = 0, networks_1 = networks; _i < networks_1.length; _i++) {
            var network = networks_1[_i];
            if (network.ssid === wifiConfig.sta.ssid) {
                print("STA found! Temporarily disabling sta1");
                Shelly.call("Wifi.SetConfig", {
                    config: {
                        sta1: {
                            enable: false
                        }
                    }
                });
                return;
            }
        }
        print("STA not found. Will try again in 20 seconds");
        Timer.set(20000, false, startScanningForRelayAP);
    });
}
function dispatchEvent(event) {
    print("============================================Event: ");
    print(JSON.stringify(event));
    var eventName = event.info.event;
    print(eventName);
    if (eventName === "sta_connect_fail" || eventName === "sta_disconnected") {
        connectedAP.current = null;
        return;
    }
    if (eventName === "sta_ip_acquired") {
        if (connectedAP.current === "relay_AP") {
            getRelayServerScriptId();
            // It is possible that sta1 has been disabled in order to switch to sta. 
            // Now it needs to be enabled as back-up wifi
            enqueueShellyCall("Wifi.SetConfig", {
                config: {
                    sta1: {
                        enable: true
                    }
                }
            });
        }
        else {
            startScanningForRelayAP();
        }
        return;
    }
    if (eventName === "sta_connected") {
        checkWifiStatus();
        return;
    }
}
function dispatchStatus(status) {
    print("Status change: ", JSON.stringify(status));
    if (status.component === "ws" && status.delta.connected) {
        wsPingTimedOut.current = false;
        wsPongReceived.current = true;
        wsPingTimer.current = Timer.set(10000, true, function () {
            if (!wsPongReceived.current) {
                Timer.clear(wsPingTimer.current);
                wsPingTimedOut.current = true;
                return;
            }
            Shelly.emitEvent("ping", null);
            wsPongReceived.current = false;
        });
    }
}
function handleRFIDRead(tag) {
    print("Scan card: ", tag);
    if (connectedAP.current === null) {
        print("The read card is ignored as the reader is not connected to wifi");
        return;
    }
    function onGotRelayUnlockResponse(response) {
        try {
            var responseData = JSON.parse(atob(response.body_b64));
            print(response, responseData);
            _onDoorUnlock(responseData.status);
        }
        catch (e) {
            print("Failed to handle unlock response: ", e);
        }
    }
    function onGotKVS(result) {
        var KVS = result.items;
        sendHTTPWithAuth("HTTP.GET", "/open_relay_with_rfid?cardId=" + tag, KVS, {}, onGotRelayUnlockResponse);
    }
    var wsStatus = Shelly.getComponentStatus("WS");
    if (wsStatus.connected && !wsPingTimedOut.current) {
        // TO DO: don't notify all through RPC channels
        Shelly.emitEvent("card_read", {
            cardId: tag
        });
    }
    else {
        if (connectedAP.current === "relay_AP") {
            // Make an HTTP request to the server on the relay
            Shelly.call("KVS.GetMany", {}, onGotKVS);
        }
        else {
            print("Not connected neither to the backend nor to the server on the relay. Ignoring the read card.");
        }
    }
}
function _onDoorUnlock(result) {
    print("Door unlock result: ", result);
    // SHow LED/buzz indication
    try {
        switch (result) {
            case "DOOR_UNLOCKED" /* UNLOCK_RESULT.DOOR_UNLOCKED */: {
                // Play happy sound - G chord starting in 5th octave - and set color to green
                RGBSet(0, 12, 0x00FF00);
                Timer.set(150, false, function () {
                    PWMSet(2, 587, 0.5);
                });
                Timer.set(200, false, function () {
                    PWMSet(2, 784, 0.3);
                    Timer.set(50, false, function () {
                        PWMSet(2, 1175, 0.3);
                    });
                    Timer.set(100, false, function () {
                        PWMSet(2, 1568, 0.3);
                        Timer.set(150, false, function () {
                            PWMSet(2, 0, 0.5);
                            RGBSet(0, 12, 0x000000);
                        });
                    });
                });
                break;
            }
            case "CARD_DECLINED" /* UNLOCK_RESULT.CARD_DECLINED */: {
                // Play sad sound (single E note in the 4th octave) and set color to red
                RGBSet(0, 12, 0xFF0000);
                PWMSet(2, 330, 0.5);
                Timer.set(200, false, function () {
                    PWMSet(2, 0, 0);
                });
                Timer.set(250, false, function () {
                    PWMSet(2, 330, 0.5);
                    Timer.set(250, false, function () {
                        PWMSet(2, 0, 0);
                        RGBSet(0, 12, 0x000000);
                    });
                });
                break;
            }
            case "CARD_ADDED" /* UNLOCK_RESULT.CARD_ADDED */: {
                RGBSet(0, 12, 0xFFff00);
                Timer.set(150, false, function () {
                    PWMSet(2, 587, 0.5);
                });
                Timer.set(300, false, function () {
                    PWMSet(2, 784, 0.3);
                    Timer.set(150, false, function () {
                        PWMSet(2, 1175, 0.3);
                    });
                    Timer.set(300, false, function () {
                        PWMSet(2, 1568, 0.3);
                    });
                    Timer.set(600, false, function () {
                        PWMSet(2, 0, 0.5);
                        RGBSet(0, 12, 0x000000);
                    });
                });
                break;
            }
        }
    }
    catch (e) {
        print("Failed to indicate the result from reading card: ", e);
        print("But the script is still alive");
    }
}
function _ping() {
    wsPongReceived.current = true;
}
// Looks for a script named "readers", which is running on the relay, and stores it in relayServerScriptId
function getRelayServerScriptId() {
    if (relayServerScriptId.current) {
        return;
    }
    function onGotScripts(response) {
        print("Got scripts: ", response);
        if (!response || !response.body) {
            print("No body in the response");
            return;
        }
        var body = JSON.parse(response.body);
        print(body);
        var scripts = body.scripts;
        for (var i in scripts) {
            if (scripts[i].name === "readers") {
                relayServerScriptId.current = scripts[i].id;
            }
        }
    }
    enqueueShellyCall("KVS.Get", { key: "relay_password" }, function (relay_password) {
        enqueueShellyCall("HTTP.GET", {
            url: "http://admin:" + relay_password.value + "@" + "192.168.33.1/rpc/Script.List"
        }, onGotScripts);
    });
}
function indicateInit() {
    try {
        RGBSet(0, 12, 0xffffff);
        Timer.set(1000, false, function () {
            RGBSet(0, 12, 0x000000);
        });
    }
    catch (e) {
        print("Failed to run 'indicateInit': ", e);
        print("But the script is still alive");
    }
}
function init() {
    indicateInit();
    Shelly.addEventHandler(dispatchEvent);
    Shelly.addStatusHandler(dispatchStatus);
    RFIDScanner.start(handleRFIDRead);
    checkWifiStatus();
}
init();
