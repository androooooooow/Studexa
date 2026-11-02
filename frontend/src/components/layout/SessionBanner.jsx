import React, { useState } from 'react';
import { ShieldAlert, Info, X } from 'lucide-react';

export default function SessionBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-amber-700" />
          <p>
            <strong>Anonymous Browser Workspace:</strong> No signup or login is required. Your
            uploaded documents, study materials, and progress are privately tied to this browser’s
            anonymous session token. Clearing browser site data or switching devices will start a
            new workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded p-1 text-amber-700 hover:bg-amber-100"
          aria-label="Dismiss session notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
