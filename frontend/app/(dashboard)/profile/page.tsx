"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { updateProfile, changePassword, listAPIKeys, generateAPIKey, revokeAPIKey } from "@/lib/api/auth";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AvatarStyleModal } from "@/components/ui/avatar-style-picker";
import type { UserAPIKey } from "@/types";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarStyle, setAvatarStyle] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Avatar modal
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<UserAPIKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [keyName, setKeyName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [keyError, setKeyError] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
      setEmail(user.email);
      setAvatarStyle(user.avatar_style || "");
    }
  }, [user]);

  const fetchKeys = useCallback(async () => {
    try {
      setApiKeys((await listAPIKeys()).results);
    } catch {
      setKeyError("Failed to load API keys.");
    } finally {
      setIsLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function handleAvatarSave(style: string) {
    setIsSavingAvatar(true);
    try {
      await updateProfile({ avatar_style: style });
      await refreshUser();
      setAvatarStyle(style);
      setAvatarModalOpen(false);
    } catch {
      // silently fail — avatar is non-critical
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setIsSavingProfile(true);

    try {
      await updateProfile({ first_name: firstName, last_name: lastName, email });
      await refreshUser();
      setProfileSuccess("Profile updated successfully.");
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setProfileError(Object.values(data).flat().join(" "));
      } else {
        setProfileError("Failed to update profile.");
      }
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setIsSavingPassword(true);

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setPasswordError(Object.values(data).flat().join(" "));
      } else {
        setPasswordError("Failed to change password.");
      }
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleGenerateKey(e: FormEvent) {
    e.preventDefault();
    setKeyError("");
    setIsGenerating(true);
    setCopied(false);

    try {
      const key = await generateAPIKey(keyName);
      setNewRawKey(key.raw_key);
      setKeyName("");
      fetchKeys();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setKeyError(Object.values(data).flat().join(" "));
      } else {
        setKeyError("Failed to generate key.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    setRevokingId(keyId);
    setKeyError("");
    try {
      await revokeAPIKey(keyId);
      fetchKeys();
    } catch {
      setKeyError("Failed to revoke key.");
    } finally {
      setRevokingId(null);
    }
  }

  function handleCopyKey() {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (!user) return null;

  const inputClass =
    "mt-1.5 block w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

  const alertSuccess =
    "rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5 text-sm text-emerald-400";
  const alertError =
    "rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-sm text-red-400";

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">

      {/* ── Profile ──────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        {/* Identity header */}
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => setAvatarModalOpen(true)}
            className="group relative shrink-0"
          >
            <UserAvatar
              userId={user.id}
              firstName={user.first_name}
              lastName={user.last_name}
              email={user.email}
              avatarStyle={avatarStyle}
              size={80}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/40">
              <svg
                className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
            </div>
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">
              {user.first_name} {user.last_name}
            </h1>
            <p className="mt-0.5 font-mono text-sm text-slate-500">@{user.username}</p>
            <p className="mt-1 text-xs text-slate-600">
              Member since {formatDate(user.created_at)}
            </p>
          </div>
        </div>

        {/* Alerts */}
        {profileSuccess && <div className={`mt-5 ${alertSuccess}`}>{profileSuccess}</div>}
        {profileError && <div className={`mt-5 ${alertError}`}>{profileError}</div>}

        {/* Fields */}
        <form onSubmit={handleProfileSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-slate-400">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-slate-400">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSavingProfile ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Security ─────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        <h2 className="text-[15px] font-semibold leading-tight text-white">Security</h2>
        <p className="mt-1 text-sm text-slate-500">Change your account password.</p>

        {passwordSuccess && <div className={`mt-4 ${alertSuccess}`}>{passwordSuccess}</div>}
        {passwordError && <div className={`mt-4 ${alertError}`}>{passwordError}</div>}

        <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-400">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-400">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-400">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingPassword}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSavingPassword ? "Changing..." : "Change password"}
            </button>
          </div>
        </form>
      </div>

      {/* ── API Keys ─────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        <h2 className="text-[15px] font-semibold leading-tight text-white">API Keys</h2>
        <p className="mt-1 text-sm text-slate-500">
          Generate keys to authenticate with the Toony MCP server or external integrations.
        </p>

        {keyError && <div className={`mt-4 ${alertError}`}>{keyError}</div>}

        {newRawKey && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3">
            <p className="mb-2 text-xs font-medium text-amber-400">
              Copy this key now. You will not be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-200">
                {newRawKey}
              </code>
              <button
                onClick={handleCopyKey}
                className="shrink-0 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleGenerateKey} className="mt-5 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-400">
              Key name
            </label>
            <input
              type="text"
              required
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="mcp-server"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={isGenerating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate key"}
          </button>
        </form>

        {isLoadingKeys ? (
          <div className="mt-6 flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-1 w-6 animate-pulse rounded-full bg-slate-700" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        ) : apiKeys.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No API keys generated yet.</p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-lg border border-slate-800/60">
            <table className="min-w-full divide-y divide-slate-800/60">
              <thead>
                <tr className="bg-slate-950/40">
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-600">Name</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-600">Prefix</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-600">Status</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-600">Last used</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-600">Created</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {apiKeys.map((key) => (
                  <tr key={key.id} className="transition-colors hover:bg-slate-950/30">
                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-200">
                      {key.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500">
                      {key.key_prefix}...
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {key.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                      {formatDate(key.last_used_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                      {formatDate(key.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {key.is_active && (
                        <button
                          onClick={() => handleRevokeKey(key.id)}
                          disabled={revokingId === key.id}
                          className="text-xs text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                        >
                          {revokingId === key.id ? "Revoking..." : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Avatar style modal */}
      {avatarModalOpen && (
        <AvatarStyleModal
          userId={user.id}
          firstName={user.first_name}
          email={user.email}
          currentStyle={avatarStyle}
          isSaving={isSavingAvatar}
          onSave={handleAvatarSave}
          onClose={() => setAvatarModalOpen(false)}
        />
      )}
    </div>
  );
}
