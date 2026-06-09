import type { ViewerReqItem } from "../types";

export function RequirementsTree({ items }: { items: ViewerReqItem[] | undefined }) {
  if (!items || items.length === 0) {
    return <span className="empty-state">Requirements 없음</span>;
  }
  return (
    <ul className="req-tree">
      {items.map((item, index) => (
        <ReqItem key={index} item={item} />
      ))}
    </ul>
  );
}

function ReqItem({ item }: { item: ViewerReqItem }) {
  if (item.type === "fact") {
    const inferred = item.inferred_flag;
    return (
      <li className="req-tree-item">
        <div className={`fact-chip${inferred ? " inferred" : ""}`}>
          <div className="fact-content">
            <span className="fact-name">{item.name || item.fact_id || "—"}</span>
            {item.description ? <span className="fact-desc">{item.description}</span> : null}
          </div>
          {inferred ? <span className="fact-inferred-badge">Inferred</span> : null}
        </div>
      </li>
    );
  }

  if (item.type === "combine") {
    const opClass = (item.operator || "AND") === "AND" ? "combine-and" : "combine-or";
    return (
      <li className="req-tree-item">
        <div className={`combine-header ${opClass}`}>
          {item.operator || "AND"}
          {item.label ? <span className="combine-label">{item.label}</span> : null}
        </div>
        {item.members && item.members.length ? (
          <ul className="req-children">
            {item.members.map((member, index) => (
              <ReqItem key={index} item={member} />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  return null;
}
