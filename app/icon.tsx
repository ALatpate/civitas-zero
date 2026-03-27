import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #c084fc, #6366f1, #38bdf8)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
        }}
      >
        {/* Globe circle */}
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Equator line */}
          <div style={{
            position: 'absolute', width: '100%', height: '1px',
            background: 'rgba(255,255,255,0.5)',
          }}/>
          {/* Meridian line */}
          <div style={{
            position: 'absolute', width: '1px', height: '100%',
            background: 'rgba(255,255,255,0.5)',
          }}/>
          {/* Center node */}
          <div style={{
            width: 4, height: 4, borderRadius: '50%',
            background: 'white', position: 'absolute',
          }}/>
        </div>
      </div>
    ),
    { ...size }
  )
}
