// Shelly Access Control BLU button scanner
// ver 1.11

type KVS = { [key: string]: { value: any } }

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

function enqueueShellyCall(method: Shelly.Method, params?: any, callback?: Shelly.MethodCallback) {
    shellyCallsQueue.push([method, params, callback])

    if (shellyCallsQueue.length === 1) {
        callNext()
    }
}

type BufType = `${"U" | "I"}${"8" | "16" | "24"}` | "UUID"

let BTHome = {
    SVC_ID: "fcd2",
    T: {
        U8: { sz: 1 },
        I8: { sz: 1 },
        U16: { sz: 2 },
        I16: { sz: 2 },
        U24: { sz: 3 },
        I24: { sz: 3 },
        UUID: { sz: 16 },
        getByteSize: function (t) {
            if (typeof this[t] === "undefined") return 0xffffffff;
            return this[t]["sz"];
        },
    },
    M: [
        { i: 0x00, n: "PacketId", t: "U8" },
        { i: 0x01, n: "Battery", t: "U8", u: "%" },
        { i: 0x05, n: "Illuminance", t: "U8", f: 0.01 },
        { i: 0x1a, n: "Door", t: "U8" },
        { i: 0x20, n: "Moisture", t: "U8" },
        { i: 0x2d, n: "Window", t: "U8" },
        { i: 0x3a, n: "Button", t: "U8" },
        { i: 0x3f, n: "Rotation", t: "U16", f: 0.1 },
        { i: 0xff, n: "Identification", t: "UUID" }
    ],
    utoi: function (num: number, bitsz: number) {
        let mask = 1 << (bitsz - 1);
        return num & mask ? num - (1 << bitsz) : num;
    },
    getUInt8: function (buffer: string) {
        return buffer.at(0);
    },
    getInt8: function (buffer: string) {
        return this.utoi(this.getUInt8(buffer), 8);
    },
    getUInt16LE: function (buffer: string) {
        return 0xffff & (((buffer.at(1) as unknown as number) << 8) | (buffer.at(0) as unknown as number));
    },
    getInt16LE: function (buffer: string) {
        return this.utoi(this.getUInt16LE(buffer), 16);
    },
    getUInt24LE: function (buffer: string) {
        return (
            0x00ffffff & (((buffer.at(2) as unknown as number) << 16) | ((buffer.at(1) as unknown as number) << 8) | (buffer.at(0) as unknown as number))
        );
    },
    getInt24LE: function (buffer: string) {
        return this.utoi(this.getUInt24LE(buffer), 24);
    },
    halfByteToHexString: function (halfByte: number) {
        return halfByte.toString(16)
    },
    getUUID: function (buffer: string) {
        let result = "";
        for (let i = 0; i < 16; i++) {
            let byte = buffer.charCodeAt(i);
            result += this.halfByteToHexString(byte >> 4) + this.halfByteToHexString(byte & 0x0f);
            if (i === 3 || i === 5 || i === 7 || i === 9) {
                result += "-";
            }
        }
        return result;
    },
    findMeasurementType: function (mid: any) {
        for (let i in this.M) {
            if (this.M[i].i === mid) return this.M[i];
        }
        return null;
    },
    getBufValue: function (type: BufType, buffer: string) {
        if (buffer.length < this.T.getByteSize(type)) return null;
        if (type === "U8") return this.getUInt8(buffer);
        if (type === "I8") return this.getInt8(buffer);
        if (type === "U16") return this.getUInt16LE(buffer);
        if (type === "I16") return this.getInt16LE(buffer);
        if (type === "U24") return this.getUInt24LE(buffer);
        if (type === "I24") return this.getInt24LE(buffer);
        if (type === "UUID") return this.getUUID(buffer);
        return null;
    },
    unpack: function (buffer: string) {
        // beacons might not provide BTH service data
        if (typeof buffer !== "string" || buffer.length === 0) return null;
        let result = {};
        let device_info = buffer.at(0);
        result["encryption"] = device_info & 0x1 ? true : false;
        result["BTHome_version"] = (device_info >> 5) & 0x07;
        if (result["BTHome_version"] !== 2) return null;
        //Can not handle encrypted data
        if (result["encryption"]) return result;
        buffer = buffer.slice(1);
        while (buffer.length > 0) {
            let bth_m = this.findMeasurementType(buffer.at(0));
            if (!bth_m) {
                console.log("BTH: unknown type", buffer.at(0));
                break;
            }
            buffer = buffer.slice(1);
            let value = this.getBufValue(bth_m.t, buffer);
            if (value === null) break;
            if (typeof bth_m.f !== "undefined") value = value * bth_m.f;
            result[bth_m.n] = value;
            buffer = buffer.slice(this.T.getByteSize(bth_m.t));
        }
        return result;
    },
};

