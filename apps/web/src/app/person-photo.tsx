"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const maxPhotoBytes = 5 * 1024 * 1024;
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

interface PersonPhotoUpdatedDetail {
  kind: "students" | "teachers";
  personId: string;
  hasPhoto: boolean;
}

export function PersonPhotoAvatar({
  kind,
  personId,
  personName,
  hasPhoto: initialHasPhoto,
}: {
  kind: "students" | "teachers";
  personId: string;
  personName: string;
  hasPhoto: boolean;
}) {
  const [hasPhoto, setHasPhoto] = useState(initialHasPhoto);
  const [imageUrl, setImageUrl] = useState("");
  const containerRef = useRef<HTMLSpanElement>(null);
  const imageUrlRef = useRef("");
  const [visible, setVisible] = useState(false);
  const photoUrl = `${apiUrl}/${kind}/${personId}/photo`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onPhotoUpdated(event: Event) {
      const detail = (event as CustomEvent<PersonPhotoUpdatedDetail>).detail;
      if (detail.kind === kind && detail.personId === personId) {
        if (!detail.hasPhoto && imageUrlRef.current) {
          URL.revokeObjectURL(imageUrlRef.current);
          imageUrlRef.current = "";
          setImageUrl("");
        }
        setHasPhoto(detail.hasPhoto);
      }
    }
    window.addEventListener("klassapp:person-photo-updated", onPhotoUpdated);
    return () => window.removeEventListener("klassapp:person-photo-updated", onPhotoUpdated);
  }, [kind, personId]);

  useEffect(() => {
    if (!visible || !hasPhoto) {
      if (!hasPhoto) {
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = "";
      }
      return;
    }
    const controller = new AbortController();
    async function loadPhoto() {
      try {
        const response = await fetch(photoUrl, {
          credentials: "include",
          signal: controller.signal,
        });
        if (response.status === 404) {
          setHasPhoto(false);
          return;
        }
        if (!response.ok) return;
        const url = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = url;
        setImageUrl(url);
      } catch {
        if (!controller.signal.aborted) {
          setImageUrl("");
        }
      }
    }
    void loadPhoto();
    return () => controller.abort();
  }, [hasPhoto, photoUrl, visible]);

  useEffect(() => () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
  }, []);

  return (
    <span
      className={kind === "students" ? "student-avatar" : "teacher-avatar"}
      aria-hidden="true"
      ref={containerRef}
    >
      {imageUrl ? (
        // The image is fetched with the session cookie and kept in a local object URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={imageUrl} />
      ) : (
        personName.charAt(0).toUpperCase()
      )}
    </span>
  );
}

interface PersonPhotoProps {
  kind: "students" | "teachers";
  personId: string;
  personName: string;
  editable: boolean;
  actionsTarget?: HTMLElement | null;
}

