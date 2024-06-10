const entries = [
    {
        "key": "bms/cfg/default_lock_state",
        "value": "CLOSED"
    },
    {
        "key": "bms/cfg/has_button",
        "value": false
    },
    {
        "key": "bms/cfg/has_door",
        "value": true
    },
    {
        "key": "bms/cfg/has_second_switch",
        "value": false
    },
    {
        "key": "bms/cfg/input",
        "value": 0
    },
    {
        "key": "bms/cfg/is_emergency",
        "value": false
    },
    {
        "key": "bms/cfg/log_count",
        "value": 0
    },
    {
        "key": "bms/cfg/min_rssi",
        "value": -65
    },
    {
        "key": "bms/cfg/permanent_state",
        "value": "NORMAL"
    },
    {
        "key": "bms/cfg/script_hash",
        "value": "3153a03a79f1d461e2ad78f17dbc7f54670fadb9dfd5ef3bcee0ae85ce1fbcc4"
    },
    {
        "key": "bms/cfg/timeout",
        "value": 3
    },
    {
        "key": "bms/i/588459608174",
        "value": null
    },
    {
        "key": "bms/i/598f2b3a-cdaf-43fc-ad35-8fcfcb6a7c4b",
        "value": null
    },
    {
        "key": "bms/i/790794951408",
        "value": null
    },
    {
        "key": "bms/i/99318115056",
        "value": null
    },
    {
        "key": "readers_script_hash",
        "value": "1720012f9cd30ca227f25affaefea4b6e5b4caddcf7af422f63b5951fdb5602c"
    }
]

function execute(i) {
    Shelly.call("KVS.Set", entries[i], function () {
        if(i < entries.length) {
            execute(i + 1)
        }
    })
}

execute(0)