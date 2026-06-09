import type cytoscape from "cytoscape";

type SaveFilePickerWindow = Window & typeof globalThis & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

export async function exportPng(cy: cytoscape.Core | null): Promise<void> {
  if (!cy) return;
  const blob = await cy.png({ output: "blob-promise", full: true, scale: 2, bg: "#ffffff" });
  const saved = await saveWithFilePicker(blob, "cti-dependency-graph.png", "image/png");
  if (saved) return;
  downloadBlob(blob, "cti-dependency-graph.png", true);
}

async function saveWithFilePicker(blob: Blob, filename: string, mimeType: string): Promise<boolean> {
  const pickerWindow = window as SaveFilePickerWindow;
  if (typeof pickerWindow.showSaveFilePicker !== "function") return false;

  try {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "PNG image",
          accept: {
            [mimeType]: [".png"],
          },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    console.error("Failed to save PNG with file picker", error);
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string, openPreviewOnFailure = false): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (openPreviewOnFailure) {
    window.setTimeout(() => {
      if (document.hasFocus()) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }, 150);
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
