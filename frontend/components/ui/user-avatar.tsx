"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import {
  avataaars,
  bottts,
  funEmoji,
  lorelei,
  notionists,
  pixelArt,
  adventurer,
  micah,
} from "@dicebear/collection";
import type { Style } from "@dicebear/core";

export const AVATAR_STYLES: Record<string, { label: string; style: Style<object> }> = {
  avataaars: { label: "Cartoon", style: avataaars as Style<object> },
  bottts: { label: "Robots", style: bottts as Style<object> },
  funEmoji: { label: "Emoji", style: funEmoji as Style<object> },
  lorelei: { label: "Lorelei", style: lorelei as Style<object> },
  notionists: { label: "Notion", style: notionists as Style<object> },
  pixelArt: { label: "Pixel", style: pixelArt as Style<object> },
  adventurer: { label: "Adventurer", style: adventurer as Style<object> },
  micah: { label: "Micah", style: micah as Style<object> },
};

export function generateAvatarDataUri(seed: string, styleName: string): string {
  const entry = AVATAR_STYLES[styleName];
  if (!entry) return "";
  const avatar = createAvatar(entry.style, { seed });
  return avatar.toDataUri();
}

interface UserAvatarProps {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarStyle?: string;
  size?: number;
  className?: string;
}

export function UserAvatar({
  userId,
  firstName,
  email,
  avatarStyle,
  size = 32,
  className = "",
}: UserAvatarProps) {
  const dataUri = useMemo(() => {
    if (!avatarStyle) return "";
    return generateAvatarDataUri(userId, avatarStyle);
  }, [userId, avatarStyle]);

  const initials = (firstName?.[0] || email?.[0] || "?").toUpperCase();

  // DiceBear avatar
  if (dataUri) {
    return (
      <img
        src={dataUri}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Initials fallback
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-slate-800 font-medium text-slate-400 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}
