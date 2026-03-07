"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { updateProfile, changePassword, listAPIKeys, generateAPIKey, revokeAPIKey } from "@/lib/api/auth";
import type { UserAPIKey } from "@/types";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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

  const inputClassName =
    "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold text-white">Profile</h1>

      {/* Personal Info */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-medium text-white">Personal Information</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400">Username</label>
          <p className="mt-1.5 text-sm text-slate-300">{user.username}</p>
        </div>

        {profileSuccess && (
          <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-sm text-green-400">
            {profileSuccess}
          </div>
        )}

        {profileError && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {profileError}
          </div>
        )}

        <form onSubmit={handleProfileSubmit} className="space-y-4">
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
                className={inputClassName}
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
                className={inputClassName}
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
              className={inputClassName}
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

      {/* Change Password */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-medium text-white">Change Password</h2>

        {passwordSuccess && (
          <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-sm text-green-400">
            {passwordSuccess}
          </div>
        )}

        {passwordError && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {passwordError}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
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
              className={inputClassName}
            />
          </div>

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
              className={inputClassName}
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
              className={inputClassName}
            />
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

      {/* API Keys */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-1 text-lg font-medium text-white">API Keys</h2>
        <p className="mb-4 text-sm text-slate-500">
          Generate keys to authenticate with the Toony MCP server or external integrations.
        </p>

        {keyError && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {keyError}
          </div>
        )}

        {newRawKey && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="mb-2 text-xs font-medium text-amber-400">
              Copy this key now. You will not be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-200">
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

        <form onSubmit={handleGenerateKey} className="mb-5 flex items-end gap-2">
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
              className={inputClassName}
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
          <p className="text-sm text-slate-500">Loading keys...</p>
        ) : apiKeys.length === 0 ? (
          <p className="text-sm text-slate-500">No API keys generated yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800/60">
            <table className="min-w-full divide-y divide-slate-800/60">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Prefix</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Last used</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Created</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {apiKeys.map((key) => (
                  <tr key={key.id} className="hover:bg-slate-900/60">
                    <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-200">
                      {key.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-400">
                      {key.key_prefix}...
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      {key.is_active ? (
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-500/15 px-2 py-0.5 text-xs font-medium text-slate-400">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                      {formatDate(key.last_used_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                      {formatDate(key.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm">
                      {key.is_active && (
                        <button
                          onClick={() => handleRevokeKey(key.id)}
                          disabled={revokingId === key.id}
                          className="text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
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
    </div>
  );
}
