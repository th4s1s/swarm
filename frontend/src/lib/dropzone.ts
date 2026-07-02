import { useCallback, useState, type DragEvent } from 'react';

/**
 * Drag-and-drop file handlers for a dropzone. Prevents the browser default (which otherwise
 * navigates to / downloads the dropped file) and hands the first dropped file to `onFile`.
 * Spread `handlers` onto the drop target; use `dragging` for a highlight.
 */
export function useZipDrop(onFile: (f: File) => void) {
  const [dragging, setDragging] = useState(false);
  const over = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const enter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);
  const leave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);
  const drop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );
  return { dragging, handlers: { onDragOver: over, onDragEnter: enter, onDragLeave: leave, onDrop: drop } };
}
