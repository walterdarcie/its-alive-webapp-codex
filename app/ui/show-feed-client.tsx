"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Viewer } from "@/lib/show-types";
import { useLocale } from "@/lib/i18n-context";

type Post = {
  id: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl: string | null;
  body: string;
  photoUrl: string | null;
  likeCount: number;
  viewerLiked: boolean;
  createdAt: string;
};

type ShowFeedClientProps = {
  showId: string;
  viewer: Viewer | null;
};

export function ShowFeedClient({ showId, viewer }: ShowFeedClientProps) {
  const { t, formatPostDate } = useLocale();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [burstingId, setBurstingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(showId)}`);
        const data = (await res.json()) as { posts?: Post[] };
        if (!cancelled) setPosts(data.posts ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [showId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    e.target.value = "";
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || submitting || !viewer) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const supabase = getSupabaseBrowserClient();
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${viewer.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("post-photos")
          .upload(path, photoFile, { contentType: photoFile.type });
        if (uploadError) throw new Error(t.feed.photoError);
        const {
          data: { publicUrl }
        } = supabase.storage.from("post-photos").getPublicUrl(uploadData.path);
        photoUrl = publicUrl;
      }

      const res = await fetch(`/api/posts/${encodeURIComponent(showId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), photoUrl })
      });
      const data = (await res.json()) as { post?: Post; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.feed.saveError);

      if (data.post) setPosts((prev) => [data.post!, ...prev]);
      setBody("");
      removePhoto();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t.feed.saveError);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(postId: string) {
    if (!viewer) {
      window.location.href = `/signin?next=${encodeURIComponent(`/show/${showId}`)}`;
      return;
    }
    const wasLiked = posts.find((p) => p.id === postId)?.viewerLiked ?? false;
    if (!wasLiked) {
      setBurstingId(postId);
      window.setTimeout(() => {
        setBurstingId((current) => (current === postId ? null : current));
      }, 620);
    }
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const liked = !p.viewerLiked;
        return { ...p, viewerLiked: liked, likeCount: liked ? p.likeCount + 1 : Math.max(0, p.likeCount - 1) };
      })
    );
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(showId)}/${postId}/like`, { method: "POST" });
      const data = (await res.json()) as { liked: boolean; likeCount: number };
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, viewerLiked: data.liked, likeCount: data.likeCount } : p)));
    } catch {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const liked = !p.viewerLiked;
          return { ...p, viewerLiked: liked, likeCount: liked ? p.likeCount + 1 : Math.max(0, p.likeCount - 1) };
        })
      );
    }
  }

  async function deletePost(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setConfirmDeleteId(null);
    try {
      await fetch(`/api/posts/${encodeURIComponent(showId)}/${postId}`, { method: "DELETE" });
    } catch {
      /* deletion already happened optimistically; silently ignore network errors */
    }
  }

  return (
    <section className="showFeed">
      <div className="feedSectionHeader">
        <h2 className="feedSectionTitle">{t.feed.title}</h2>
        {posts.length > 0 ? <span className="feedPostCount">{posts.length}</span> : null}
      </div>

      {viewer ? (
        <form className="newPostWrap" onSubmit={(e) => void handleSubmit(e)}>
          <div className="newPostFormRow">
            <div className="newPostAvatar avatarStub" aria-hidden>
              {viewer.avatarUrl ? (
                <Image src={viewer.avatarUrl} alt="" width={36} height={36} className="avatarPhoto" unoptimized />
              ) : (
                <span className="avatarFallbackIcon" />
              )}
            </div>
            <div className="newPostRight">
              <textarea
                ref={textareaRef}
                className="newPostTextarea"
                placeholder={t.feed.textareaPlaceholder}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1000}
                rows={3}
                aria-label={t.feed.textareaAriaLabel}
              />
              {photoPreview ? (
                <div className="newPostPhotoPreview">
                  {/* blob preview — can't use Next.js Image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt={t.feed.photoPreviewAlt} className="newPostPhotoPreviewImg" />
                  <button type="button" className="newPostPhotoRemove" onClick={removePhoto} aria-label={t.feed.removePhotoLabel}>
                    <CloseSmIcon />
                  </button>
                </div>
              ) : null}
              {submitError ? <p className="feedSubmitError">{submitError}</p> : null}
              <div className="newPostActions">
                <button type="button" className="newPostPhotoBtn" onClick={() => fileInputRef.current?.click()} aria-label={t.feed.addPhotoLabel}>
                  <CameraIcon />
                  {t.feed.photoBtn}
                </button>
                <button type="submit" className="newPostSubmitBtn" disabled={!body.trim() || submitting}>
                  {submitting ? t.feed.savingBtn : t.feed.saveBtn}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="newPostFileInput"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </form>
      ) : (
        <p className="feedLoginPrompt">
          <a href={`/signin?next=${encodeURIComponent(`/show/${showId}`)}`}>{t.feed.loginPromptLink}</a>{" "}
          {t.feed.loginPromptText}
        </p>
      )}

      {loading ? (
        <p className="feedEmpty">{t.feed.loadingPosts}</p>
      ) : posts.length === 0 ? (
        <p className="feedEmpty">{t.feed.emptyPosts}</p>
      ) : (
        <ul className="feedList">
          {posts.map((post) => (
            <li key={post.id} className="feedPost">
              <div className="feedPostHeader">
                <div className="feedPostAvatar avatarStub" aria-hidden>
                  {post.userAvatarUrl ? (
                    <Image src={post.userAvatarUrl} alt="" width={40} height={40} className="avatarPhoto" unoptimized />
                  ) : (
                    <span className="avatarFallbackIcon" />
                  )}
                </div>
                <div className="feedPostAuthor">
                  <p className="feedPostAuthorName">{post.userDisplayName}</p>
                  <span className="feedPostDate">{formatPostDate(post.createdAt)}</span>
                </div>
                {viewer?.id === post.userId ? (
                  confirmDeleteId === post.id ? (
                    <div className="feedPostDeleteConfirm">
                      <span className="feedPostDeleteLabel">{t.feed.deleteConfirmLabel}</span>
                      <button
                        type="button"
                        className="feedPostDeleteYes"
                        onClick={() => void deletePost(post.id)}
                        aria-label={t.feed.deleteConfirmAriaLabel}
                      >
                        {t.feed.deleteYes}
                      </button>
                      <button
                        type="button"
                        className="feedPostDeleteNo"
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label={t.feed.deleteCancelAriaLabel}
                      >
                        {t.feed.deleteNo}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="feedPostDeleteBtn"
                      onClick={() => setConfirmDeleteId(post.id)}
                      aria-label={t.feed.deleteAriaLabel}
                    >
                      <TrashIcon />
                    </button>
                  )
                ) : null}
              </div>

              {post.photoUrl ? (
                <div className="feedPostPhoto">
                  <Image src={post.photoUrl} alt={t.feed.photoAlt(post.userDisplayName)} fill sizes="(max-width: 720px) 100vw, 430px" style={{ objectFit: "cover" }} loading="lazy" />
                </div>
              ) : null}

              <p className="feedPostBody">{post.body}</p>

              <div className="feedPostActions">
                <button
                  type="button"
                  className={`feedPostAction feedPostLikeBtn${post.viewerLiked ? " isLiked" : ""}${burstingId === post.id ? " isBursting" : ""}`}
                  onClick={() => void toggleLike(post.id)}
                  aria-pressed={post.viewerLiked}
                  aria-label={post.viewerLiked ? t.feed.rockOffAriaLabel : t.feed.rockOnAriaLabel}
                >
                  <span className="rockBurstWrap">
                    <RockOnIcon filled={post.viewerLiked} />
                    <span className="rockBurstSpark rockBurstSpark1" aria-hidden />
                    <span className="rockBurstSpark rockBurstSpark2" aria-hidden />
                    <span className="rockBurstSpark rockBurstSpark3" aria-hidden />
                    <span className="rockBurstSpark rockBurstSpark4" aria-hidden />
                    <span className="rockBurstSpark rockBurstSpark5" aria-hidden />
                    <span className="rockBurstSpark rockBurstSpark6" aria-hidden />
                  </span>
                  {post.likeCount > 0 ? <span className="feedPostLikeCount">{post.likeCount}</span> : null}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RockOnIcon({ filled }: { filled?: boolean }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="iconSvg rockOnIcon">
        <path
          d="M8 2.6a2 2 0 0 0-4 0v9.3a2 2 0 0 0-2.5 1.8c0 .54.21 1.04.56 1.4l3.5 3.6A6.6 6.6 0 0 0 10.3 21H14a6 6 0 0 0 6-6V5.5a2 2 0 0 0-4 0v6.1h-.8V5.6c0-.05 0-.1-.01-.16V5.4a1.7 1.7 0 0 0-3.39 0v6.2h-.8V8.2a1.7 1.7 0 0 0-3.4 0v3.4H8V2.6Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="iconSvg rockOnIcon">
      <path
        d="M6 2.6a2 2 0 0 1 4 0V11h.6V8.2a1.7 1.7 0 0 1 3.4 0V11h.6V5.4a1.7 1.7 0 0 1 3.4 0V11h.6V5.5a2 2 0 0 1 4 0V15a6 6 0 0 1-6 6h-3.7a6.6 6.6 0 0 1-4.74-2.3l-3.5-3.6A2 2 0 0 1 1.5 13.7 2 2 0 0 1 4 11.9V2.6Zm1.4 9.6V2.6a.6.6 0 0 1 1.2 0v9.6H7.4Zm4 0V8.2a.3.3 0 0 1 .6 0v4H11.4Zm4 0v-6.8a.3.3 0 0 1 .6 0v6.8h-.6Zm4 0V5.5a.6.6 0 0 1 1.2 0V15a4.6 4.6 0 0 1-4.6 4.6h-3.7a5.2 5.2 0 0 1-3.74-1.85l-3.5-3.6a.6.6 0 0 1 .9-.8l3.05 3.13a.7.7 0 0 0 1.1-.16.7.7 0 0 0-.1-.84l-.06-.06H19.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="iconSvg">
      <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4z" fill="currentColor" />
      <path
        d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloseSmIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="iconSvg">
      <path
        d="m18.3 5.71-1.41-1.42L12 9.17 7.11 4.29 5.7 5.71 10.59 10.6 5.7 15.49l1.41 1.41L12 12l4.89 4.9 1.41-1.41-4.89-4.89 4.89-4.89Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="iconSvg">
      <path
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"
        fill="currentColor"
      />
    </svg>
  );
}
