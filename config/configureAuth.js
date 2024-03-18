const {CMDparams, sendRPC, sha256, RPC} = require("./common")


async function init()
{
    const deviceInfo = await RPC("Shelly.GetDeviceInfo")
    
    console.log(deviceInfo)

    const response = await sendRPC("Shelly.SetAuth", {
        user: "admin",
        realm: deviceInfo.id,
        ha1: sha256("admin:" + deviceInfo.id + ":" + CMDparams.password)
    })

    console.log(await response.json())
}

init()

console.log(process.argv, CMDparams)
