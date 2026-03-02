"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { canEditOrg } from "@/lib/roles";
import { listAgents, deleteAgent } from "@/lib/api/agents";
import { listSkills, deleteSkill } from "@/lib/api/skills";
import { ConfirmModal } from "@/components/confirm-modal";
import type { AgentList, SkillList } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-800 text-slate-400",
  ACTIVE: "bg-green-900/50 text-green-400",
  INACTIVE: "bg-yellow-900/50 text-yellow-400",
  DEPRECATED: "bg-red-900/50 text-red-400",
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  CODER: "Coder",
  REVIEWER: "Reviewer",
  TESTER: "Tester",
  PLANNER: "Planner",
  CUSTOM: "Custom",
};

const CATEGORY_LABELS: Record<string, string> = {
  CODING: "Coding",
  TESTING: "Testing",
  REVIEW: "Review",
  DOCUMENTATION: "Documentation",
  DEPLOYMENT: "Deployment",
  CUSTOM: "Custom",
};

type Tab = "agents" | "skills";

export default function AgentsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const [activeTab, setActiveTab] = useState<Tab>("agents");
  const canManage = canEditOrg(currentMembership?.role);

  // Agents state
  const [agents, setAgents] = useState<AgentList[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [deleteAgentTarget, setDeleteAgentTarget] = useState<AgentList | null>(null);
  const [isDeletingAgent, setIsDeletingAgent] = useState(false);

  // Skills state
  const [skills, setSkills] = useState<SkillList[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [deleteSkillTarget, setDeleteSkillTarget] = useState<SkillList | null>(null);
  const [isDeletingSkill, setIsDeletingSkill] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      setAgents((await listAgents()).results);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      setSkills((await listSkills()).results);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchSkills();
  }, [fetchAgents, fetchSkills]);

  async function handleDeleteAgent() {
    if (!deleteAgentTarget) return;
    setIsDeletingAgent(true);
    try {
      await deleteAgent(deleteAgentTarget.slug);
      setDeleteAgentTarget(null);
      fetchAgents();
    } finally {
      setIsDeletingAgent(false);
    }
  }

  async function handleDeleteSkill() {
    if (!deleteSkillTarget) return;
    setIsDeletingSkill(true);
    try {
      await deleteSkill(deleteSkillTarget.slug);
      setDeleteSkillTarget(null);
      fetchSkills();
    } finally {
      setIsDeletingSkill(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight text-white">Agents & Skills</h1>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-slate-800/60">
        <button
          onClick={() => setActiveTab("agents")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "agents"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300"
          }`}
        >
          Agents
        </button>
        <button
          onClick={() => setActiveTab("skills")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "skills"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300"
          }`}
        >
          Skills
        </button>
      </div>

      {/* Agents tab */}
      {activeTab === "agents" && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-200">Agents</h2>
            {canManage && (
              <button
                onClick={() => router.push(`/${orgSlug}/agents/new`)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Add agent
              </button>
            )}
          </div>

          {agentsLoading ? (
            <p className="mt-4 text-slate-500">Loading agents...</p>
          ) : agents.length === 0 ? (
            <p className="mt-4 text-slate-500">No agents configured.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
              <table className="min-w-full divide-y divide-slate-800/60">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Version</th>
                    {canManage && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-slate-900/60">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                        <span className="flex items-center gap-2">
                          {agent.name}
                          {agent.is_external && (
                            <span className="inline-flex rounded-full bg-purple-900/50 px-2 py-0.5 text-xs font-medium text-purple-400">
                              External
                            </span>
                          )}
                          {!agent.organization && (
                            <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                              Global
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                        {AGENT_TYPE_LABELS[agent.agent_type] || agent.agent_type}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[agent.status] || ""}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                        {agent.version}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button
                            onClick={() => router.push(`/${orgSlug}/agents/${agent.slug}/edit`)}
                            className="text-indigo-400 transition-colors hover:text-indigo-300"
                          >
                            Edit
                          </button>
                          <button onClick={() => setDeleteAgentTarget(agent)} className="ml-3 text-red-400 transition-colors hover:text-red-300">
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Skills tab */}
      {activeTab === "skills" && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-200">Skills</h2>
            {canManage && (
              <button
                onClick={() => router.push(`/${orgSlug}/agents/skills/new`)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Add skill
              </button>
            )}
          </div>

          {skillsLoading ? (
            <p className="mt-4 text-slate-500">Loading skills...</p>
          ) : skills.length === 0 ? (
            <p className="mt-4 text-slate-500">No skills configured.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
              <table className="min-w-full divide-y divide-slate-800/60">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Version</th>
                    {canManage && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {skills.map((skill) => (
                    <tr key={skill.id} className="hover:bg-slate-900/60">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                        <span className="flex items-center gap-2">
                          {skill.name}
                          {skill.is_external && (
                            <span className="inline-flex rounded-full bg-purple-900/50 px-2 py-0.5 text-xs font-medium text-purple-400">
                              External
                            </span>
                          )}
                          {!skill.organization && (
                            <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                              Global
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                        {CATEGORY_LABELS[skill.category] || skill.category}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[skill.status] || ""}`}>
                          {skill.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                        {skill.version}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button
                            onClick={() => router.push(`/${orgSlug}/agents/skills/${skill.slug}/edit`)}
                            className="text-indigo-400 transition-colors hover:text-indigo-300"
                          >
                            Edit
                          </button>
                          <button onClick={() => setDeleteSkillTarget(skill)} className="ml-3 text-red-400 transition-colors hover:text-red-300">
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete modals */}
      {deleteAgentTarget && (
        <ConfirmModal
          title="Delete agent"
          message={`Delete agent "${deleteAgentTarget.name}"? This will also remove all skill assignments.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeletingAgent}
          onConfirm={handleDeleteAgent}
          onCancel={() => setDeleteAgentTarget(null)}
        />
      )}
      {deleteSkillTarget && (
        <ConfirmModal
          title="Delete skill"
          message={`Delete skill "${deleteSkillTarget.name}"? This will also remove it from all agents.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeletingSkill}
          onConfirm={handleDeleteSkill}
          onCancel={() => setDeleteSkillTarget(null)}
        />
      )}
    </div>
  );
}
