const hex = "32be2452490f46aeb60a859d2ca5f08e"
let res = ""

for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.slice(i, i + 2), 16)
    res += String.fromCharCode(charCode)
}

console.log(res)

const json = JSON.stringify({
    "some prefix0": [res]
})

console.log(json)

const decoded = JSON
    .parse(json)
    ["some prefix0"][0]
    .split("")
    .map(ch => ch
        .charCodeAt(0)
        .toString(16)
        .padStart(2, "0"))
    .join("")

console.log(decoded, decoded === hex)
