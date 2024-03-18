const {authRPC, CMDparams} = require("./common")


async function init()
{
    const res = await authRPC("KVS.Set", {
        key: "bms/i/" + CMDparams.id,
        value: null
    })

    console.log(res)
}

init()