import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet } from 'lucide-react'

export default function UploadStep({ onFile }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    if (!file.name.endsWith('.xlsx')) {
      alert('Please upload an .xlsx file from Apify.')
      return
    }
    onFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-lg w-full text-center">
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-3">Step 1 of 3</p>
        <h1 className="text-3xl font-semibold text-ink mb-2">Upload Apify dataset</h1>
        <p className="text-ink/50 mb-10 text-sm">
          Export your Instagram scraper results as .xlsx from Apify, then drop it here.
        </p>

        <div
          className={`border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-all
            ${dragging ? 'border-accent bg-accent-dim/30' : 'border-mist hover:border-accent/50 hover:bg-accent-dim/10'}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-3">
            {dragging
              ? <Upload size={32} className="text-accent" />
              : <FileSpreadsheet size={32} className="text-ink/30" />
            }
            <p className="text-sm text-ink/50">
              {dragging ? 'Drop to upload' : 'Click or drag your .xlsx file here'}
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        <p className="mt-6 text-xs text-ink/30 font-mono">
          Scraper: Instagram Scraper by Apify · Post-level export
        </p>
      </div>
    </div>
  )
}
