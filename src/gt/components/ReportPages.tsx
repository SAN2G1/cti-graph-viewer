import { useGtStore } from "../gtStore";
import type { ViewerPage } from "../types";

interface ReportPagesProps {
  pages: ViewerPage[] | undefined;
  emptyText: string;
}

export function ReportPages({ pages, emptyText }: ReportPagesProps) {
  const reportViewMode = useGtStore((s) => s.reportViewMode);
  const pageImageMap = useGtStore((s) => s.pageImageMap);

  if (!pages || pages.length === 0) {
    return <span className="empty-state">{emptyText}</span>;
  }

  return (
    <>
      {pages.map((page, index) => (
        <PageBlock key={index} page={page} mode={reportViewMode} imageUrl={pageImageMap[Number(page.page_number)]} />
      ))}
    </>
  );
}

function PageBlock({
  page,
  mode,
  imageUrl,
}: {
  page: ViewerPage;
  mode: "text" | "image";
  imageUrl: string | undefined;
}) {
  const pageNumber = String(page.page_number);

  if (mode === "image") {
    return (
      <div className="page-block">
        <span className="page-num-tag">Page {pageNumber}</span>
        <div className="page-img-wrap">
          {imageUrl ? (
            <img src={imageUrl} alt={`Page ${pageNumber}`} />
          ) : (
            <div className="page-img-unavailable">
              Click the <strong>Image folder</strong> button at the top and select the <code>outputs/images</code> folder.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-block">
      <span className="page-num-tag">Page {pageNumber}</span>
      <div className="page-text">{page.text || ""}</div>
    </div>
  );
}