let iosPackets: any = {};

function handleScanEvent(ev: BLE.Scanner.ScanEvent, res: BLE.Scanner.ScanResult) {
    if (ev !== BLE.Scanner.SCAN_RESULT) return;
    // 0.14 doesn't support .startsWith and .substring
    if (res.service_uuids !== undefined && typeof res.local_name === "string" && res.local_name.indexOf("iOS") === 0) {
        let packetPart = res.local_name[3];
        if (packetPart === "1") {
            if (iosPackets[res.addr] === undefined) {
                iosPackets[res.addr] = {
                    addr: res.addr,
                    Identification: res.service_uuids[0],
                    PacketId: res.local_name.slice(4, res.local_name.length), // Remove "iOS" + packet part
                };
            }
        } else if (packetPart === "2") {
            if (iosPackets[res.addr] !== undefined && iosPackets[res.addr].PacketId === res.local_name.slice(4, res.local_name.length)) {
                Shelly.emitEvent("BLU_BUTTON", {
                    addr: iosPackets[res.addr].addr,
                    Identification: iosPackets[res.addr].Identification,
                    PacketId: iosPackets[res.addr].PacketId,
                    DeviceDeviceId: res.service_uuids[0].slice(24), // Strip leading zeros
                });
                iosPackets[res.addr] = undefined;
            }
        }
        return;
    }
    if (typeof res.service_data !== "object") return;
    if (typeof res.service_data[BTHome.SVC_ID] !== "string") return;
    let bthome_result = BTHome.unpack(res.service_data[BTHome.SVC_ID]);
    if (!bthome_result) {
        console.log(res.addr, "Failed to parse BTH data");
        return;
    }
    if (bthome_result.encryption) {
        // send raw ADV data, the server may want to decrypt
        bthome_result.adv_data = btoa(res.advData);
    }
    bthome_result.addr = res.addr;
    bthome_result.rssi = res.rssi;
    Shelly.emitEvent("BLU_BUTTON", bthome_result);
}
if ((Shelly.getComponentConfig('ble')).enable === false) {
    enqueueShellyCall("BLE.SetConfig", { config: { enable: true } }, function () {
        enqueueShellyCall("Shelly.Reboot");
    });
}
BLE.Scanner.Subscribe(handleScanEvent);
BLE.Scanner.Start({ duration_ms: BLE.Scanner.INFINITE_SCAN });



//-----------------//
// Autonomous mode //
//    By Infinno   //
//-----------------//

let UPPER_A_CODE_POINT = "A".at(0);
let UPPER_Z_CODE_POINT = "Z".at(0);
let LOWER_UPPER_DIFF = "a".at(0) - "A".at(0);

function toLowerCase(string) {
    let result = "";
    for (let i = 0; i < string.length; ++i) {
        let c = string.at(i);
        if (c >= UPPER_A_CODE_POINT && c <= UPPER_Z_CODE_POINT) {
            result += chr(c + LOWER_UPPER_DIFF);
        } else {
            result += chr(c);
        }
    }
    return result;
}

let logScriptId = undefined;

function handleLogScriptCreate(response) {
    // TODO: check response?
    logScriptId = response["id"];
    enqueueShellyCall("Script.PutCode", { id: logScriptId, code: " " });
}

enqueueShellyCall("Script.List", null, function (response) {
    // TODO: check response?
    for (let idx in response["scripts"]) {
        let script = response["scripts"][idx];
        if (script["name"] === "bms_logs") {
            logScriptId = script["id"];
            break;
        }
    }

    if (logScriptId === undefined) {
        enqueueShellyCall("Script.Create", { name: "bms_logs" }, handleLogScriptCreate)
    }
});

