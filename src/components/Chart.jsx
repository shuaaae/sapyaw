import { useEffect, useRef } from 'react'
import ChartJS from 'chart.js/auto'

export default function Chart({ data, options, type = 'bar', height = 240 }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    chartRef.current = new ChartJS(ctx, {
      type,
      data,
      options,
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [data, options, type])

  return (
    <div className="w-full" style={{ height }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
