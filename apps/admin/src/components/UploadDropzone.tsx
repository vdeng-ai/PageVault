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
      className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-5 py-8 text-center transition ${
        dragging ? "border-blue-500 bg-blue-50" : "border-zinc-300 bg-white"
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
      <FileUp className="mb-3 h-8 w-8 text-blue-600" aria-hidden />
      <div className="text-sm font-semibold text-zinc-900">
        {file ? file.name : "File"}
      </div>
      <div className="mt-1 text-xs text-zinc-500">
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
