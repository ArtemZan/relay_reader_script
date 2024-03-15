function dispatchEvent(event) {
    print("============================================Event: ", JSON.stringify(event));

    const eventName = event.info.event


    if (eventName === "sta_ip_acquired") {
        return
    }
}


function HTTPPostOpenRelayWithCard(request, response)
{
    //const body = JSON.parse(request.body)
    print("=====================Read card: ")
    print(JSON.stringify(request))

    response.code = 200
    response.body = ""

    response.send()

}

function setupHTTPServer()
{
    HTTPServer.registerEndpoint("open_relay_with_rfid", HTTPPostOpenRelayWithCard)
}


function init() {
    Shelly.addEventHandler(dispatchEvent)

    setupHTTPServer()
}

init()