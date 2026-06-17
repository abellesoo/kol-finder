import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X, ChevronRight } from 'lucide-react'

export default function UploadStep({ onFiles }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState([])

  const addFiles = (incoming) => {
    const valid = Array.from(incoming).filter((f) => {
      if (!f.name.endsWith('.xlsx')) {
        alert(`${f.name} is not an .xlsx file — skipped.`)
        return false
      }
      return true
    })
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...valid.filter((f) => !names.has(f.name))]
    })
  }

  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name))

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-3">Step 1 of 3</p>
          <h1 className="text-3xl font-semibold text-ink mb-2">Upload Apify datasets</h1>
          <p className="text-ink/50 text-sm">
            Export your Instagram scraper results as .xlsx from Apify. You can upload multiple files — duplicates will be merged.
          </p>
        </div>

        <div
          className={`border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all
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
              {dragging ? 'Drop to upload' : 'Click or drag .xlsx files here'}
            </p>
            <p className="text-xs text-ink/30">Multiple files supported</p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        {files.length > 0 && (
          <div className="mt-5 text-left space-y-2">
            {files.map((f) => (
              <div key={f.name} className="flex items-center justify-between px-3 py-2 bg-mist/40 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet size={14} className="text-accent flex-shrink-0" />
                  <span className="font-mono text-xs text-ink/70 truncate">{f.name}</span>
                </div>
                <button onClick={() => removeFile(f.name)} className="ml-2 text-ink/30 hover:text-ink/60 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <button
            onClick={() => onFiles(files)}
            className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-medium text-sm bg-ink text-white hover:bg-ink/80 transition-all"
          >
            Parse {files.length} file{files.length > 1 ? 's' : ''}
            <ChevronRight size={16} />
          </button>
        )}

        <p className="mt-6 text-xs text-ink/30 font-mono text-center">
          Scraper: Instagram Scraper by Apify · Post-level export
        </p>
      </div>
    </div>
  )
}
