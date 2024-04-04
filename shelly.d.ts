declare function print(...args: any[]): any;

declare namespace Shelly {
    type ComponentName = "Shelly" | "Sys" | "Switch" | "Wifi" | "WS" | "KVS"
    type CommonCommangs = "GetConfig" | "SetConfig" | "GetStatus"
    type ComponentCommand = CommonCommangs | "Get" | "Set" | "Delete" | "GetMany" |
        "Toggle" | "ResetCounters" |
        "ListMethods" | "GetDeviceInfo" | "ListProfiles" | "SetProfile"


    type MethodG<ComponentNameT extends ComponentName, ComponentCommandT extends ComponentCommand> = `${ComponentNameT}.${ComponentCommandT}`

    type Method = `${ComponentName}.${CommonCommangs}` |
        MethodG<"Shelly", "ListMethods"> | MethodG<"Switch", "GetDeviceInfo"> | MethodG<"Switch", "ListProfiles"> | MethodG<"Switch", "SetProfile"> |
        MethodG<"Switch", "Set"> | MethodG<"Switch", "Toggle"> | MethodG<"Switch", "ResetCounters"> |
        MethodG<"KVS", "Delete"> | MethodG<"KVS", "GetMany">

    type MethodCallback = (result: any, error_code?: number, error_message?: number, userdata?: any) => void

    function call(
        method: Method,
        params: string | { [key: string]: any },
        callback?: MethodCallback,
        userdata?: any): void;

    function getComponentStatus(component: ComponentName): any;

    type Event = {
        info: {
            event: string
        }
    }

    function addEventHandler(handler: (event: Event) => void): void

    type StatusChangeEvent = {
        component: string
        delta: any
    }

    function addStatusHandler(handler: (event: StatusChangeEvent) => void): void


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
        headers?: [string, string][]
        readonly send: () => boolean
    }

    type RequestHandler = (request: Request, response: Response) => void

    function registerEndpoint(uri: string, handler: RequestHandler): void
}