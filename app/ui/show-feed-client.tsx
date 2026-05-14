"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Viewer } from "@/lib/show-types";
import { formatPostDate } from "@/lib/show-utils";

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
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
        if (uploadError) throw new Error("Falha ao enviar foto. Tente novamente.");
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
      if (!res.ok) throw new Error(data.error ?? "Falha ao publicar");

      if (data.post) setPosts((prev) => [data.post!, ...prev]);
      setBody("");
      removePhoto();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Falha ao publicar");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(postId: string) {
    if (!viewer) {
      window.location.href = `/signin?next=${encodeURIComponent(`/show/${showId}`)}`;
      return;
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

  function focusNewPost() {
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    textareaRef.current?.focus();
  }

  async function sharePost(post: Post) {
    const url = `${window.location.origin}/show/${encodeURIComponent(showId)}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text: post.body, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <section className="showFeed">
      <div className="feedSectionHeader">
        <h2 className="feedSectionTitle">Comunidade</h2>
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
                placeholder="O que você achou do show? Compartilhe sua memória..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1000}
                rows={3}
                aria-label="Novo relato do show"
              />
              {photoPreview ? (
                <div className="newPostPhotoPreview">
                  {/* blob preview — can't use Next.js Image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Preview da foto" className="newPostPhotoPreviewImg" />
                  <button type="button" className="newPostPhotoRemove" onClick={removePhoto} aria-label="Remover foto">
                    <CloseSmIcon />
                  </button>
                </div>
              ) : null}
              {submitError ? <p className="feedSubmitError">{submitError}</p> : null}
              <div className="newPostActions">
                <button type="button" className="newPostPhotoBtn" onClick={() => fileInputRef.current?.click()} aria-label="Adicionar foto">
                  <CameraIcon />
                  Foto
                </button>
                <button type="submit" className="newPostSubmitBtn" disabled={!body.trim() || submitting}>
                  {submitting ? "Publicando..." : "Publicar"}
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
          <a href={`/signin?next=${encodeURIComponent(`/show/${showId}`)}`}>Entre</a> para compartilhar sua experiência no show.
        </p>
      )}

      {loading ? (
        <p className="feedEmpty">Carregando relatos...</p>
      ) : posts.length === 0 ? (
        <p className="feedEmpty">Nenhum relato ainda. Seja o primeiro a compartilhar!</p>
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
              </div>

              {post.photoUrl ? (
                <div className="feedPostPhoto">
                  <Image src={post.photoUrl} alt="Foto do show" fill sizes="(max-width: 720px) 100vw, 430px" style={{ objectFit: "cover" }} loading="lazy" />
                </div>
              ) : null}

              <p className="feedPostBody">{post.body}</p>

              <div className="feedPostActions">
                <button
                  type="button"
                  className={`feedPostAction${post.viewerLiked ? " isLiked" : ""}`}
                  onClick={() => void toggleLike(post.id)}
                  aria-pressed={post.viewerLiked}
                  aria-label={post.viewerLiked ? "Descurtir" : "Curtir"}
                >
                  <HeartIcon filled={post.viewerLiked} />
                  {post.likeCount > 0 ? `Curtir ${post.likeCount}` : "Curtir"}
                </button>
                <button type="button" className="feedPostAction" onClick={focusNewPost} aria-label="Comentar">
                  <CommentIcon />
                  Comentar
                </button>
                <button type="button" className="feedPostAction" onClick={() => void sharePost(post)} aria-label="Compartilhar">
                  <ShareIcon />
                  Compartilhar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="iconSvg">
      {filled ? (
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill="currentColor"
        />
      ) : (
        <path
          d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"
          fill="currentColor"
        />
      )}
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="iconSvg">
      <path
        d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"
        fill="currentColor"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="iconSvg">
      <path
        d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"
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
