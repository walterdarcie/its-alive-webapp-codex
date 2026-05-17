import type { ShowRecord } from "@/lib/show-types";

export type UserProfileSummary = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type UserProfileWithCounts = UserProfileSummary & {
  followingCount: number;
  followerCount: number;
  isViewerFollowing: boolean;
  isSelf: boolean;
};

export type FollowActivityAction = "went" | "going";

export type FollowFeedItem = {
  id: string;
  actor: UserProfileSummary;
  action: FollowActivityAction;
  occurredAtIso: string;
  show: ShowRecord;
};

export type TrendingShow = {
  show: ShowRecord;
  attendingCount: number;
};

export type PublicWalletEntry = {
  show: ShowRecord;
  action: FollowActivityAction;
  savedAtIso: string;
};

export function formatPtBrNumber(value: number) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}
