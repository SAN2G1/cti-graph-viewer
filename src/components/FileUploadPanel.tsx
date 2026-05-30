import { readWorkbook, type UploadedTables } from "../utils/workbookParser";
import { useGraphStore } from "../store/graphStore";

const uploadItems: Array<{ kind: keyof UploadedTables; label: string }> = [
  { kind: "node", label: "Node Table" },
  { kind: "fact", label: "Fact Table" },
  { kind: "combine", label: "Combine Table" },
  { kind: "combined", label: "Combined Workbook" },
  { kind: "gt", label: "GT Table" },
];

export function FileUploadPanel() {
  const setWorkbook = useGraphStore((state) => state.setWorkbook);

  return (
    <div className="upload-strip" aria-label="Workbook uploads">
      {uploadItems.map((item) => (
        <label className="upload-button" key={item.kind}>
          <span>{item.label}</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              const workbook = await readWorkbook(file);
              setWorkbook(item.kind, workbook);
              event.currentTarget.value = "";
            }}
          />
        </label>
      ))}
    </div>
  );
}
