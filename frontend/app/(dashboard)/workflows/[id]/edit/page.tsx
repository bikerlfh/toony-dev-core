"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  type OnNodesChange,
  BackgroundVariant,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  getWorkflow,
  updateWorkflow,
  createNode,
  updateNode,
  deleteNode,
  createEdge,
  deleteEdge,
} from "@/lib/api/workflows";
import { listSubAgents } from "@/lib/api/sub-agents";
import { listSkills } from "@/lib/api/skills";
import { listLabels } from "@/lib/api/workspace";
import { listOrganizations } from "@/lib/api/organizations";
import { listProjects } from "@/lib/api/projects";
import { Select } from "@/components/ui/select";
import type {
  WorkflowDetail,
  WorkflowNodeData,
  SubAgentList,
  SkillList,
  Label,
  Organization,
  ProjectList,
} from "@/types";

/* ── Custom node ────────────────────────────────────── */

type WfNodeData = {
  label: string;
  nodeType: "SUBAGENT" | "SKILL";
  slug: string;
  [key: string]: unknown;
};

function WorkflowNodeComponent({ data }: { data: WfNodeData }) {
  const color = data.nodeType === "SUBAGENT" ? "#818cf8" : "#34d399";
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 shadow-lg min-w-[120px]">
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />
      <div className="flex items-center gap-2">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {data.nodeType === "SUBAGENT" ? "SA" : "SK"}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-slate-200">
            {data.label}
          </div>
          <div className="truncate text-[10px] text-slate-500">
            {data.slug}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-500"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNodeComponent,
};

/* ── Helpers ────────────────────────────────────────── */

function apiNodeToFlowNode(n: WorkflowNodeData): Node {
  const isSubAgent = n.node_type === "SUBAGENT";
  return {
    id: n.id,
    type: "workflowNode",
    position: { x: n.position_x, y: n.position_y },
    data: {
      label: isSubAgent
        ? (n.sub_agent_slug ?? "Sub-Agent")
        : (n.skill_slug ?? "Skill"),
      nodeType: n.node_type,
      slug: (isSubAgent ? n.sub_agent_slug : n.skill_slug) ?? "",
    },
  };
}

/* ── Catalog item ───────────────────────────────────── */

interface CatalogItem {
  id: string;
  name: string;
  slug: string;
  type: "SUBAGENT" | "SKILL";
}

function CatalogEntry({ item }: { item: CatalogItem }) {
  const color = item.type === "SUBAGENT" ? "#818cf8" : "#34d399";

  function onDragStart(e: DragEvent) {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        catalogId: item.id,
        catalogType: item.type,
        catalogName: item.name,
        catalogSlug: item.slug,
      })
    );
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex cursor-grab items-center gap-2 rounded-md border border-slate-800/40 bg-slate-900/40 px-2.5 py-2 transition-colors hover:border-slate-700 hover:bg-slate-900 active:cursor-grabbing"
    >
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold"
        style={{ backgroundColor: `${color}18`, color }}
      >
        {item.type === "SUBAGENT" ? "SA" : "SK"}
      </div>
      <span className="truncate text-xs text-slate-300">{item.name}</span>
    </div>
  );
}

/* ── Help row ──────────────────────────────────────── */

function HelpRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-wrap gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border border-slate-700/60 bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
          >
            {k}
          </kbd>
        ))}
      </div>
      <span className="text-right text-[11px] text-slate-500">{desc}</span>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────── */