enqueueShellyCall("KVS.Get", { key: "bms/cfg/log_count" }, function (response) {
    if (!response || response["error"] !== null) {
        enqueueShellyCall("KVS.Set", { key: "bms/cfg/log_count", value: 0 });
    }
});

let lastIdentification = undefined;

function checkLogCount(response, _errorCode, _errorMessage, info) {
    let logCount = response["value"];
    if (logCount < 50) {
        let sysStatus = Shelly.getComponentStatus("sys");
        let log = {
            timestamp: sysStatus["unixtime"],
            identification: info["identification"],
            outcome: info["outcome"]
        };
        enqueueShellyCall("Script.PutCode", { id: logScriptId, code: JSON.stringify(log), append: true });
        enqueueShellyCall("KVS.Set", { key: "bms/cfg/log_count", value: logCount + 1 });
    }
}

function saveAttempt(identification, outcome) {
    enqueueShellyCall("KVS.Get", { key: "bms/cfg/log_count" }, checkLogCount, { identification: identification, outcome: outcome });
}

let LAST_PACKET_IDS = {};

function saveClose() {
    saveAttempt(lastIdentification, "CLOSED");
}

function handleKVSBluetoothButtonFetch(response, _errorCode, _errorMessage, info) {
    info = JSON.parse(info)
    let items = response["items"];
    if (items === undefined) {
        return;
    }

    if (items["bms/cfg/has_door"] === undefined || items["bms/cfg/has_door"]["value"] === undefined || !items["bms/cfg/has_door"]["value"]) {
        return;
    }

    if (info["error"] !== undefined) {
        saveAttempt(info["buttonId"], info["error"]);
        return;
    }

    let minRssi = -65;
    if (items["bms/cfg/min_rssi"] !== undefined && items["bms/cfg/min_rssi"]["value"] !== undefined) {
        minRssi = items["bms/cfg/min_rssi"]["value"];
    }
    if (info["rssi"] < minRssi) {
        return;
    }

    if (items["bms/cfg/permanent_state"] === undefined || items["bms/cfg/permanent_state"]["value"] === undefined) {
        return;
    }
    let permanentState = items["bms/cfg/permanent_state"]["value"];

    if (items["bms/cfg/default_lock_state"] === undefined || items["bms/cfg/default_lock_state"]["value"] === undefined) {
        return;
    }
    if (items["bms/cfg/timeout"] === undefined || items["bms/cfg/timeout"]["value"] === undefined) {
        return;
    }
    if (items["bms/cfg/input"] === undefined || items["bms/cfg/input"]["value"] === undefined) {
        return;
    }

    let defaultLockState = items["bms/cfg/default_lock_state"]["value"];
    let timeout = items["bms/cfg/timeout"]["value"];
    let input = items["bms/cfg/input"]["value"];

    if (permanentState === "DISARMED") {
        timeout = undefined;
    }

    enqueueShellyCall("Switch.Set", {
        id: input,
        on: defaultLockState !== "CLOSED",
        toggle_after: timeout
    });

    saveAttempt(info["buttonId"], "OK");
}

function checkButton(response, _errorCode, _errorMessage, info) {
    if (response === null) {
        return;
    }

    let expirationTime = response["value"];
    let currTime = Shelly.getComponentStatus("sys")["unixtime"];
    if (expirationTime && expirationTime < currTime) {
        enqueueShellyCall("KVS.GetMany", { match: "bms/cfg/*" }, handleKVSBluetoothButtonFetch, JSON.stringify({ buttonId: info.buttonId, error: "EXPIRED_IDENTIFICATION" }));
        return;
    }
    enqueueShellyCall("KVS.GetMany", { match: "bms/cfg/*" }, handleKVSBluetoothButtonFetch, JSON.stringify(info));
}

function handleBluetoothButton(eventData) {
    if (Shelly.getComponentStatus("ws").connected) {
        return;
    }

    if (eventData["info"]["data"]["DeviceDeviceId"] !== undefined && eventData["info"]["data"]["DeviceDeviceId"] !== Shelly.getDeviceInfo().mac) {
        return;
    }

    let buttonId;
    if (eventData["info"]["data"]["Identification"] === undefined) {
        buttonId = toLowerCase(eventData["info"]["data"]["addr"]);
    } else {
        buttonId = eventData["info"]["data"]["Identification"];
    }
    let packetId = eventData["info"]["data"]["PacketId"];
    if (LAST_PACKET_IDS[buttonId] === packetId) {
        return;
    }
    LAST_PACKET_IDS[buttonId] = packetId;
    enqueueShellyCall("KVS.Get", { key: "bms/i/" + buttonId }, checkButton, { buttonId: buttonId, rssi: eventData["info"]["data"]["rssi"] });
}

