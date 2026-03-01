"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { canEditOrg } from "@/lib/roles";
import { listAgents, getAgent, deleteAgent } from "@/lib/api/agents";
import { listSkills, getSkill, deleteSkill } from "@/lib/api/skills";
import { ConfirmModal } from "@/components/confirm-modal";
import { CreateAgentModal } from "@/components/create-agent-modal";
import { EditAgentModal } from "@/components/edit-agent-modal";
import { CreateSkillModal } from "@/components/create-skill-modal";
import { EditSkillModal } from "@/components/edit-skill-modal";
import type { AgentList, AgentDetail, SkillList, SkillDetail } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-yellow-100 text-yellow-700",
  DEPRECATED: "bg-red-100 text-red-700",
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
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const [activeTab, setActiveTab] = useState<Tab>("agents");
  const canManage = canEditOrg(currentMembership?.role);

  // Agents state
  const [agents, setAgents] = useState<AgentList[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [editAgent, setEditAgent] = useState<AgentDetail | null>(null);
  const [deleteAgentTarget, setDeleteAgentTarget] = useState<AgentList | null>(null);
  const [isDeletingAgent, setIsDeletingAgent] = useState(false);

  // Skills state
  const [skills, setSkills] = useState<SkillList[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [editSkillTarget, setEditSkillTarget] = useState<SkillDetail | null>(null);
  const [deleteSkillTarget, setDeleteSkillTarget] = useState<SkillList | null>(null);
  const [isDeletingSkill, setIsDeletingSkill] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      setAgents((await listAgents(orgSlug)).results);
    } finally {
      setAgentsLoading(false);
    }
  }, [orgSlug]);

  const fetchSkills = useCallback(async () => {
    try {
      setSkills((await listSkills(orgSlug)).results);
    } finally {
      setSkillsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchAgents();
    fetchSkills();
  }, [fetchAgents, fetchSkills]);

  async function handleEditAgent(agent: AgentList) {
    const detail = await getAgent(orgSlug, agent.slug);
    setEditAgent(detail);
  }

  async function handleDeleteAgent() {
    if (!deleteAgentTarget) return;
    setIsDeletingAgent(true);
    try {
      await deleteAgent(orgSlug, deleteAgentTarget.slug);
      setDeleteAgentTarget(null);
      fetchAgents();
    } finally {
      setIsDeletingAgent(false);
    }
  }

  async function handleEditSkill(skill: SkillList) {
    const detail = await getSkill(orgSlug, skill.slug);
    setEditSkillTarget(detail);
  }

  async function handleDeleteSkill() {
    if (!deleteSkillTarget) return;
    setIsDeletingSkill(true);
    try {
      await deleteSkill(orgSlug, deleteSkillTarget.slug);
      setDeleteSkillTarget(null);
      fetchSkills();
    } finally {
      setIsDeletingSkill(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Agents & Skills</h1>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("agents")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "agents"
              ? "border-b-2 border-indigo-600 text-indigo-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Agents
        </button>
        <button
          onClick={() => setActiveTab("skills")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "skills"
              ? "border-b-2 border-indigo-600 text-indigo-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Skills
        </button>
      </div>

      {/* Agents tab */}
      {activeTab === "agents" && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Agents</h2>
            {canManage && (
              <button
                onClick={() => setShowCreateAgent(true)}
                className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
              >
                Add agent
              </button>
            )}
          </div>

          {agentsLoading ? (
            <p className="mt-4 text-gray-500">Loading agents...</p>
          ) : agents.length === 0 ? (
            <p className="mt-4 text-gray-500">No agents configured.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Version</th>
                    {canManage && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {agents.map((agent) => (
                    <tr key={agent.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                        {agent.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {AGENT_TYPE_LABELS[agent.agent_type] || agent.agent_type}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[agent.status] || ""}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {agent.version}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button onClick={() => handleEditAgent(agent)} className="text-indigo-600 hover:underline">
                            Edit
                          </button>
                          <button onClick={() => setDeleteAgentTarget(agent)} className="ml-3 text-red-600 hover:underline">
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
            <h2 className="text-lg font-semibold text-gray-900">Skills</h2>
            {canManage && (
              <button
                onClick={() => setShowCreateSkill(true)}
                className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
              >
                Add skill
              </button>
            )}
          </div>

          {skillsLoading ? (
            <p className="mt-4 text-gray-500">Loading skills...</p>
          ) : skills.length === 0 ? (
            <p className="mt-4 text-gray-500">No skills configured.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Version</th>
                    {canManage && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {skills.map((skill) => (
                    <tr key={skill.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                        {skill.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {CATEGORY_LABELS[skill.category] || skill.category}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[skill.status] || ""}`}>
                          {skill.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {skill.version}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button onClick={() => handleEditSkill(skill)} className="text-indigo-600 hover:underline">
                            Edit
                          </button>
                          <button onClick={() => setDeleteSkillTarget(skill)} className="ml-3 text-red-600 hover:underline">
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

      {/* Agent modals */}
      {showCreateAgent && (
        <CreateAgentModal
          orgSlug={orgSlug}
          onClose={() => setShowCreateAgent(false)}
          onSaved={fetchAgents}
        />
      )}
      {editAgent && (
        <EditAgentModal
          orgSlug={orgSlug}
          agent={editAgent}
          onClose={() => setEditAgent(null)}
          onSaved={fetchAgents}
        />
      )}
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

      {/* Skill modals */}
      {showCreateSkill && (
        <CreateSkillModal
          orgSlug={orgSlug}
          onClose={() => setShowCreateSkill(false)}
          onSaved={fetchSkills}
        />
      )}
      {editSkillTarget && (
        <EditSkillModal
          orgSlug={orgSlug}
          skill={editSkillTarget}
          onClose={() => setEditSkillTarget(null)}
          onSaved={fetchSkills}
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
