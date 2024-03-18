# Reader and relay configuration
This guide lists all configuration, that must be set through BLE from the mobile application in order for the reader and the relay to work correctly. All these configs must be sent as RPC.


# Relay

### Authentication
Shelly.SetAuth - https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Shelly#shellysetauth

&nbsp;
### KVS configuration
1. bms/cfg/timeout
2. bms/cfg/default_lock_state
3. bms/cfg/input
4. RFID cards: bms/i/{card number}
```json
{
    "id":1,
    "method":"KVS.Set",
    "params":{
        "key": "bms/cfg/timeout",
        "value": 3
    }
}
```

&nbsp;
### WiFi
```json
{
    "id":1,
    "method":"WiFi.SetConfig",
    "params":{
        "config":{
            "sta":{
                "ssid":"Shelly-example-ssid",
                "pass":"",
                "is_open": true,
                "enable":true
            }
        }
    }
}
```

&nbsp;
### Websocket
```json
{
    "id":1,
    "method":"Ws.SetConfig",
    "params":{
        "config":{
            "ssl_ca":"*",
            "server": "the url of the websocket backend here",
            "enable": true
        }
    }
}
```

&nbsp;
# Reader



### Authentication
Shelly.SetAuth - https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Shelly#shellysetauth

&nbsp;
### Wifi

The reader will try to connect to `"relay_AP"` if connection to `"wifi"` couldn't be establshed.

```
RPC command: KVS.Set
```
```json
{
    "key": "wifi",
    "value": "{
        \"ssid\": \"mywifi\",
        \"pass\": \"mypass123\"
    }"
}
```

&nbsp;
### Relay AP
```
RPC command: KVS.Set
```
```json
{
    "key": "relay_AP",
    "value": "{
        \"ssid\": \"ShellyPlus1-80646FDB2A7C\",
        \"pass\": \"mypass123\"
    }"
}
```

&nbsp;
### Websocket server
```
RPC command: KVS.Set
```
```json
{
    "key": "websocket_server",
    "value": "ws://sdkfhdsk.com"
}
```

&nbsp;
### Relay url

```
RPC command: KVS.Set
```
```json
{
    "key": "relay_url",
    "value": "http://192.168.33.1/script/{script_id}"
}
```

&nbsp;
### Relay password

```
RPC command: KVS.Set
```
```json
{
    "key": "relay_password",
    "value": "2SAxYHN4"
}
```