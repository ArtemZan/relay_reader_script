/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
function A() {
}
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
init();
System.register("reader_script", [], function (exports_1, context_1) {
    "use strict";
    var prevKVS, connectedAP, switchingWifi, wsTimerHandler, wifiCheckTimerHandler, shellyCallsQueue, wifiReconnectAttempts, wifiReconnectAttemptsLeft, wifiDisconnectedForSwitching, relayServerScriptId, relayIP;
    var __moduleName = context_1 && context_1.id;
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
    function hasRelayAP(callback) {
        enqueueShellyCall("KVS.Get", { key: "relay_AP" }, function (result) {
            callback(!!result && !!result.value);
        });
    }
    function forceSwitchWifi() {
        wifiDisconnectedForSwitching.current = true;
        enqueueShellyCall("Wifi.SetConfig", {
            config: {
                sta: {
                    enable: false
                }
            }
        });
    }
    function selectWiFiNetwork(config) {
        if (switchingWifi.current) {
            return;
        }
        switchingWifi.current = true;
        enqueueShellyCall("Wifi.SetConfig", {
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
            switchingWifi.current = false;
        });
    }
    function selectMainNetwork() {
        enqueueShellyCall("KVS.Get", { key: "wifi" }, function (main_wifi) {
            print("Main Wifi: ", main_wifi.value);
            try {
                selectWiFiNetwork(JSON.parse(main_wifi.value));
            }
            catch (e) {
                print("Failed to parse wifi");
            }
        });
    }
    function switchWiFiNetwork() {
        var wifiConfig = Shelly.getComponentConfig("Wifi");
        wifiDisconnectedForSwitching.current = false;
        function onGotNetworks(main_wifi, relay_AP) {
            if (wifiConfig.sta.ssid == main_wifi.ssid) {
                selectWiFiNetwork(relay_AP);
            }
            else {
                selectWiFiNetwork(main_wifi);
            }
        }
        function onGotMainWifi(main_wifi) {
            enqueueShellyCall("KVS.Get", { "key": "relay_AP" }, function (relay_AP) {
                print("Wifi: ", main_wifi.value, relay_AP.value);
                try {
                    onGotNetworks(JSON.parse(main_wifi.value), JSON.parse(relay_AP.value));
                }
                catch (e) {
                    print("Failed to parse wifi or relay AP");
                }
            });
        }
        enqueueShellyCall("KVS.Get", { "key": "wifi" }, onGotMainWifi);
    }
    function checkWifiStatus(select_main_if_disconnected) {
        var wifiStatus = Shelly.getComponentStatus("Wifi");
        print("Got wifi status: ", JSON.stringify(wifiStatus));
        if (wifiStatus.ssid === null) {
            print("Not connected to wifi");
            if (select_main_if_disconnected) {
                selectMainNetwork();
            }
            return;
        }
        function onGotWiFiUrl(result) {
            try {
                var wifiSSID = JSON.parse(result.value).ssid;
                connectedAP.current = wifiStatus.ssid === wifiSSID ? "wifi" : "relay_AP";
                if (connectedAP.current === "wifi") {
                    setWSConnectTimer();
                }
                else {
                    getRelayServerScriptId();
                    setBackendConnectionChecker();
                }
                updateWSConfig();
                print(connectedAP.current);
            }
            catch (e) {
                print("Failed to parse wifi config");
            }
        }
        enqueueShellyCall("KVS.Get", { key: "wifi" }, onGotWiFiUrl);
    }
    function setWSConnectTimer() {
        print("Ws timer set");
        if (wsTimerHandler.current) {
            Timer.clear(wsTimerHandler.current);
        }
        function onTimeOut() {
            var status = Shelly.getComponentStatus("WS");
            print("WS time passed. Status: ", JSON.stringify(status));
            if (!status.connected) {
                print("WS connection timed out after 1 minute. Switching to the other wifi network.");
                hasRelayAP(function (hasRelayAP) {
                    if (hasRelayAP) {
                        forceSwitchWifi();
                    }
                });
            }
        }
        wsTimerHandler.current = Timer.set(60 * 1000, false, onTimeOut);
    }
    function dispatchEvent(event) {
        print("============================================Event: ");
        print(JSON.stringify(event));
        var eventName = event.info.event;
        print(eventName);
        if (eventName === "sta_connect_fail") {
            wifiReconnectAttemptsLeft.current--;
            if (wifiReconnectAttemptsLeft.current <= 0) {
                wifiReconnectAttemptsLeft.current = wifiReconnectAttempts;
                switchWiFiNetwork();
            }
        }
        if (eventName === "sta_disconnected") {
            if (event.info.reason === 8 && !wifiDisconnectedForSwitching.current) {
                return;
            }
            wifiReconnectAttemptsLeft.current = wifiReconnectAttempts;
            switchWiFiNetwork();
        }
        if (eventName === "sta_connect_fail" || eventName === "sta_disconnected") {
            connectedAP.current = null;
            if (wifiCheckTimerHandler.current) {
                Timer.clear(wifiCheckTimerHandler.current);
                wifiCheckTimerHandler.current = null;
            }
            return;
        }
        if (eventName === "sta_ip_acquired") {
            if (connectedAP.current === "relay_AP") {
                getRelayServerScriptId();
            }
            return;
        }
        if (eventName === "sta_connected") {
            checkWifiStatus();
            return;
        }
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
        handleKVSChange("wifi", function (wifi) {
            selectWiFiNetwork(JSON.parse(wifi));
        });
        handleKVSChange("relay_AP", function (relay_AP) {
            if (connectedAP.current === "relay_AP") {
                selectWiFiNetwork(JSON.parse(relay_AP));
            }
        });
        handleKVSChange("websocket_server", function () {
            if (connectedAP.current === "wifi") {
                updateWSConfig();
            }
            else {
                selectMainNetwork();
            }
        });
        handleKVSChange("relay_ip", function (wifi) {
            if (connectedAP.current === "relay_AP") {
                updateWSConfig();
            }
        });
    }
    function dispatchStatus(status) {
        print("Status change: ", JSON.stringify(status));
        if (status.component === "ws") {
            if (!status.delta.connected) {
                forceSwitchWifi();
            }
            return;
        }
        if (status.component === "sys") {
            enqueueShellyCall("KVS.GetMany", {}, onGotKVSOnDispatchStatus);
            return;
        }
    }
    function handleRFIDRead(tag) {
        print("Scan card: ", tag);
        if (connectedAP.current === null) {
            print("The read card is ignored as the reader is not connected to wifi");
            return;
        }
        function onGotRelayUnlockResponse(response) {
            print(response);
        }
        function onGotKVS(result) {
            var KVS = result.items;
            sendHTTPWithAuth("HTTP.GET", "/open_relay_with_rfid?cardId=" + tag, KVS, {}, onGotRelayUnlockResponse);
        }
        if (connectedAP.current === "relay_AP") {
            Shelly.call("KVS.GetMany", {}, onGotKVS);
        }
        else {
            Shelly.emitEvent("card_read", {
                cardId: tag
            });
        }
    }
    function _onDoorUnlock(result) {
        print("Door unlock result: ", result);
        if (!RGBSet || !PWMSet) {
            return;
        }
        switch (result) {
            case "DOOR_UNLOCKED": {
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
            case "DOOR_UNLOCKED": {
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
            case "DOOR_UNLOCKED": {
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
    function updateWSConfig() {
        function onUpdateConfig(result, error_code, error_message) {
            if (!result) {
                print("Failed to update ws config: ", error_message);
                return;
            }
            if (result.restart_required) {
                enqueueShellyCall("Shelly.Reboot");
            }
        }
        function setWSUrl(url) {
            print("Use ws server: ", url);
            enqueueShellyCall("WS.SetConfig", {
                config: {
                    server: url,
                    ssl_ca: "*",
                    enable: true
                }
            }, onUpdateConfig);
        }
        function onGotServerUrl(result, error_code, error_message) {
            if (error_code || !result) {
                print("Abort ws connection, couldn't take ws url from KVS: ", error_message);
                return;
            }
            var server = result.value;
            setWSUrl(server);
        }
        print("updateWSConfig");
        if (connectedAP.current === "wifi") {
            enqueueShellyCall("KVS.Get", { "key": "websocket_server" }, onGotServerUrl);
        }
    }
    function setBackendConnectionChecker() {
        function onGotKVS(result) {
            var KVS = result.items;
            sendHTTPWithAuth("HTTP.GET", "/backend_connection_status", KVS, {}, function (response) {
                print("Got response from GET /backend_connection_status: ", JSON.stringify(response));
                if (!response || !response.body_b64) {
                    print("No body in the response");
                    return;
                }
                var body;
                try {
                    body = JSON.parse(atob(response.body_b64));
                }
                catch (e) {
                    print("Failed to parse response body");
                    return;
                }
                print(body);
                if (body.isConnected) {
                    forceSwitchWifi();
                }
            });
        }
        function check() {
            var wsStatus = Shelly.getComponentStatus("WS");
            var wifiStatus = Shelly.getComponentStatus("Wifi");
            if (wsStatus.connected || !wifiStatus.ssid) {
                return;
            }
            Shelly.call("KVS.GetMany", {}, onGotKVS);
        }
        if (wifiCheckTimerHandler.current) {
            Timer.clear(wifiCheckTimerHandler.current);
        }
        wifiCheckTimerHandler.current = Timer.set(60000, true, check);
    }
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
        RGBSet(0, 12, 0xffffff);
        Timer.set(1000, false, function () {
            RGBSet(0, 12, 0x000000);
        });
    }
    function init() {
        indicateInit();
        Shelly.call("KVS.GetMany", {}, function (result) {
            var keys = Object.keys(result.items);
            for (var i in keys) {
                var key = keys[i];
                var entry = result.items[key];
                prevKVS[key] = (entry ? entry.value : null);
            }
        });
        Shelly.addEventHandler(dispatchEvent);
        Shelly.addStatusHandler(dispatchStatus);
        RFIDScanner.start(handleRFIDRead);
        checkWifiStatus(true);
        updateWSConfig();
    }
    return {
        setters: [],
        execute: function () {
            prevKVS = {};
            connectedAP = { current: null };
            switchingWifi = { current: false };
            wsTimerHandler = { current: null };
            wifiCheckTimerHandler = { current: null };
            shellyCallsQueue = [];
            wifiReconnectAttempts = 1;
            wifiReconnectAttemptsLeft = { current: wifiReconnectAttempts };
            wifiDisconnectedForSwitching = { current: false };
            relayServerScriptId = { current: null };
            relayIP = "192.168.33.1";
            init();
        }
    };
});
