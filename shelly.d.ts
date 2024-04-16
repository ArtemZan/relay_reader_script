declare function print(...args: any[]): any;

declare namespace Shelly {
    type ComponentName = "Shelly" | "Sys" | "Switch" | "Wifi" | "WS" | "KVS" | "HTTP"
    type CommonCommangs = "GetConfig" | "SetConfig" | "GetStatus"
    type ComponentCommand = CommonCommangs | "Get" | "Set" | "Delete" | "GetMany" |
        "Toggle" | "ResetCounters" |
        "ListMethods" | "GetDeviceInfo" | "ListProfiles" | "SetProfile" | "Reboot" |
        "GET" | "POST" | "Request"


    type MethodG<ComponentNameT extends ComponentName, ComponentCommandT extends ComponentCommand> = `${ComponentNameT}.${ComponentCommandT}`

    type Method = `${ComponentName}.${CommonCommangs}` |
        MethodG<"Shelly", "ListMethods"> | MethodG<"Shelly", "GetDeviceInfo"> | MethodG<"Shelly", "ListProfiles"> | MethodG<"Shelly", "SetProfile"> | MethodG<"Shelly", "Reboot"> |
        MethodG<"Switch", "Set"> | MethodG<"Switch", "Toggle"> | MethodG<"Switch", "ResetCounters"> |
        MethodG<"KVS", "Delete"> | MethodG<"KVS", "GetMany"> | MethodG<"KVS", "Get"> | MethodG<"KVS", "Set"> |
        MethodG<"HTTP", "GET"> | MethodG<"HTTP", "POST"> | MethodG<"HTTP", "Request">

    type MethodCallback = (result: any, error_code?: number, error_message?: string, userdata?: any) => void

    function call(
        method: Method,
        params: string | { [key: string]: any },
        callback?: MethodCallback,
        userdata?: any): void;

    function getComponentStatus(component: ComponentName): any;
    function getComponentConfig(component: ComponentName): any;

    type Event = {
        info: {
            event: string
            reason: number
        }
    }

    function addEventHandler(handler: (event: Event) => void): void

    function emitEvent(name: string, data: any): void

    type StatusChangeEvent = {
        component: string
        delta: any
    }

    function addStatusHandler(handler: (event: StatusChangeEvent) => void): void

    type KVS = { [key: string]: { value: any } }
}

declare namespace HTTPServer {
    type Method = "POST" | "GET"
    type Request = {
        readonly method: Method,
        readonly query?: string
        readonly headers: [string, string][]
        readonly body: string
    }

    type Response = {
        code: number
        body?: string
        body_b64?: string
        headers?: [string, string][]
        readonly send: () => boolean
    }

    type RequestHandler = (request: Request, response: Response) => void

    function registerEndpoint(uri: string, handler: RequestHandler): void
}


declare namespace Timer {
    type Handle = number 

    function set(time_ms: number, repeat: boolean, callback: Function): Handle
    function clear(handle: Handle): boolean | undefined
}

declare namespace RFIDScanner {
    function start(callback: (tag: string) => void): boolean
    function stop(): void
}