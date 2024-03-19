const {authRPC, CMDparams, updateConfig} = require("./common")

const requiredArgs = [
    "password",
    "wifiSSID",
    "relayAPSSID",
    "websocketServer",
    "relayPassword"
]

const optionalParams = [
    "relayAPPassword",
    "wifiPassword"
]

async function init()
{
    for(const argName of optionalParams)
    {
        if(!CMDparams[argName])
        {
            console.log(`Warning: missing optional argument '${argName}'`)
        }
    }

    let someMissing = false
    for(const argName of requiredArgs)
    {
        if(!CMDparams[argName])
        {
            console.log(`Error: missing required argument '${argName}'`)
            someMissing = true
        }
    }

    if(someMissing)
    {
        return
    }

    

    const res1 = await authRPC("KVS.Set", {
        key: "wifi",
        value: `{
            "ssid": "${CMDparams.wifiSSID}",
            "pass": "${CMDparams.wifiPassword || ""}"
        }`
    })

    console.log(res1)
    
    const res2 = await authRPC("KVS.Set", {
        key: "relay_AP",
        value: `{
            "ssid": "${CMDparams.relayAPSSID}",
            "pass": "${CMDparams.relayAPPassword || ""}"
        }`
    })

    console.log(res2)

        
    const res3 = await authRPC("KVS.Set", {
        key: "websocket_server",
        value: CMDparams.websocketServer
    })

    console.log(res3)

	const res4 = await authRPC("KVS.Set", {
        key: "relay_url",
        value: "http://192.168.33.1/script/3"
    })

    console.log(res4)

    const res5 = await authRPC("KVS.Set", {
        key: "relay_password",
        value: CMDparams.relayPassword
    })

    console.log(res5)

	updateConfig("Ws", {
		server: CMDparams.websocketServerUrl,
		ssl_ca: "*",
		enable: true
	})

    const res7 = await authRPC("Script.Create", {
        name: "rfid_script"
    })  
    console.log(res7)  
}

console.log(CMDparams)

init()