export function PersonPhoto({
  kind,
  personId,
  personName,
  editable,
  actionsTarget = null,
}: PersonPhotoProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoAuthorizationConfirmed, setPhotoAuthorizationConfirmed] = useState(false);
  const [authorizationChecked, setAuthorizationChecked] = useState(false);
  const [pendingPhotoAction, setPendingPhotoAction] = useState<"camera" | "upload" | null>(null);
  const [showUploadHelp, setShowUploadHelp] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef("");
  const photoLoadRef = useRef<AbortController | null>(null);
  const photoUrl = `${apiUrl}/${kind}/${personId}/photo`;

  useEffect(() => {
    const controller = new AbortController();
    photoLoadRef.current = controller;
    let activeUrl = "";

    async function loadPhoto() {
      try {
        const response = await fetch(photoUrl, {
          credentials: "include",
          signal: controller.signal,
        });
        if (response.status === 404) {
          return;
        }
        if (!response.ok) {
          throw new Error("Não foi possível carregar a foto.");
        }
        const blob = await response.blob();
        activeUrl = URL.createObjectURL(blob);
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = activeUrl;
        setImageUrl(activeUrl);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Não foi possível carregar a foto.",
          );
        }
      }
    }

    void loadPhoto();
    return () => {
      controller.abort();
      if (photoLoadRef.current === controller) photoLoadRef.current = null;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
      if (imageUrlRef.current && imageUrlRef.current !== activeUrl) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
      imageUrlRef.current = "";
    };
  }, [photoUrl]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este dispositivo ou navegador não oferece acesso à webcam.");
      return;
    }
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      setStream(cameraStream);
      setCameraOpen(true);
    } catch {
      setError("Não foi possível acessar a webcam. Verifique a conexão e a permissão do navegador.");
    }
  }

  function requestPhotoAction(action: "camera" | "upload") {
    setError("");
    setShowUploadHelp(action === "upload");
    if (kind === "students" && !photoAuthorizationConfirmed) {
      setPendingPhotoAction(action);
      setAuthorizationChecked(false);
      return;
    }
    if (action === "camera") void startCamera();
    else fileRef.current?.click();
  }

  function confirmPhotoAuthorization() {
    if (!authorizationChecked || !pendingPhotoAction) return;
    const action = pendingPhotoAction;
    setPhotoAuthorizationConfirmed(true);
    setPendingPhotoAction(null);
    setAuthorizationChecked(false);
    if (action === "camera") void startCamera();
    else fileRef.current?.click();
  }

  function cancelPhotoAuthorization() {
    setPendingPhotoAction(null);
    setAuthorizationChecked(false);
  }

  function closeCamera() {
    setCameraOpen(false);
    setStream(null);
  }

  async function uploadPhoto(blob: Blob) {
    if (!allowedTypes.includes(blob.type)) {
      setError("Escolha uma foto JPEG, PNG ou WebP.");
      return;
    }
    if (blob.size === 0 || blob.size > maxPhotoBytes) {
      setError("A foto deve ter no máximo 5 MB.");
      return;
    }
    photoLoadRef.current?.abort();
    setError("");
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(blob);
      if (bitmap.width > 8000 || bitmap.height > 8000) {
        bitmap.close();
        throw new Error("A imagem deve ter no máximo 8.000 pixels por lado.");
      }
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("Não foi possível preparar a imagem.");
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const optimizedPhoto = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.88),
      );
      if (!optimizedPhoto || optimizedPhoto.size > maxPhotoBytes) {
        throw new Error("Não foi possível preparar uma foto JPEG de até 5 MB.");
      }
      const response = await fetch(photoUrl, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": optimizedPhoto.type,
          ...(kind === "students" && photoAuthorizationConfirmed
            ? { "X-Photo-Authorization-Confirmed": "true" }
            : {}),
        },
        body: optimizedPhoto,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : "Não foi possível salvar a foto.",
        );
      }
      replacePhotoUrl(URL.createObjectURL(optimizedPhoto));
      setShowUploadHelp(false);
      window.dispatchEvent(new CustomEvent<PersonPhotoUpdatedDetail>(
        "klassapp:person-photo-updated",
        { detail: { kind, personId, hasPhoto: true } },
      ));
      closeCamera();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível salvar a foto.");
    } finally {
      setBusy(false);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("Aguarde a imagem da webcam aparecer antes de capturar.");
      return;
    }
    const canvas = document.createElement("canvas");
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Não foi possível preparar a imagem da webcam.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) void uploadPhoto(blob);
      else setError("Não foi possível capturar a foto.");
    }, "image/jpeg", 0.88);
  }

  async function deletePhoto() {
    setError("");
    setShowUploadHelp(false);
    setBusy(true);
    try {
      const response = await fetch(photoUrl, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Não foi possível remover a foto.");
      }
      replacePhotoUrl("");
      window.dispatchEvent(new CustomEvent<PersonPhotoUpdatedDetail>(
        "klassapp:person-photo-updated",
        { detail: { kind, personId, hasPhoto: false } },
      ));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível remover a foto.");
    } finally {
      setBusy(false);
    }
  }

  function replacePhotoUrl(url: string) {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = url;
    setImageUrl(url);
  }

  const photoActions = editable && !cameraOpen ? (
    <div
      className={`person-photo-actions${actionsTarget ? " person-photo-actions-footer" : ""}`}
      aria-label="Ações da foto"
      role="group"
    >
      {actionsTarget && <span className="person-photo-actions-label">Foto</span>}
      <input
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadPhoto(file);
          event.target.value = "";
        }}
        ref={fileRef}
        type="file"
      />
      <button
        aria-label="Usar webcam"
        disabled={busy}
        onClick={() => requestPhotoAction("camera")}
        title="Usar webcam"
        type="button"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h8A1.5 1.5 0 0 1 15 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 15.5v-7Z" />
          <path d="m15 10 5-2v8l-5-2" />
        </svg>
        {actionsTarget && <span>Webcam</span>}
      </button>
      <button
        aria-label="Enviar foto"
        disabled={busy}
        onClick={() => requestPhotoAction("upload")}
        title="Enviar foto"
        type="button"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
          <path d="M5 14.5v3A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-3" />
        </svg>
        {actionsTarget && <span>Subir foto</span>}
      </button>
      {imageUrl && (
        <button
          aria-label="Remover foto"
          disabled={busy}
          onClick={() => void deletePhoto()}
          title="Remover foto"
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path d="M4 7h16" />
            <path d="M10 11v6m4-6v6" />
            <path d="m5 7 1 13h12l1-13M9 7V4h6v3" />
          </svg>
          {actionsTarget && <span>Remover foto</span>}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="person-photo">
      <div className="person-photo-frame">
        {cameraOpen ? (
          <video autoPlay playsInline ref={videoRef} />
        ) : imageUrl ? (
          // The image is fetched with the session cookie and kept in a local object URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`Foto de ${personName}`} src={imageUrl} />
        ) : (
          <span aria-hidden="true">{personName.trim().charAt(0).toUpperCase() || "?"}</span>
        )}
        {!actionsTarget && photoActions}
      </div>
      {actionsTarget && photoActions && createPortal(photoActions, actionsTarget)}
      {pendingPhotoAction && (
        <div className="photo-authorization-prompt" aria-live="polite">
          <label className="photo-authorization">
            <input
              checked={authorizationChecked}
              onChange={(event) => setAuthorizationChecked(event.target.checked)}
              type="checkbox"
            />
            <span>Confirmo que a escola possui autorização documentada do responsável para armazenar esta imagem.</span>
          </label>
          <div className="photo-authorization-actions">
            <button
              disabled={!authorizationChecked}
              onClick={confirmPhotoAuthorization}
              type="button"
            >
              Confirmar
            </button>
            <button onClick={cancelPhotoAuthorization} type="button">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {cameraOpen && (
        <div className="camera-capture">
          <div>
            <button disabled={busy} onClick={capturePhoto} type="button">
              {busy ? "Salvando..." : "Capturar foto"}
            </button>
            <button disabled={busy} onClick={closeCamera} type="button">Cancelar</button>
          </div>
        </div>
      )}
      {showUploadHelp && (
        <p className="person-photo-help" role="status">
          JPEG, PNG ou WebP · até 5 MB
        </p>
      )}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
    </div>
  );
}
