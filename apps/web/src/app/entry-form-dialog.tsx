"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

interface EntryFormDialogProps {
  titleId: string;
  title: string;
  eyebrow: string;
  icon: string;
  description: string;
  onClose: () => void;
  isBusy: boolean;
  className?: string;
  children: ReactNode;
}

export function EntryFormDialog({
  titleId,
  title,
  eyebrow,
  icon,
  description,
  onClose,
  isBusy,
  className = "",
  children,
}: EntryFormDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !isBusy) {
      onClose();
    }
  }

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !isBusy) {
      onClose();
    }
  }

  return (
    <div
      className="profile-backdrop"
      onKeyDown={closeOnEscape}
      onMouseDown={closeOnBackdrop}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`entry-form-dialog ${className}`.trim()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label={`Fechar ${title.toLowerCase()}`}
          className="profile-close"
          disabled={isBusy}
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <div className="class-panel-heading">
          <div className="setup-icon" aria-hidden="true">{icon}</div>
          <div>
            <p className="card-kicker">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}
