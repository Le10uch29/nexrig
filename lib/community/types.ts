import type { BuildSelection } from "@/types/build";

/**
 * Community builds and comments as the public API returns them. Owner/author ids never leave the
 * server; `author.tag` is a short stable pseudonym derived from the id so equal nicknames can be
 * told apart.
 */
export interface CommunityAuthor {
  name: string;
  tag: string;
  isAdmin: boolean;
}

export interface CommunityBuild {
  id: string;
  name: string;
  description: string;
  selection: BuildSelection;
  /** Server-computed price snapshot (RUB, demo prices) at publication time. */
  totalPriceRub: number;
  author: CommunityAuthor;
  publishedAt: string;
  commentCount: number;
  /** Hidden by a moderator (only admins and the owner see such builds). */
  hidden: boolean;
  /** The viewer published it. */
  mine: boolean;
}

export interface BuildComment {
  id: string;
  buildId: string;
  parentId: string | null;
  /** Empty when deleted by its author or hidden by a moderator (unless the viewer is an admin). */
  body: string;
  author: CommunityAuthor;
  createdAt: string;
  edited: boolean;
  deleted: boolean;
  hidden: boolean;
  mine: boolean;
}
