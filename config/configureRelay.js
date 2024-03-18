const {authRPC, CMDparams, updateConfig} = require("./common")

async function init()
{
    const res1 = await authRPC("KVS.Set", {
        key: "bms/cfg/timeout",
        value: 3
    })

    console.log(res1)
    
    const res2 = await authRPC("KVS.Set", {
        key: "bms/cfg/default_lock_state",
        value: "CLOSED"
    })

    console.log(res2)

        
    const res3 = await authRPC("KVS.Set", {
        key: "bms/cfg/input",
        value: 0
    })

    console.log(res3)

	const res4 = await authRPC("KVS.Set", {
        key: "bms/cfg/input",
        value: 0
    })

    console.log(res3)

	updateConfig("Ws", {
		server: CMDparams.websocketServerUrl,
		ssl_ca: "*",
		enable: true
	})
}

init()

console.log(process.argv, CMDparams)
