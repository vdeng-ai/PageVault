import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

export function UploadDropzone({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-5 py-8 text-center transition ${
        dragging ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50"
      }`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const nextFile = event.dataTransfer.files.item(0);
        if (nextFile) {
          onFile(nextFile);
        }
      }}
    >
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-md bg-white text-teal-700 ring-1 ring-slate-200">
        <FileUp className="h-6 w-6" aria-hidden />
      </div>
      <div className="max-w-full truncate text-sm font-semibold text-slate-950">
        {file ? file.name : "File"}
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500">
        {file
          ? `${(file.size / 1024).toFixed(1)} KB`
          : ".html / .htm / .md / .jpg / .png / .webp"}
      </div>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".html,.htm,.md,.markdown,.jpg,.jpeg,.png,.webp,text/html,text/markdown,image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const nextFile = event.target.files?.item(0);
          if (nextFile) {
            onFile(nextFile);
          }
        }}
      />
    </div>
  );
}
