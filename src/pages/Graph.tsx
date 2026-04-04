import { ArrowLeft, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { NodeObject } from "react-force-graph-2d";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getGraphData, getLocalGraph } from "../lib/tauri";
import type { GraphData } from "../lib/tauri";

interface GNode {
  id: number;
  title: string;
  subject_id: number | null;
  link_count: number;
}

interface GLink {
  source: number;
  target: number;
}

interface InternalGraphData {
  nodes: GNode[];
  links: GLink[];
}

const SUBJECT_COLORS = [
  "#a78bfa",
  "#5eead4",
  "#fbbf24",
  "#f87171",
  "#60a5fa",
  "#34d399",
];

function getCssVar(name: string, fallback: string): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

export function Graph() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const noteId = searchParams.get("note")
    ? Number(searchParams.get("note"))
    : null;

  const [graphData, setGraphData] = useState<InternalGraphData>({
    nodes: [],
    links: [],
  });
  const [search, setSearch] = useState("");
  const [showOrphans, setShowOrphans] = useState(true);
  const [localMode, setLocalMode] = useState(!!noteId);
  const [localDepth, setLocalDepth] = useState(2);
  const [selectedNode, setSelectedNode] = useState<number | null>(noteId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({
    width: 800,
    height: 600,
  });

  const loadGraph = useCallback(async () => {
    try {
      let data: GraphData;
      if (localMode && selectedNode) {
        data = await getLocalGraph(selectedNode, localDepth);
      } else {
        data = await getGraphData();
      }

      let nodes = data.nodes;
      if (!showOrphans) {
        const linkedIds = new Set<number>();
        for (const edge of data.edges) {
          linkedIds.add(edge.source);
          linkedIds.add(edge.target);
        }
        nodes = nodes.filter((n) => linkedIds.has(n.id));
      }

      if (search) {
        const q = search.toLowerCase();
        const matchIds = new Set(
          nodes
            .filter((n) => n.title.toLowerCase().includes(q))
            .map((n) => n.id),
        );
        // Keep matched nodes + their direct connections
        const connectedIds = new Set(matchIds);
        for (const edge of data.edges) {
          if (matchIds.has(edge.source)) connectedIds.add(edge.target);
          if (matchIds.has(edge.target)) connectedIds.add(edge.source);
        }
        nodes = nodes.filter((n) => connectedIds.has(n.id));
      }

      const nodeIds = new Set(nodes.map((n) => n.id));
      const links = data.edges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => ({ source: e.source, target: e.target }));

      setGraphData({ nodes, links });
    } catch (e) {
      console.error("Failed to load graph:", e);
    }
  }, [localMode, selectedNode, localDepth, showOrphans, search]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleNodeClick = useCallback(
    (node: NodeObject<GNode>) => {
      if (node.id != null) {
        if (localMode) {
          setSelectedNode(node.id as number);
        } else {
          navigate(`/workspace?note=${node.id}`);
        }
      }
    },
    [navigate, localMode],
  );

  const getNodeColor = useCallback(
    (node: NodeObject<GNode>) => {
      if (
        search &&
        !(node.title ?? "").toLowerCase().includes(search.toLowerCase())
      ) {
        return getCssVar("--color-border", "#334155");
      }
      if (node.subject_id) {
        return SUBJECT_COLORS[(node.subject_id - 1) % SUBJECT_COLORS.length];
      }
      return getCssVar("--color-text-muted", "#64748b");
    },
    [search],
  );

  const renderNode = useCallback(
    (
      node: NodeObject<GNode>,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const size = 3 + (node.link_count ?? 0);
      const color = getNodeColor(node);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Label (only when zoomed in enough)
      if (globalScale > 1.5) {
        const fontSize = Math.max(10 / globalScale, 2);
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = getCssVar("--color-text", "#e2e8f0");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(node.title ?? "", node.x ?? 0, (node.y ?? 0) + size + 2);
      }
    },
    [getNodeColor],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2">
        <button
          type="button"
          onClick={() => navigate("/workspace")}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} />
          Library
        </button>

        <div className="flex flex-1 items-center gap-2">
          <Search size={12} className="text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter notes..."
            className="flex-1 bg-transparent text-xs text-text placeholder:text-text-muted/50 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={showOrphans}
            onChange={(e) => setShowOrphans(e.target.checked)}
            className="rounded"
          />
          Orphans
        </label>

        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={localMode}
            onChange={(e) => {
              setLocalMode(e.target.checked);
              if (!e.target.checked) setSelectedNode(null);
            }}
            className="rounded"
          />
          Local
        </label>

        {localMode && (
          <select
            value={localDepth}
            onChange={(e) => setLocalDepth(Number(e.target.value))}
            className="rounded border border-border bg-panel px-2 py-1 text-xs text-text"
          >
            <option value={1}>Depth 1</option>
            <option value={2}>Depth 2</option>
            <option value={3}>Depth 3</option>
          </select>
        )}
      </div>

      {/* Graph */}
      <div ref={containerRef} className="flex-1">
        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeId="id"
            nodeLabel="title"
            nodeColor={getNodeColor}
            nodeVal={(node: NodeObject<GNode>) => 2 + (node.link_count ?? 0)}
            linkColor={() => getCssVar("--color-border", "#334155")}
            linkWidth={1}
            onNodeClick={handleNodeClick}
            nodeCanvasObject={renderNode}
            cooldownTicks={100}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            backgroundColor="transparent"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">
              No notes yet. Create or import a few linked notes to see how ideas
              connect.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
