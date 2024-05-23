var shellyCallsQueue = [];
var relayServerScriptId = { current: null };
var wsPingTimer = { current: null };
var wsPongReceived = { current: true };
var wsPingTimedOut = { current: false };
var playingTones = { current: false };
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
    dataCopy.ssl_ca = "*";
    Shelly.call(method, dataCopy, callback);
}
function checkWSStatus() {
    var status = Shelly.getComponentStatus("WS");
    print("Check ws status ------------------------------: ", status);
    if (status.connected) {
        onWSConnect();
    }
}
function onDisconnectFromBackend() {
    getRelayServerScriptId();
}
function dispatchEvent(event) {
    print("============================================Event: ");
    print(JSON.stringify(event));
    var eventName = event.info.event;
    print(eventName);
    if (eventName === "sta_ip_acquired") {
        getRelayServerScriptId();
        return;
    }
}
function onWSConnect() {
    wsPingTimedOut.current = false;
    wsPongReceived.current = true;
    print("onWSConnect:", wsPingTimer.current);
    if (wsPingTimer.current) {
        return;
    }
    wsPingTimer.current = Timer.set(10000, true, function () {
        Shelly.emitEvent("ping", null);
        wsPongReceived.current = false;
        Timer.set(2000, false, function () {
            if (wsPongReceived.current) {
                return;
            }
            Timer.clear(wsPingTimer.current);
            wsPingTimer.current = null;
            wsPingTimedOut.current = true;
            onDisconnectFromBackend();
        });
    });
}
function dispatchStatus(status) {
    print("Status change: ", JSON.stringify(status));
    if (status.component === "ws") {
        if (status.delta.connected) {
            onWSConnect();
        }
        else {
            onDisconnectFromBackend();
        }
    }
}
function handleRFIDRead(tag) {
    print("Scan card: ", tag);
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
    var wifiStatus = Shelly.getComponentStatus("Wifi");
    if (!wifiStatus.ssid) {
        _onDoorUnlock("CARD_DECLINED" /* UNLOCK_RESULT.CARD_DECLINED */);
        print("Not connected to wifi. Ignoring the card.");
        return;
    }
    if (wsStatus.connected && !wsPingTimedOut.current) {
        // TO DO: don't notify through all RPC channels
        Shelly.emitEvent("card_read", {
            cardId: tag
        });
    }
    else {
        // Make an HTTP request to the server on the relay
        Shelly.call("KVS.GetMany", {}, onGotKVS);
    }
}
function playTones(tones, then) {
    playingTones.current = true;
    function playTone(i) {
        if (i >= tones.length) {
            playingTones.current = false;
            PWMSet(2, 0, 0.5);
            then === null || then === void 0 ? void 0 : then();
            return;
        }
        var tone = tones[i];
        PWMSet(2, tone.freq, 0.5);
        Timer.set(tone.duration, false, function () { return playTone(i + 1); });
    }
    try {
        playTone(0);
    }
    catch (e) {
        playingTones.current = false;
        print("Failed to play tones: ", e);
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
                playTones([
                    {
                        freq: 587,
                        duration: 50
                    },
                    {
                        freq: 784,
                        duration: 50
                    },
                    {
                        freq: 1175,
                        duration: 50
                    },
                    {
                        freq: 1568,
                        duration: 150
                    }
                ], function () {
                    RGBSet(0, 12, 0xFFFFFF);
                });
                break;
            }
            case "CARD_ADDED" /* UNLOCK_RESULT.CARD_ADDED */: {
                // RGBSet(0, 12, 0xFFff00);
                // playTones([
                //     {
                //         freq: 587,
                //         duration: 150
                //     },
                //     {
                //         freq: 784,
                //         duration: 150
                //     },
                //     {
                //         freq: 1175,
                //         duration: 150
                //     },
                //     {
                //         freq: 1568,
                //         duration: 300
                //     }
                // ], () => {
                //     RGBSet(0, 12, 0xFFFFFF);
                // })
                // break;
            }
            case "CARD_DECLINED" /* UNLOCK_RESULT.CARD_DECLINED */: {
                // Play sad sound (single E note in the 4th octave twice) and set color to red
                RGBSet(0, 12, 0xFF0000);
                playTones([
                    {
                        freq: 330,
                        duration: 200
                    },
                    {
                        freq: 0,
                        duration: 50
                    },
                    {
                        freq: 330,
                        duration: 250
                    }
                ], function () {
                    RGBSet(0, 12, 0xFFFFFF);
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
    var wifiStatus = Shelly.getComponentStatus("Wifi");
    if (!wifiStatus.ssid) {
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
            url: "http://admin:" + relay_password.value + "@" + "192.168.33.1/rpc/Script.List",
            ssl_ca: "*"
        }, onGotScripts);
    });
}
function indicateLED() {
    try {
        RGBSet(0, 12, 0xffffff);
    }
    catch (e) {
        print("Failed to run 'indicateLED': ", e);
        print("But the script is still alive");
    }
}
function init() {
    indicateLED();
    Shelly.addEventHandler(dispatchEvent);
    Shelly.addStatusHandler(dispatchStatus);
    RFIDScanner.start(handleRFIDRead);
    checkWifiStatus();
    checkWSStatus();
}
init();
