import { type DragEvent, useEffect, useRef, useState } from 'react';

function hasFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/**
 * Drop target for files. `isDragging` is true while files are dragged over it. While the
 * hook is mounted, a file dropped anywhere else on the page is ignored instead of making
 * the browser open it in place of the app.
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave also fire for children; the count tells when the pointer really left.
  const depth = useRef(0);

  useEffect(() => {
    const ignore = (event: globalThis.DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    window.addEventListener('dragover', ignore);
    window.addEventListener('drop', ignore);
    return () => {
      window.removeEventListener('dragover', ignore);
      window.removeEventListener('drop', ignore);
    };
  }, []);

  function reset() {
    depth.current = 0;
    setIsDragging(false);
  }

  const dropProps = {
    onDragEnter: (event: DragEvent) => {
      if (!enabled || !hasFiles(event)) return;
      depth.current += 1;
      setIsDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!enabled || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event: DragEvent) => {
      if (!enabled || !hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setIsDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!enabled || !hasFiles(event)) return;
      event.preventDefault();
      reset();
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
  };

  return { isDragging: enabled && isDragging, dropProps };
}