export default function WorkflowEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  /* ── State ──────────────────────────────────────── */

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Workflow properties form
  const [wfName, setWfName] = useState("");
  const [wfDescription, setWfDescription] = useState("");
  const [wfLabelIds, setWfLabelIds] = useState<string[]>([]);
  const [wfOrgId, setWfOrgId] = useState<string | null>(null);
  const [wfProjectId, setWfProjectId] = useState<string | null>(null);
  const [wfIsActive, setWfIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Organization & Project data
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgProjects, setOrgProjects] = useState<ProjectList[]>([]);

  // Catalog data
  const [subAgents, setSubAgents] = useState<SubAgentList[]>([]);
  const [skills, setSkills] = useState<SkillList[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");

  // React Flow
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Node properties
  const [nodeConfigJson, setNodeConfigJson] = useState("{}");
  const [nodeConfigError, setNodeConfigError] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  // Debounce ref for position updates
  const positionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load data ──────────────────────────────────── */

  const loadWorkflow = useCallback(async () => {
    try {
      const [wf, saRes, skRes, lblRes, orgRes] = await Promise.all([
        getWorkflow(id),
        listSubAgents(),
        listSkills(),
        listLabels(),
        listOrganizations(),
      ]);

      setWorkflow(wf);
      setWfName(wf.name);
      setWfDescription(wf.description ?? "");
      setWfLabelIds(wf.labels ?? []);
      setWfOrgId(wf.organization);
      setWfProjectId(wf.project);
      setWfIsActive(wf.is_active);

      setSubAgents(saRes.results);
      setSkills(skRes.results);
      setLabels(lblRes.results);
      setOrganizations(orgRes.results);

      // Convert API nodes/edges to React Flow format
      setNodes(wf.nodes.map(apiNodeToFlowNode));
      setEdges(
        wf.edges.map((e) => ({
          id: e.id,
          source: e.source_node,
          target: e.target_node,
        }))
      );
    } catch {
      setError("Failed to load workflow.");
    } finally {
      setIsLoading(false);
    }
  }, [id, setNodes, setEdges]);

  useEffect(() => {
    loadWorkflow();
  }, [loadWorkflow]);

  // Load projects when organization changes
  useEffect(() => {
    if (!wfOrgId) {
      setOrgProjects([]);
      return;
    }
    listProjects().then((res) => {
      setOrgProjects(
        res.results.filter((p) => p.organization === wfOrgId)
      );
    });
  }, [wfOrgId]);

  /* ── Catalog items ──────────────────────────────── */

  const catalogItems = useMemo<CatalogItem[]>(() => {
    const items: CatalogItem[] = [
      ...subAgents.map((sa) => ({
        id: sa.id,
        name: sa.name,
        slug: sa.slug,
        type: "SUBAGENT" as const,
      })),
      ...skills.map((sk) => ({
        id: sk.id,
        name: sk.name,
        slug: sk.slug,
        type: "SKILL" as const,
      })),
    ];
    if (!catalogSearch) return items;
    const q = catalogSearch.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q)
    );
  }, [subAgents, skills, catalogSearch]);

  const catalogSubAgents = catalogItems.filter((i) => i.type === "SUBAGENT");
  const catalogSkills = catalogItems.filter((i) => i.type === "SKILL");

  /* ── Selected node data ─────────────────────────── */

  const selectedNode = selectedNodeId
    ? (nodes.find((n) => n.id === selectedNodeId) as Node<WfNodeData> | undefined) ?? null
    : null;
  const selectedApiNode = workflow?.nodes.find(
    (n) => n.id === selectedNodeId
  );

  /* ── Drop handler ───────────────────────────────── */

  const onDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/json");
      if (!raw || !rfInstance) return;

      const {
        catalogId,
        catalogType,
        catalogName,
        catalogSlug,
      } = JSON.parse(raw) as {
        catalogId: string;
        catalogType: "SUBAGENT" | "SKILL";
        catalogName: string;
        catalogSlug: string;
      };

      const position = rfInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      try {
        const apiNode = await createNode(id, {
          node_type: catalogType,
          ...(catalogType === "SUBAGENT"
            ? { sub_agent: catalogId }
            : { skill: catalogId }),
          position_x: Math.round(position.x),
          position_y: Math.round(position.y),
        });

        const flowNode = apiNodeToFlowNode(apiNode);
        // Use slug from catalog since API might not return it
        flowNode.data.label = catalogName;
        flowNode.data.slug = catalogSlug;
        setNodes((nds) => [...nds, flowNode]);

        // Update local workflow state for properties panel
        setWorkflow((prev) =>
          prev ? { ...prev, nodes: [...prev.nodes, apiNode] } : prev
        );
      } catch (err: unknown) {
        const data = (
          err as { response?: { data?: Record<string, string[]> } }
        )?.response?.data;
        setError(
          data ? Object.values(data).flat().join(" ") : "Failed to add node."
        );
      }
    },
    [rfInstance, id, setNodes]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  /* ── Connect handler ────────────────────────────── */

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      try {
        const apiEdge = await createEdge(id, {
          source_node: connection.source,
          target_node: connection.target,
        });

        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              id: apiEdge.id,
            },
            eds
          )
        );

        // Update local workflow state
        setWorkflow((prev) =>
          prev ? { ...prev, edges: [...prev.edges, apiEdge] } : prev
        );
      } catch (err: unknown) {
        const data = (
          err as { response?: { data?: Record<string, string[]> } }
        )?.response?.data;
        setError(
          data
            ? Object.values(data).flat().join(" ")
            : "Failed to create edge."
        );
      }
    },
    [id, setEdges]
  );

  /* ── Delete handlers ────────────────────────────── */

  const onNodesDelete = useCallback(
    async (deleted: Node[]) => {
      for (const n of deleted) {
        try {
          await deleteNode(id, n.id);
          setWorkflow((prev) =>
            prev
              ? {
                  ...prev,
                  nodes: prev.nodes.filter((nd) => nd.id !== n.id),
                  edges: prev.edges.filter(
                    (e) => e.source_node !== n.id && e.target_node !== n.id
                  ),
                }
              : prev
          );
        } catch {
          setError("Failed to delete node.");
        }
      }
      if (deleted.some((n) => n.id === selectedNodeId)) {
        setSelectedNodeId(null);
      }
    },
    [id, selectedNodeId]
  );

  const onEdgesDelete = useCallback(
    async (deleted: Edge[]) => {
      for (const e of deleted) {
        try {
          await deleteEdge(id, e.id);
          setWorkflow((prev) =>
            prev
              ? {
                  ...prev,
                  edges: prev.edges.filter((ed) => ed.id !== e.id),
                }
              : prev
          );
        } catch {
          setError("Failed to delete edge.");
        }
      }
    },
    [id]
  );

  /* ── Drag end: persist position ─────────────────── */

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (positionTimerRef.current) clearTimeout(positionTimerRef.current);

      positionTimerRef.current = setTimeout(async () => {
        try {
          await updateNode(id, node.id, {
            position_x: Math.round(node.position.x),
            position_y: Math.round(node.position.y),
          });
        } catch {
          // Silently fail on position update
        }
      }, 300);
    },
    [id]
  );

  /* ── Node selection ─────────────────────────────── */

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);

      // Track selection — process batch as a whole to avoid race conditions
      const selectChanges = changes.filter((c) => c.type === "select");
      if (selectChanges.length === 0) return;

      const selected = selectChanges.find(
        (c) => "selected" in c && c.selected
      );

      if (selected && "id" in selected) {
        setSelectedNodeId(selected.id);
        const apiNode = workflow?.nodes.find((n) => n.id === selected.id);
        setNodeConfigJson(
          JSON.stringify(apiNode?.config_overrides ?? {}, null, 2)
        );
        setNodeConfigError("");
      } else {
        // Only deselections in this batch
        setSelectedNodeId(null);
      }
    },
    [onNodesChange, workflow]
  );

  /* ── Save workflow properties ───────────────────── */

  async function handleSaveProperties(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const updated = await updateWorkflow(id, {
        name: wfName,
        description: wfDescription || undefined,
        is_active: wfIsActive,
        organization: wfOrgId,
        project: wfProjectId,
        labels: wfLabelIds,
      });
      setWorkflow((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      setError(
        data
          ? Object.values(data).flat().join(" ")
          : "Failed to update workflow."
      );
    } finally {
      setIsSaving(false);
    }
  }

  /* ── Save node config overrides ─────────────────── */

  async function handleSaveNodeConfig() {
    if (!selectedNodeId) return;
    setNodeConfigError("");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(nodeConfigJson);
    } catch {
      setNodeConfigError("Invalid JSON.");
      return;
    }

    try {
      await updateNode(id, selectedNodeId, { config_overrides: parsed });
      setWorkflow((prev) =>
        prev
          ? {
              ...prev,
              nodes: prev.nodes.map((n) =>
                n.id === selectedNodeId
                  ? { ...n, config_overrides: parsed }
                  : n
              ),
            }
          : prev
      );
    } catch {
      setNodeConfigError("Failed to save config.");
    }
  }

  /* ── Loading / error ────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <p className="text-sm text-red-400">{error || "Workflow not found."}</p>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 pb-4">
        <button
          onClick={() => router.push("/workflows")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <h1 className="text-lg font-medium tracking-tight text-white">
          {workflow.name}
        </h1>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
          {workflow.slug}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-xs font-medium ${
              workflow.is_active ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                workflow.is_active ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {workflow.is_active ? "Active" : "Inactive"}
          </span>

          {/* Help button */}
          <div className="relative">
            <button
              onClick={() => setShowHelp((v) => !v)}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium transition-colors ${
                showHelp
                  ? "bg-slate-800 text-slate-200"
                  : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-300"
              }`}
              title="Editor help"
            >
              ?
            </button>

            {showHelp && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowHelp(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-800/60 bg-slate-950 p-4 shadow-xl">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Editor shortcuts
                  </h4>
                  <div className="mt-3 space-y-2.5">
                    <HelpRow
                      keys={["Drag from catalog"]}
                      desc="Add a node to the canvas"
                    />
                    <HelpRow
                      keys={["Drag handle \u2192 handle"]}
                      desc="Connect two nodes with an edge"
                    />
                    <HelpRow
                      keys={["Click node"]}
                      desc="Select and view properties"
                    />
                    <HelpRow
                      keys={["Backspace", "Delete"]}
                      desc="Remove selected node or edge"
                    />
                    <HelpRow
                      keys={["Scroll"]}
                      desc="Zoom in / out"
                    />
                    <HelpRow
                      keys={["Click + drag canvas"]}
                      desc="Pan the viewport"
                    />
                    <HelpRow
                      keys={["Drag node"]}
                      desc="Reposition (auto-saved)"
                    />
                  </div>
                  <div className="mt-4 border-t border-slate-800/60 pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Tips
                    </h4>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-500">
                      <li>Cycles are not allowed — the API will reject circular edges.</li>
                      <li>Use the right panel to edit workflow properties or node config overrides.</li>
                      <li>Nodes connect from bottom (source) to top (target) handles.</li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" />
          </svg>
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError("")}
            className="shrink-0 text-red-400/60 transition-colors hover:text-red-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Three-panel layout */}
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-slate-800/60">
        {/* ── Left: Catalog ────────────────────────── */}
        <div className="flex w-56 shrink-0 flex-col border-r border-slate-800/60 bg-slate-950/50">
          <div className="border-b border-slate-800/60 px-3 py-2.5">
            <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Catalog
            </h3>
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search..."
              className="mt-2 block w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {catalogSubAgents.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                  Sub-Agents
                </p>
                <div className="space-y-1">
                  {catalogSubAgents.map((item) => (
                    <CatalogEntry key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}

            {catalogSkills.length > 0 && (
              <div>
                <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                  Skills
                </p>
                <div className="space-y-1">
                  {catalogSkills.map((item) => (
                    <CatalogEntry key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}

            {catalogItems.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-slate-600">
                {catalogSearch ? "No matches." : "No items available."}
              </p>
            )}
          </div>
        </div>

        {/* ── Center: React Flow Canvas ────────────── */}
        <div
          ref={reactFlowWrapper}
          className="flex-1"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStop={onNodeDragStop}
            onInit={setRfInstance}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            className="bg-slate-950"
            defaultEdgeOptions={{
              style: { stroke: "#475569", strokeWidth: 1.5 },
              type: "smoothstep",
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#1e293b"
            />
            <Controls
              className="!border-slate-700 !bg-slate-900 [&>button]:!border-slate-700 [&>button]:!bg-slate-900 [&>button]:!text-slate-400 [&>button:hover]:!bg-slate-800"
              showInteractive={false}
            />
          </ReactFlow>
        </div>

        {/* ── Right: Properties ────────────────────── */}
        <div className="flex w-72 shrink-0 flex-col border-l border-slate-800/60 bg-slate-950/50">
          <div className="flex-1 overflow-y-auto">
            {selectedNode ? (
              /* ── Node properties ─────────────────── */
              <div className="p-3">
                <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Node properties
                </h3>

                <div className="mt-3 space-y-3">
                  {/* Type badge */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Type
                    </label>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        selectedNode.data.nodeType === "SUBAGENT"
                          ? "bg-indigo-900/30 text-indigo-400"
                          : "bg-emerald-900/30 text-emerald-400"
                      }`}
                    >
                      {selectedNode.data.nodeType === "SUBAGENT"
                        ? "Sub-Agent"
                        : "Skill"}
                    </span>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Name
                    </label>
                    <p className="mt-0.5 text-sm text-slate-300">
                      {selectedNode.data.label}
                    </p>
                  </div>

                  {/* Slug */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Slug
                    </label>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {selectedNode.data.slug}
                    </p>
                  </div>

                  {/* Reference ID */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Reference
                    </label>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                      {selectedApiNode
                        ? selectedApiNode.sub_agent || selectedApiNode.skill
                        : selectedNode.id}
                    </p>
                  </div>

                  {/* Config overrides */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Config overrides (JSON)
                    </label>
                    <textarea
                      value={nodeConfigJson}
                      onChange={(e) => {
                        setNodeConfigJson(e.target.value);
                        setNodeConfigError("");
                      }}
                      rows={6}
                      spellCheck={false}
                      className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-300 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                    />
                    {nodeConfigError && (
                      <p className="mt-1 text-xs text-red-400">
                        {nodeConfigError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveNodeConfig}
                      className="mt-2 w-full rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
                    >
                      Save config
                    </button>
                  </div>
                </div>

                {/* Deselect */}
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className="mt-4 w-full rounded-md border border-slate-800 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-700 hover:text-slate-300"
                >
                  Close
                </button>
              </div>
            ) : (
              /* ── Workflow properties ─────────────── */
              <form onSubmit={handleSaveProperties} className="p-3">
                <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Workflow properties
                </h3>

                <div className="mt-3 space-y-3">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Name
                    </label>
                    <input
                      type="text"
                      value={wfName}
                      onChange={(e) => setWfName(e.target.value)}
                      required
                      className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Slug (read-only) */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Slug
                    </label>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {workflow.slug}
                    </p>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Description
                    </label>
                    <textarea
                      value={wfDescription}
                      onChange={(e) => setWfDescription(e.target.value)}
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Organization */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Organization
                    </label>
                    <Select
                      options={[
                        { value: "", label: "None (global)" },
                        ...organizations.map((o) => ({ value: o.id, label: o.name })),
                      ]}
                      value={wfOrgId ?? ""}
                      onChange={(v) => {
                        setWfOrgId(v || null);
                        setWfProjectId(null);
                      }}
                      placeholder="None (global)"
                      className="mt-1"
                    />
                  </div>

                  {/* Project (only if org selected) */}
                  {wfOrgId && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500">
                        Project
                      </label>
                      <Select
                        options={[
                          { value: "", label: "None" },
                          ...orgProjects.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                        value={wfProjectId ?? ""}
                        onChange={(v) => setWfProjectId(v || null)}
                        placeholder="None"
                        className="mt-1"
                      />
                    </div>
                  )}

                  {/* Labels (multi-select) */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Label triggers
                    </label>
                    {/* Selected labels as removable badges */}
                    {wfLabelIds.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {wfLabelIds.map((lid) => {
                          const lbl = labels.find((l) => l.id === lid);
                          return (
                            <span
                              key={lid}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: lbl ? `${lbl.color}20` : "#33415520",
                                color: lbl?.color ?? "#94a3b8",
                              }}
                            >
                              {lbl?.name ?? lid.slice(0, 8)}
                              <button
                                type="button"
                                onClick={() =>
                                  setWfLabelIds((prev) => prev.filter((x) => x !== lid))
                                }
                                className="ml-0.5 hover:opacity-70"
                              >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {/* Available labels as checkboxes */}
                    <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-900 p-1.5">
                      {labels.length === 0 && (
                        <p className="px-1 py-1 text-[10px] text-slate-600">No labels available.</p>
                      )}
                      {labels.map((l) => (
                        <label
                          key={l.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-slate-800/60"
                        >
                          <input
                            type="checkbox"
                            checked={wfLabelIds.includes(l.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setWfLabelIds((prev) => [...prev, l.id]);
                              } else {
                                setWfLabelIds((prev) => prev.filter((x) => x !== l.id));
                              }
                            }}
                            className="h-3 w-3 rounded border-slate-600 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                          />
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: l.color }}
                          />
                          {l.name}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Active */}
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={wfIsActive}
                      onChange={(e) => setWfIsActive(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                    Active
                  </label>

                  {/* Scope info (read-only) */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Scope
                    </label>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {wfProjectId
                        ? "Project"
                        : wfOrgId
                          ? "Organization"
                          : "Global"}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="rounded-md border border-slate-800/40 bg-slate-900/30 px-2.5 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Nodes</span>
                      <span className="font-medium text-slate-300">
                        {nodes.length}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Edges</span>
                      <span className="font-medium text-slate-300">
                        {edges.length}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="mt-4 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save properties"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
