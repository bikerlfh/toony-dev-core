"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listToonyAgents } from "@/lib/api/toony-agents";
// Role checks removed — will be re-implemented when org context is rebuilt
import { ToonyAgentStatusBadge } from "@/components/toony-agents/toony-agent-status-badge";
import { RegisterBotModal } from "@/components/toony-agents/register-bot-modal";
import type { ToonyAgentList } from "@/types";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ToonyAgentsPage() {
  const router = useRouter();

  const [agents, setAgents] = useState<ToonyAgentList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Role checks temporarily set to true — will be re-implemented when org context is rebuilt
  const canManage = true;

  const fetchAgents = useCallback(async () => {
    try {
      setAgents((await listToonyAgents()).results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  function handleRegisterSuccess(agentId: string) {
    router.push(`/toony-agents/${agentId}`);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">Toony Agents</h1>
        {canManage && (
          <button
            onClick={() => setShowRegisterModal(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            + Register Bot
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <p className="mt-6 text-slate-500">Loading...</p>
      ) : agents.length === 0 ? (
        <p className="mt-6 text-slate-500">No bots registered yet.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => router.push(`/toony-agents/${agent.id}`)}
              className="rounded-xl border border-slate-800/60 bg-slate-900 p-4 hover:border-slate-700 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-200">{agent.name}</h3>
                <ToonyAgentStatusBadge status={agent.status} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Last heartbeat: {timeAgo(agent.last_heartbeat)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Register modal */}
      <RegisterBotModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSuccess={handleRegisterSuccess}
      />
    </div>
  );
}
