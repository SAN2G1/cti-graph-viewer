export function HelpPage() {
  return (
    <main className="help-page">
      <section className="help-hero">
        <div>
          <p className="help-eyebrow">Guide</p>
          <h2>CTI graph viewer 기능 설명</h2>
          <p className="help-intro">
            이 페이지는 현재 뷰어에서 제공하는 업로드, 그래프 탐색, 조건 구조 해석,
            진단 확인, 내보내기 기능을 빠르게 확인할 수 있도록 정리한 화면입니다.
          </p>
        </div>
        <nav className="help-nav" aria-label="Help sections">
          <a href="#uploads">업로드</a>
          <a href="#views">뷰 모드</a>
          <a href="#layout">레이아웃</a>
          <a href="#filters">검색·필터</a>
          <a href="#inspect">상세 확인</a>
          <a href="#diagnostics">진단</a>
          <a href="#export">내보내기</a>
        </nav>
      </section>

      <section className="help-grid">
        <HelpCard
          id="uploads"
          title="업로드"
          items={[
            ["Node Table", "공격 노드 정의를 불러옵니다. tactic, technique, requirements, parsers가 그래프의 중심이 됩니다."],
            ["Fact Table", "fact의 producer, consumer, external 여부와 level 정보를 읽어 의존성 조건을 구성합니다."],
            ["Combine Table", "AND/OR 조건 노드를 구성합니다. 복수 requirement를 묶는 구조를 시각화할 때 사용됩니다."],
            ["Combined Workbook", "Node Table, Fact Table, Combine Table 시트를 한 파일에서 한 번에 읽습니다."],
            ["GT Table", "정답 GT와 technique ID, technique name 비교 진단에 사용됩니다."],
          ]}
        />
        <HelpCard
          id="views"
          title="뷰 모드"
          items={[
            ["Full Dependency", "Node, Fact, Combine을 모두 보여줍니다. MITRE 전술 컬럼과 보조 레인 중심으로 배치되어 전체 구조를 읽기 쉽게 정리합니다."],
            ["Attack Flow", "Node 간 흐름을 중심으로 보여줍니다. fact는 주로 엣지 라벨로 표현되고, AND/OR 조건은 gate 노드로 표시되어 입력 조건 구조를 읽기 쉽게 만듭니다. 외부 입력만 별도 source 노드로 보일 수 있습니다."],
            ["Focus", "선택한 엔티티 기준 2-hop 이웃만 남겨서 특정 technique 주변 의존성만 좁혀서 봅니다."],
            ["Diagnostics", "진단 관련 엔티티를 강조하고 나머지를 약하게 처리해 오류 위치를 찾기 쉽게 합니다."],
          ]}
        />
        <HelpCard
          id="layout"
          title="레이아웃·탐색"
          items={[
            ["Auto Layout", "현재 뷰 기준 기본 레이아웃을 다시 적용합니다. Full 계열 뷰에서는 전술 기반 dependency lane 레이아웃을 사용합니다."],
            ["Auto Flow Layout", "흐름 중심 배치를 다시 정렬합니다. Attack Flow에서 node와 gate 관계를 더 읽기 쉽게 정리할 때 사용합니다."],
            ["Fit View", "현재 보이는 그래프 전체가 화면 안에 들어오도록 줌과 중심을 맞춥니다."],
            ["Drag", "노드를 드래그해서 위치를 조정할 수 있습니다. 큰 이동일 때만 downstream follow가 작동하도록 되어 있습니다."],
            ["Click", "노드를 선택하면 관련 edge와 주변 1-hop, 2-hop을 강조합니다. 선택 시 들어오는 엣지와 나가는 엣지가 다른 색으로 표시됩니다."],
          ]}
        />
        <HelpCard
          id="filters"
          title="검색·필터"
          items={[
            ["Search", "ID, technique, behavior, fact 이름, combine label 기준으로 검색합니다. 현재는 해석에 필요한 주변 문맥도 함께 남기도록 동작합니다."],
            ["Tactic Filter", "특정 전술에 속한 attack node를 중심으로 탐색 범위를 줄입니다."],
            ["Severity Filter", "error, warning, info 기준으로 진단 관련 대상을 좁혀 볼 수 있습니다."],
            ["External facts", "외부 입력 fact를 숨기거나 다시 표시합니다. Attack Flow에서는 외부 source 노드 표시 여부에도 반영됩니다."],
            ["execution_required", "execution_required 레벨 fact를 숨기거나 다시 표시합니다. Attack Flow에서도 동일하게 반영됩니다."],
          ]}
        />
        <HelpCard
          id="inspect"
          title="요약·상세 패널"
          items={[
            ["Summary Bar", "Nodes, Facts, Combines, Errors, Warnings, External Facts, Unreachable Nodes, Unproducible Facts 수를 보여줍니다."],
            ["Detail Panel", "선택한 node, fact, combine, diagnostic의 필드 값을 우측 패널에서 확인합니다."],
            ["Leaf Requirements", "node requirement를 combine 해석까지 반영해 leaf fact 기준으로 펼쳐서 보여줍니다."],
            ["Related Diagnostics", "선택 엔티티와 연결된 진단 메시지를 상세 패널에서 함께 확인합니다."],
          ]}
        />
        <HelpCard
          id="diagnostics"
          title="진단 패널"
          items={[
            ["Check 0", "테이블 헤더 순서와 이름이 정확한지 확인합니다."],
            ["Check 1 / 1b", "ID 형식, tactic/operator 값, relationship 형식과 허용 동사를 확인합니다."],
            ["Check 2", "존재하지 않는 참조나 잘못된 참조 타입을 찾습니다."],
            ["Check 3 / 3b", "producer-parser, requirement-consumer의 양방향 일관성을 확인합니다."],
            ["Check 4 / 5 / 6 / 7", "combine 구조, 외부 입력 일관성, 도달 가능성, GT 비교를 검사합니다."],
            ["Workbook location", "각 진단 카드와 detail panel에는 관련 table, row, column 위치가 함께 표시되어 원본 표에서 수정할 위치를 바로 찾을 수 있습니다."],
            ["Diagnostic Click", "진단 항목을 누르면 관련 ID가 그래프에서 강조되고 상세 패널에 메시지가 표시됩니다."],
          ]}
        />
        <HelpCard
          id="export"
          title="내보내기"
          items={[
            ["Export JSON", "현재 파싱된 workbook 결과와 진단 정보를 JSON으로 저장합니다."],
            ["Export PNG", "현재 Cytoscape 캔버스를 PNG 이미지로 저장합니다. 브라우저 환경에 따라 파일 저장기 또는 다운로드 방식이 사용됩니다."],
            ["Reset", "선택 상태와 검색을 초기화해서 다시 탐색을 시작합니다."],
            ["Help", "현재 화면 대신 기능 설명 페이지를 열고, Back to Viewer로 다시 그래프 화면으로 돌아옵니다."],
          ]}
        />
      </section>
    </main>
  );
}

function HelpCard({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: Array<[string, string]>;
}) {
  return (
    <section id={id} className="help-card">
      <h3>{title}</h3>
      <dl className="help-list">
        {items.map(([label, description]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
