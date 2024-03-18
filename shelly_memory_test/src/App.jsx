import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [items, setItems] = useState([])
  const [peak, setPeak] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const interval = setInterval(async () => {
      fetch("http://192.168.33.1/rpc/Script.GetStatus?id=1")
        .then(resp => resp.json())
        .then(data => {
          setItems(items => [...items, data.mem_used])
          setPeak(data.mem_peak)
          setTotal(data.mem_used + data.mem_free)
        })
    }, 3000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return <div style={{display: "flex", flexDirection: "column", height: "100%"}}>

    <button onClick={() => setItems([])} style={{margin: "10px auto"}}>Clear</button>
    Peak: {peak} / {total}

    <div style={{ display: "flex", gap: "1px", height: "100%", alignItems: "flex-end" }}>
      {items.map((item, index) => <div key={index} style={{
        height: item / 100,
        width: "5px",
        backgroundColor: "green"

      }}>

      </div>)}
    </div>
  </div>
}

export default App