function handleKVSPhysicalButtonFetch(items: KVS) {
    if (items === undefined) {
        return;
    }

    if (items["bms/cfg/is_emergency"] === undefined || items["bms/cfg/is_emergency"]["value"] === undefined) {
        return;
    }

    if (items["bms/cfg/is_emergency"]["value"]) {
        saveAttempt(undefined, "EMERGENCY");
    } else {
        saveAttempt(undefined, "OK");
    }
}

function handlePhysicalButton(_eventData: Shelly.Event) {
    if (Shelly.getComponentStatus("WS").connected) {
        return;
    }

    getKVSForKeys([
        "bms/cfg/is_emergency"
    ], handleKVSPhysicalButtonFetch)

    enqueueShellyCall("KVS.GetMany", { match: "bms/cfg/*" }, handleKVSPhysicalButtonFetch);
}

function dispatchEvent(eventData: Shelly.Event) {
    if (eventData === undefined || eventData["info"] === undefined || eventData["info"]["event"] === undefined) {
        return;
    }
    let eventName = eventData["info"]["event"];
    if (eventName === "BLU_BUTTON") {
        handleBluetoothButton(eventData);
    } else if (eventName === "btn_down") {
        handlePhysicalButton(eventData);
    }
}

function handleKVSStatusFetch(items: KVS, statusDataJSON: string) {
    const statusData: Shelly.StatusChangeEvent = JSON.parse(statusDataJSON)
    print("handleKVSStatusFetch: ", items, statusData)

    if (items === undefined) {
        return;
    }

    if (items["bms/cfg/input"] === undefined || items["bms/cfg/input"]["value"] === undefined) {
        return;
    }
    let input = items["bms/cfg/input"]["value"];
    if (items["bms/cfg/permanent_state"] === undefined || items["bms/cfg/permanent_state"]["value"] === undefined) {
        return;
    }
    let permanentState = items["bms/cfg/permanent_state"]["value"];
    if (items["bms/cfg/default_lock_state"] === undefined || items["bms/cfg/default_lock_state"]["value"] === undefined) {
        return;
    }
    let defaultLockState = items["bms/cfg/default_lock_state"]["value"];
    if (items["bms/cfg/has_second_switch"] === undefined || items["bms/cfg/has_second_switch"]["value"] === undefined) {
        return;
    }
    let hasSecondSwitch = items["bms/cfg/has_second_switch"]["value"];

    if (statusData["component"] !== "switch:" + JSON.stringify(input)) {
        return;
    }

    let isClosed = permanentState !== "DISARMED" && defaultLockState === "CLOSED";

    if (!Shelly.getComponentStatus("WS").connected && statusData["delta"]["output"] === isClosed) {
        saveClose();
    }

    if (hasSecondSwitch) {
        enqueueShellyCall("Switch.Set", { id: 1, on: statusData["delta"]["output"] });
    }
}

function getKVSForKeys(keys: string[], callback: (items: KVS, param?: any) => void, callbackParam?: any) {
    const items: KVS = {}

    for (const i in keys) {
        const key = keys[i]
        enqueueShellyCall("KVS.Get", {
            key
        }, function (result) {
            items[key] = result

            if (Number(i) === keys.length - 1) {
                callback(items, callbackParam)
            }
        })
    }
}

function dispatchStatus(statusData: Shelly.StatusChangeEvent) {
    //     if (Shelly.getComponentStatus("ws").connected) {
    //         return;
    //     }

    if (statusData.component && statusData.component.indexOf("switch:") === 0) {
        getKVSForKeys([
            "bms/cfg/input",
            "bms/cfg/permanent_state",
            "bms/cfg/default_lock_state",
            "bms/cfg/has_second_switch"
        ], handleKVSStatusFetch, JSON.stringify(statusData));
    }
}

Shelly.addEventHandler(dispatchEvent);
Shelly.addStatusHandler(dispatchStatus);