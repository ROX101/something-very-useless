import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(value, { errorCorrectionLevel: value.length > 200 ? 'L' : 'M', margin: 3, width: size * 3, color: { dark: '#111111', light: '#FFFFFF' } })
      .then(setSrc)
      .catch(() => setSrc(''))
  }, [value, size])
  return src ? <img src={src} width={size} height={size} alt={label} className="block" /> : <div style={{ width: size, height: size }} className="bg-page" />
}
